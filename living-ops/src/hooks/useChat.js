import { useState, useRef } from 'react'
import { apiPost, esc, STAFF_KEY } from '../utils/api.js'
import { actions, useStore } from './useStore.js'
import { buildLiveContext } from './useApi.js'

export function useChat() {
  const [typing, setTyping] = useState(false)
  const pendingPdf = useRef({ data: null, name: null })
  const pulseCache = useStore(s => s.pulseCache)
  const portalsCache = useStore(s => s.portalsCache)
  const chatHistory = useStore(s => s.chatHistory)

  function clearPdf() {
    pendingPdf.current = { data: null, name: null }
  }

  function setPdf(data, name) {
    pendingPdf.current = { data, name }
  }

  function getPdf() {
    return pendingPdf.current
  }

  async function sendChat(msg) {
    if (!msg && !pendingPdf.current.data) return null

    actions.pushChatMessage('user', msg)
    setTyping(true)

    const recentHistory = chatHistory
      .slice(-7, -1)
      .map(m => ({ role: m.role === 'rita' ? 'rita' : 'user', content: m.content }))
      .filter(m => m?.content && String(m.content).trim())

    try {
      let json
      const hasPdf = Boolean(pendingPdf.current.data)

      if (hasPdf) {
        const pdfRes = await fetch('/api/upload-rooming', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + STAFF_KEY },
          body: JSON.stringify({
            pdfData: pendingPdf.current.data,
            fileName: pendingPdf.current.name || 'rooming.pdf',
            groupHint: msg || ''
          })
        })
        const pdfData = await pdfRes.json().catch(() => ({}))
        if (!pdfRes.ok) throw new Error(pdfData.error || 'HTTP ' + pdfRes.status)
        if (pdfData.ok) {
          json = { reply: '✅ Руминг сохранён в базу. Группа: ' + (pdfData.groupName || '?') + ' · ' + (pdfData.totalRooms || '?') + ' комнат · ' + (pdfData.totalGuests || '?') + ' гостей.' }
        } else if (pdfData.unmatched) {
          json = { reply: '⚠️ Группа не найдена автоматически. ' + (pdfData.message || 'Укажи Prod ID группы.') }
        } else {
          throw new Error(pdfData.error || 'Ошибка обработки PDF')
        }
        clearPdf()
      } else {
        const fullLive = buildLiveContext(pulseCache, portalsCache)
        const payloadSize = JSON.stringify({ message: msg, history: recentHistory }).length
        const liveData = payloadSize > 8000
          ? { portals: fullLive.portals, today: fullLive.today, sharedSpaces: fullLive.sharedSpaces }
          : fullLive
        json = await apiPost('/api/rita-chat', { message: msg, history: recentHistory, liveData })
      }

      const reply = json.reply || 'Приняла.'
      actions.pushChatMessage('rita', reply)

      // Handle showCards from Rita
      const cardsToShow = json.showCards || (json.showCard ? [json.showCard] : null)
      if (cardsToShow?.length) {
        cardsToShow.forEach((sc, i) => {
          const key = 'rita_' + Date.now() + '_' + i
          const contactLabel = sc.contact
            ? sc.contact + (sc.contactPhone ? ' · ' + sc.contactPhone : '')
            : null
          setTimeout(() => {
            actions.addDynamicCard(key, {
              eyebrow: sc.eyebrow || 'РИТА',
              title: sc.title || 'Карточка',
              recipients: contactLabel ? ['Рите', contactLabel] : ['Рите'],
              rows: (sc.rows || []).map(r =>
                Array.isArray(r)
                  ? [String(r[0] || ''), String(r[1] || ''), String(r[2] || '')]
                  : [String(r), '', '']
              ),
              note: sc.note || ''
            })
          }, i * 80)
        })
      }

      return reply
    } catch (err) {
      const errMsg = 'Ошибка — ' + err.message
      actions.pushChatMessage('rita', errMsg)
      return null
    } finally {
      setTyping(false)
    }
  }

  return { sendChat, typing, setPdf, getPdf, clearPdf }
}
