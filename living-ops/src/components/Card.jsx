import { useState, useEffect, useRef } from 'react'
import { useStore, actions } from '../hooks/useStore.js'
import { useApi } from '../hooks/useApi.js'
import { apiPost, esc, isTag } from '../utils/api.js'
import { getInitialCards, R } from '../data/cards.js'
import { applyPulseToCard, applyArrivalsToCard, applyRisksToCard } from './cardUpdaters.js'

function renderValue(v) {
  if (isTag(v)) {
    return <span className={`tag ${v.cls}`}>{v.text}</span>
  }
  return String(v ?? '')
}

function Row({ row }) {
  if (!Array.isArray(row) || !row.length) return null
  const [k, v, s] = row
  return (
    <div className="row">
      <div className="k">{String(k || '')}</div>
      <div className="v">
        {renderValue(v)}
        {s ? <small> · {renderValue(s)}</small> : null}
      </div>
    </div>
  )
}

export default function Card({ cardKey, hidden }) {
  const pulseCache = useStore(s => s.pulseCache)
  const portalsCache = useStore(s => s.portalsCache)
  const { loadPulseData, getLive } = useApi()

  const baseCards = getInitialCards()
  const dynamicCards = window.__dynamicCards || {}
  const baseKey = cardKey.startsWith('arrivals-') ? 'arrivals' : cardKey
  const portalId = cardKey.startsWith('arrivals-') ? cardKey.replace('arrivals-', '') : null
  const initialDef = baseCards[baseKey] || dynamicCards[cardKey] || {
    eyebrow: cardKey,
    title: cardKey,
    rows: [],
    note: '',
    recipients: [R]
  }

  const [cardData, setCardData] = useState(initialDef)
  const [loading, setLoading] = useState(initialDef.live || false)
  const [logLines, setLogLines] = useState([])
  const [hasLog, setHasLog] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [sendingMsg, setSendingMsg] = useState(false)
  const [msgInput, setMsgInput] = useState('')
  const [selectedRcpt, setSelectedRcpt] = useState((initialDef.recipients || [R])[0])
  const [resolved, setResolved] = useState(false)
  const [isToday, setIsToday] = useState(false)

  const cardRef = useRef(null)
  const dragRef = useRef({ on: false, ox: 0, oy: 0 })
  const inputRef = useRef(null)
  const loaded = useRef(false)

  // Card-specific drag
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const head = card.querySelector('.card-head')
    if (!head) return

    let placeholder = null
    let dragging = false
    let ox = 0, oy = 0

    function onDown(e) {
      if (e.target.closest('[data-act]')) return
      const rect = card.getBoundingClientRect()
      placeholder = document.createElement('div')
      placeholder.style.cssText = `width:${rect.width}px;height:${rect.height}px;flex:none;border-radius:20px;`
      card.parentNode.insertBefore(placeholder, card.nextSibling)
      ox = e.clientX - rect.left
      oy = e.clientY - rect.top
      card.style.position = 'fixed'
      card.style.left = rect.left + 'px'
      card.style.top = rect.top + 'px'
      card.style.width = rect.width + 'px'
      card.style.zIndex = '60'
      card.style.margin = '0'
      head.style.cursor = 'grabbing'
      dragging = true
      e.preventDefault()
    }

    function onMove(e) {
      if (!dragging) return
      const panelW = document.body.getAttribute('data-panel') === 'open' ? 440 : 0
      let nx = Math.max(4, Math.min(e.clientX - ox, window.innerWidth - panelW - card.offsetWidth - 4))
      let ny = Math.max(4, e.clientY - oy)
      card.style.left = nx + 'px'
      card.style.top = ny + 'px'
    }

    function onUp() {
      if (!dragging) return
      dragging = false
      head.style.cursor = 'move'
      card.style.position = 'relative'
      card.style.left = ''
      card.style.top = ''
      card.style.width = ''
      card.style.zIndex = '12'
      card.style.margin = ''
      if (placeholder?.parentNode) placeholder.parentNode.removeChild(placeholder)
      placeholder = null
    }

    head.addEventListener('mousedown', onDown)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      head.removeEventListener('mousedown', onDown)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  // Load live data on mount
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    if (!initialDef.live) return

    async function fetchLive() {
      setLoading(true)
      try {
        let cache = window.__getState?.()?.pulseCache
        if (!cache) {
          cache = await loadPulseData()
        }
        const portals = window.__getState?.()?.portalsCache || []

        if (cardKey === 'pulse') {
          setCardData(d => applyPulseToCard(d, cache))
        } else if (baseKey === 'arrivals') {
          const result = applyArrivalsToCard(initialDef, cache, portals, portalId)
          setCardData(result.data)
          setIsToday(result.isToday)
        } else if (cardKey === 'risks') {
          setCardData(d => applyRisksToCard(d, cache))
        }
      } catch (err) {
        setCardData(d => ({ ...d, note: 'Could not load: ' + err.message }))
      } finally {
        setLoading(false)
      }
    }
    fetchLive()
  }, [])

  // Re-run when cache updates
  useEffect(() => {
    if (!initialDef.live || !pulseCache) return
    if (cardKey === 'pulse') setCardData(d => applyPulseToCard(d, pulseCache))
    if (cardKey === 'risks') setCardData(d => applyRisksToCard(d, pulseCache))
  }, [pulseCache])

  useEffect(() => {
    if (!initialDef.live || !portalsCache || !pulseCache) return
    if (baseKey === 'arrivals') {
      const result = applyArrivalsToCard(initialDef, pulseCache, portalsCache, portalId)
      setCardData(result.data)
      setIsToday(result.isToday)
    }
  }, [portalsCache, pulseCache])

  function addLog(cls, content) {
    setLogLines(l => [...l, { cls, content, id: Date.now() + Math.random() }])
    setHasLog(true)
  }

  async function handleSend() {
    const msg = msgInput.trim()
    if (!msg) return
    setMsgInput('')
    setSendingMsg(true)
    addLog('you', <><b>Вы → <span className="to">{selectedRcpt}</span>:</b> {msg}</>)

    const liveCtx = getLive()
    const cardTitle = cardData.title
    const routed = selectedRcpt === R
      ? '[Карточка: ' + cardTitle + '] ' + msg
      : '[Карточка: ' + cardTitle + '] [→ ' + selectedRcpt + '] ' + msg

    try {
      const json = await apiPost('/api/rita-chat', {
        message: routed,
        history: [],
        liveData: { ...liveCtx, currentCard: cardTitle }
      })
      addLog('rita', <><b>Рита:</b> {json.reply || 'Приняла.'}</>)
      setExpanded(true)
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 50)
    } catch (err) {
      addLog('rita', <><b>Рита:</b> {'Ошибка — ' + err.message}</>)
    } finally {
      setSendingMsg(false)
      inputRef.current?.focus()
    }
  }

  function handleResolve() {
    setResolved(true)
    if (typeof window.lfSetBubbleResolved === 'function') window.lfSetBubbleResolved(cardKey)
    apiPost('/api/rita-chat', {
      message: 'Задача закрыта: ' + cardData.title,
      history: [],
      liveData: getLive()
    }).then(json => {
      addLog('rita', <><b>Рита:</b> {json.reply || 'Приняла.'}</>)
    }).catch(() => {})
    setTimeout(() => actions.removeCard(cardKey), 2500)
  }

  const cls = [
    'card',
    isToday ? 'card-today' : '',
    hasLog ? 'has-log' : '',
    expanded ? 'expanded' : '',
    loading ? 'loading' : ''
  ].filter(Boolean).join(' ')

  const recipients = cardData.recipients || [R]

  return (
    <div
      ref={cardRef}
      className={cls}
      id={`card-${cardKey}`}
      data-key={cardKey}
      style={{ display: hidden ? 'none' : undefined }}
    >
      <div className="card-head">
        <div>
          {cardData.eyebrow && <div className="eyebrow">{cardData.eyebrow}</div>}
          <h3 id={`card-title-${cardKey}`}>{cardData.title}</h3>
        </div>
        <div className="ctrls">
          <button
            className="ic"
            data-act="min"
            type="button"
            title="Свернуть"
            onClick={() => {
              actions.minimizeCard(cardKey, cardData.title)
            }}
          >–</button>
          <button
            className="ic"
            data-act="close"
            type="button"
            title="Закрыть"
            onClick={() => {
              actions.removeCard(cardKey)
              if (typeof window.lfRestoreBubble === 'function') window.lfRestoreBubble(cardKey)
            }}
          >×</button>
        </div>
      </div>

      <div className="rows" id={`card-rows-${cardKey}`}>
        {(cardData.rows || []).map((row, i) => <Row key={i} row={row} />)}
      </div>

      {cardData.note && (
        <div className="note" id={`card-note-${cardKey}`}>{cardData.note}</div>
      )}

      <div className={`log${hasLog ? ' open' : ''}`}>
        {logLines.map(l => (
          <div key={l.id} className={`logline ${l.cls}`}>{l.content}</div>
        ))}
      </div>

      <div className="composer">
        <select
          aria-label="Кому"
          value={selectedRcpt}
          onChange={e => setSelectedRcpt(e.target.value)}
        >
          {recipients.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input
          ref={inputRef}
          placeholder="Написать…"
          aria-label="Сообщение"
          value={msgInput}
          onChange={e => setMsgInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend() } }}
        />
        <button
          className="send"
          data-act="send"
          type="button"
          disabled={sendingMsg}
          onClick={handleSend}
        >→</button>
      </div>

      {cardData.task && (
        <div className="task-row">
          <button
            className="resolve"
            data-act="resolve"
            type="button"
            disabled={resolved}
            onClick={handleResolve}
            style={resolved ? { color: 'var(--ok)', borderColor: 'var(--ok)' } : {}}
          >
            {resolved ? '✓ Решено — цветок жизни' : '✓ Задача закрыта'}
          </button>
        </div>
      )}
    </div>
  )
}
