let pendingPdfData = null
  let pendingPdfName = null

  async function sendChat() {
    const inp = document.getElementById('panelInput')
    const sendBtn = document.getElementById('panelSend')
    const msg = inp.value.trim()
    if (!msg && !pendingPdfData) return

    chatHistory.push({role: 'user', content: msg})
    addChatMsg('msg-you', esc(msg))
    saveChatHistory()
    inp.value = ''
    inp.style.height = 'auto'
    if (sendBtn) sendBtn.disabled = true
    showChatTyping()

    const recentHistory = (Array.isArray(chatHistory) ? chatHistory : [])
      .slice(0, -1)
      .slice(-6)
      .map((m) => ({role: m.role === 'rita' ? 'rita' : 'user', content: m.content}))
      .filter((m) => m && m.content && String(m.content).trim().length > 0)

    try {
      const hasPdf = Boolean(pendingPdfData)

      let json
      if (hasPdf) {
        // PDF goes to dedicated upload-rooming endpoint — lighter, no liveData
        const pdfRes = await fetch('/api/upload-rooming', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + STAFF_KEY
          },
          body: JSON.stringify({
            pdfData: pendingPdfData,
            fileName: pendingPdfName || 'rooming.pdf',
            groupHint: msg || ''
          })
        })
        const pdfData = await pdfRes.json().catch(() => ({}))
        if (!pdfRes.ok) {
          throw new Error(pdfData.error || ('HTTP ' + pdfRes.status))
        }
        if (pdfData.ok) {
          json = { reply: '✅ Руминг сохранён в базу. Группа: ' + (pdfData.groupName || '?') + ' · ' + (pdfData.totalRooms || '?') + ' комнат · ' + (pdfData.totalGuests || '?') + ' гостей.' }
        } else if (pdfData.unmatched) {
          json = { reply: '⚠️ Группа не найдена автоматически. ' + (pdfData.message || 'Укажи Prod ID группы.') }
        } else {
          throw new Error(pdfData.error || 'Ошибка обработки PDF')
        }
        // save clean message to history (not empty)
        const pdfMsgForHistory = msg || 'Загрузил руминг-лист'
        chatHistory.push({role: 'user', content: pdfMsgForHistory})
        chatHistory.push({role: 'rita', content: json.reply})
        saveChatHistory()
        // clear PDF
        pendingPdfData = null
        pendingPdfName = null
        const badge = document.getElementById('pdfBadge')
        const attachBtn = document.getElementById('panelAttach')
        if (badge) { badge.style.display = 'none'; badge.textContent = '' }
        if (attachBtn) attachBtn.classList.remove('has-file')
        const fileInput = document.getElementById('panelFile')
        if (fileInput) fileInput.value = ''
      } else {
        // Build compact liveData — omit heavy unitDetails when history is long
        const fullLive = buildLiveContext()
        const payloadSize = JSON.stringify({message: msg, history: recentHistory}).length
        const liveData = payloadSize > 8000
          ? {portals: fullLive.portals, today: fullLive.today, sharedSpaces: fullLive.sharedSpaces, staff: fullLive.staff}
          : fullLive
        json = await apiPost('/api/rita-chat', {
          message: msg,
          history: recentHistory,
          liveData
        })
      }
      hideChatTyping()
      const reply = json.reply || 'Приняла.'
      chatHistory.push({role: 'rita', content: reply})
      addChatMsg('msg-rita', '<b>Рита:</b> ' + esc(reply))
      saveChatHistory()

      // If Rita called show_cards — open cards on main field
      const cardsToShow = json.showCards || (json.showCard ? [json.showCard] : null)

      if (cardsToShow && cardsToShow.length) {
        cardsToShow.forEach(function(sc, i) {
          const key = 'rita_' + Date.now() + '_' + i
          const contactLabel = sc.contact
            ? sc.contact + (sc.contactPhone ? ' · ' + sc.contactPhone : '')
            : null
          CARDS[key] = {
            eyebrow: sc.eyebrow || 'РИТА',
            title: sc.title || 'Карточка',
            span: false,
            task: false,
            live: false,
            recipients: contactLabel ? [R, contactLabel] : [R],
            rows: (sc.rows || []).map(function(r) {
              if (Array.isArray(r)) return [String(r[0] || ''), String(r[1] || ''), String(r[2] || '')]
              return [String(r), '', '']
            }),
            note: sc.note || ''
          }
          setTimeout(function() {
            const cardHtml = renderCard(key, null, '')
            field.insertAdjacentHTML('beforeend', cardHtml)
            shown.push(key)
            const newCard = document.getElementById('card-' + key)
            if (newCard && typeof makeDraggableCard === 'function') makeDraggableCard(newCard)
          }, i * 80)
        })

        // scroll to top to show new cards (they're in flow now)
        setTimeout(function() {
          const ca = document.querySelector('.cards-area')
          if (ca) ca.scrollTo({top: 0, behavior: 'smooth'})
        }, cardsToShow.length * 80 + 200)
      }
    } catch (err) {
      hideChatTyping()
      addChatMsg('msg-rita', '<b>Рита:</b> ' + esc('Ошибка — ' + err.message))
    } finally {
      if (sendBtn) sendBtn.disabled = false
      inp.focus()
    }
  }





  field.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-act]')
    if (!btn) return
    const card = e.target.closest('.card')
    if (!card) return
    const key = card.getAttribute('data-key')
    const act = btn.getAttribute('data-act')
    if (act === 'min') minimize(key)
    else if (act === 'close') removeCard(key)
    else if (act === 'resolve') resolveCard(key)
    else if (act === 'send') sendMsg(key)
  })

  field.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return
    const inp = e.target.closest('.composer input')
    if (!inp) return
    e.preventDefault()
    sendMsg(e.target.closest('.card').getAttribute('data-key'))
  })



  /* --- Living Field bubbles + draggable summon --- */
  ;(function initLivingField() {