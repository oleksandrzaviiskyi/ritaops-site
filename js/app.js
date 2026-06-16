
(function () {
  'use strict'

  const STAFF_KEY = 'rita2026'
  const AUTH_HEADERS = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + STAFF_KEY
  }
  const R = 'Рите'
  const QUESTIONS_POLL_MS = 60000

  // Load chat history from localStorage
  let chatHistory = []
  try {
    const saved = localStorage.getItem('rita_chat_history_v2')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        // filter out empty messages
        chatHistory = parsed
          .filter(function(m) { return m && m.content && String(m.content).trim().length > 0 })
          .slice(-30)
      }
    }
  } catch(e) {}

  function saveChatHistory() {
    try { localStorage.setItem('rita_chat_history_v2', JSON.stringify(chatHistory.slice(-30))) } catch(e) {}
  }
  let questionsTimer = null
  let pulseCache = null
  let portalsCache = null

  const field = document.getElementById('field')
  const tray = document.getElementById('tray')
  const fieldTop = {style: {display: ''}}

  const chatArea = document.getElementById('chatArea')
  const shown = []

  function esc(s) {
    return String(s ?? '').replace(/[&<>]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]))
  }

  function tag(cls, text) {
    return '<span class="tag ' + cls + '">' + esc(text) + '</span>'
  }

  function isTag(s) {
    return typeof s === 'string' && s.indexOf('class="tag') > -1
  }

  function formatBalance(status) {
    if (!status) return '—'
    return String(status)
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ')
  }

  function fmtDate(iso) {
    if (!iso) return '—'
    const d = new Date(iso + 'T12:00:00')
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'})
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10)
  }

  function apiUrl(path) {
    const sep = path.includes('?') ? '&' : '?'
    return path + sep + 'key=' + encodeURIComponent(STAFF_KEY)
  }

  async function apiGet(path) {
    const res = await fetch(apiUrl(path), {headers: AUTH_HEADERS})
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (json.error || json.message || res.statusText || 'Request failed'))
    return json
  }

  async function apiPost(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({...body, staffKey: STAFF_KEY})
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (json.error || json.message || res.statusText || 'Request failed'))
    return json
  }

  const CARDS = {
    arrivals: {
      eyebrow: 'Arrivals',
      title: 'Groups today',
      span: false,
      task: false,
      live: true,
      recipients: [R, 'Groups'],
      rows: [['Loading', '…', '']],
      note: ''
    },
    kitchen: {
      eyebrow: 'Readiness',
      title: 'Restaurant & Bar',
      span: false,
      task: false,
      recipients: [R, 'Kitchen · Charina', 'Restaurant · Suleimi'],
      rows: [
        ['Kitchen', 'Charina', 'owns domain'],
        ['Restaurant', 'Suleimi', 'owns domain'],
        ['Menu', tag('attention', 'draft'), 'no group menu yet'],
        ['Bar stock', tag('faint', 'no data'), 'awaiting Poster POS']
      ],
      note: 'Live data coming soon.'
    },
    purchase: {
      eyebrow: 'Purchases · Diomedes',
      title: 'Purchase list · this week',
      span: false,
      task: true,
      recipients: [R, 'Purchases · Diomedes'],
      rows: [
        ['Coffee beans', '5 kg', tag('attention', 'low')],
        ['Plantains', '20 kg', 'for groups'],
        ['Bar tonic', '48 u', tag('attention', 'low')],
        ['Cleaning', '—', tag('ok', 'ok')]
      ],
      note: 'Live data coming soon.'
    },
    responsibility: {
      eyebrow: 'Who carries what',
      title: 'Responsibility',
      span: false,
      task: false,
      recipients: [R],
      rows: [
        ['Operations', 'Yasper · Alex', 'Steward'],
        ['Kitchen', 'Charina', 'Own'],
        ['Restaurant', 'Suleimi', 'Own'],
        ['Finance', 'Renate', 'Own'],
        ['Inventory', 'Diomedes', 'Own']
      ],
      note: 'Live data coming soon. Shift coverage not tracked yet.'
    },
    risks: {
      eyebrow: 'Needs watching',
      title: 'Risks',
      span: false,
      task: true,
      live: true,
      recipients: [R],
      rows: [['Open concerns', '…', '']],
      note: ''
    },
    pulse: {
      eyebrow: 'Today',
      title: 'Las Canas',
      span: false,
      task: false,
      live: true,
      recipients: [R],
      rows: [['Balance', '…', ''], ['Field', '…', '']],
      note: ''
    },
    bar: {
      eyebrow: 'Maintenance',
      title: 'Bar · кран',
      span: false,
      task: true,
      live: true,
      recipients: [R, 'Maintenance'],
      rows: [['Место', 'Bar', ''], ['Проблема', tag('attention', 'течёт кран'), 'обслуживание не начато']],
      note: ''
    }
  }

  function rowHtml(r) {
    if (!Array.isArray(r) || !r.length) return ''
    const v = isTag(r[1]) ? r[1] : esc(String(r[1] || ''))
    const s = r[2] ? ' <small>· ' + (isTag(r[2]) ? r[2] : esc(String(r[2]))) + '</small>' : ''
    return '<div class="row"><div class="k">' + esc(String(r[0] || '')) + '</div><div class="v">' + v + s + '</div></div>'
  }

  function renderCard(key, why, extraClass) {
    const d = CARDS[key]
    if (!d) return ''
    const rows = d.rows.map(rowHtml).join('')
    const recipients = d.recipients || [R]
    const opts = recipients.map((r) => '<option value="' + esc(r) + '">' + esc(r) + '</option>').join('')
    let h = '<div class="card' + (why ? ' woken' : '') + (extraClass ? ' ' + extraClass : '') + '" id="card-' + key + '" data-key="' + key + '">'
    h += '<div class="card-head"><div>'
    if (d.eyebrow) h += '<div class="eyebrow">' + esc(d.eyebrow) + '</div>'
    h += '<h3 id="card-title-' + key + '">' + esc(d.title) + '</h3></div>'
    h += '<div class="ctrls"><button class="ic" data-act="min" type="button" title="Свернуть">–</button>'
      + '<button class="ic" data-act="close" type="button" title="Закрыть">×</button></div></div>'
    if (why) h += '<div class="why" id="card-why-' + key + '">' + esc(why) + '</div>'
    else h += '<div class="why" id="card-why-' + key + '" hidden></div>'
    h += '<div class="rows" id="card-rows-' + key + '">' + rows + '</div>'
    h += '<div class="note" id="card-note-' + key + '">' + esc(d.note || '') + '</div>'
    h += '<div class="log" id="log-' + key + '"></div>'
    h += '<div class="composer"><select aria-label="Кому">' + opts + '</select>'
      + '<input placeholder="Написать…" aria-label="Сообщение">'
      + '<button class="send" data-act="send" type="button">→</button></div>'
    if (d.task) h += '<div class="task-row"><button class="resolve" data-act="resolve" type="button">✓ Задача закрыта</button></div>'
    h += '</div>'
    return h
  }

  function updateCardDom(key) {
    const d = CARDS[key]
    const titleEl = document.getElementById('card-title-' + key)
    const rowsEl = document.getElementById('card-rows-' + key)
    const noteEl = document.getElementById('card-note-' + key)
    const eyebrowEl = document.querySelector('#card-' + key + ' .eyebrow')
    if (titleEl) titleEl.textContent = d.title
    if (eyebrowEl) eyebrowEl.textContent = d.eyebrow
    if (rowsEl) rowsEl.innerHTML = d.rows.map(rowHtml).join('')
    if (noteEl) noteEl.textContent = d.note || ''
  }

  function setCardWhy(key, why) {
    const el = document.getElementById('card-why-' + key)
    if (!el) return
    if (why) {
      el.textContent = why
      el.hidden = false
      document.getElementById('card-' + key)?.classList.add('woken')
    } else {
      el.hidden = true
    }
  }

  async function loadPulseData() {
    try {
      console.log('[RITA] calling ops-pulse...')
      const data = await apiGet('/api/ops-pulse')
      console.log('[RITA] ops-pulse response keys:', Object.keys(data || {}))
      pulseCache = data
      console.log('[RITA] portals:', (data.portals || []).length, 'concerns:', (data.openConcerns || []).length)
      if (typeof lfRefreshBubblesFromLive === 'function') {
        console.log('[RITA] calling lfRefreshBubblesFromLive')
        lfRefreshBubblesFromLive()
      } else {
        console.log('[RITA] lfRefreshBubblesFromLive NOT FOUND on window')
      }
      return data
    } catch(err) {
      console.error('[RITA] loadPulseData ERROR:', err.message, err)
    }
  }

  function applyPulseToCard(data) {
    const pulse = data?.pulse || {}
    const concerns = Array.isArray(data?.concerns) ? data.concerns : []
    const balance = formatBalance(pulse.balanceStatus)
    const concernCount = concerns.length
    const fieldLabel = concernCount
      ? tag('attention', concernCount + ' open')
      : tag('ok', 'all clear')

    CARDS.pulse.eyebrow = 'Today · Pulse'
    CARDS.pulse.title = 'Las Canas Beach Retreat'
    CARDS.pulse.rows = [
      ['Balance', tag('ok', balance.toLowerCase()), 'hotel load tier'],
      ['Field', fieldLabel, concernCount ? 'open concerns' : 'no open concerns'],
      ['Concerns', String(concernCount), concernCount === 1 ? 'needs attention' : 'total open']
    ]
    CARDS.pulse.note = pulse.coherenceStatement?.trim() || ''
    updateCardDom('pulse')
  }

  async function refreshPulseCard() {
    const card = document.getElementById('card-pulse')
    if (card) card.classList.add('loading')
    try {
      const data = pulseCache || await loadPulseData()
      applyPulseToCard(data)
    } catch (err) {
      CARDS.pulse.note = 'Could not load pulse: ' + err.message
      updateCardDom('pulse')
    } finally {
      document.getElementById('card-pulse')?.classList.remove('loading')
    }
  }

  async function loadPortalsData() {
    const data = await apiGet('/api/portals')
    portalsCache = data.portals || []
    return portalsCache
  }

  function daysUntil(checkIn) {
    const d1 = new Date(todayIso() + 'T12:00:00')
    const d2 = new Date(checkIn + 'T12:00:00')
    return Math.round((d2 - d1) / 86400000)
  }

  function portalGroupId(portal) {
    if (portal.groupId) return portal.groupId
    const fromPulse = (pulseCache?.portals || []).find(function (p) {
      return p._id === portal._id || p.groupName === portal.groupName
    })
    return fromPulse?.groupId || null
  }

  function findRoomingList(group) {
    const lists = pulseCache?.roomingLists || []
    if (!group) return null
    const gid = portalGroupId(group)
    return lists.find(function (r) {
      return r.groupId === gid ||
        r.relatedGroupRef === group._id ||
        r.groupId === (group.groupName || '').replace(/\D/g, '').slice(-6)
    }) || null
  }

  function hasArrivalsToday(portals) {
    const today = todayIso()
    return (portals || []).some(function (p) {
      return p.checkIn === today && p.status !== 'cancelled'
    })
  }

  function syncArrivalsCardClass(portals) {
    const card = document.getElementById('card-arrivals')
    if (!card) return
    card.classList.toggle('card-today', hasArrivalsToday(portals))
  }

  function roomingStatusText(portal) {
    const core = portal.progressSections?.core ?? portal.progressPercent ?? 0
    if (core >= 80) return 'ready'
    if (core >= 40) return 'in progress'
    return 'pending'
  }

  function applyArrivalsToCard(portals) {
    const today = todayIso()

    const arriving    = portals.filter(function(p) { return p.checkIn === today && p.status !== 'cancelled' })
    const inHouse     = portals.filter(function(p) { return p.checkIn < today && p.checkOut >= today && p.status !== 'cancelled' })
    const checkingOut = portals.filter(function(p) { return p.checkOut === today && p.checkIn < today && p.status !== 'cancelled' })
    const upcoming    = portals.filter(function(p) {
      if (!p.checkIn || p.checkIn <= today || p.status === 'cancelled') return false
      var n = daysUntil(p.checkIn); return n >= 1 && n <= 5
    })

    const activeGroup = arriving[0] || inHouse[0] || checkingOut[0]

    if (!activeGroup && !upcoming.length) {
      var card = document.getElementById('card-arrivals')
      if (card) {
        card.classList.add('closing')
        setTimeout(function() {
          card.remove()
          var i = shown.indexOf('arrivals')
          if (i > -1) shown.splice(i, 1)
        }, 300)
      }
      return
    }

    if (activeGroup) {
      var g = activeGroup
      var isArriving    = g.checkIn === today
      var isCheckingOut = g.checkOut === today && g.checkIn < today
      var eyebrow, statusNote
      if (isArriving)    { eyebrow = 'ARRIVING TODAY · ' + fmtDate(today);  statusNote = 'check-in today' }
      else if (isCheckingOut) { eyebrow = 'CHECKOUT TODAY · ' + fmtDate(today); statusNote = 'checkout today' }
      else               { eyebrow = 'IN HOUSE · ' + fmtDate(today);         statusNote = 'until ' + fmtDate(g.checkOut) }

      var rooming = findRoomingList(g)
      var roomRows = []
      if (rooming && rooming.rooms) {
        rooming.rooms.slice(0, 8).forEach(function(rm) {
          var names = (rm.occupants || []).map(function(o) { return o.name }).join(', ')
          roomRows.push(['Room ' + (rm.roomNumber || ''), rm.roomType || '', names])
        })
      }
      var leaderRoom = rooming && rooming.rooms
        ? rooming.rooms.find(function(rm) { return rm.occupants && rm.occupants.length === 1 }) : null
      var leaderName = leaderRoom ? (leaderRoom.occupants[0].name || '') : ''
      var contactPhone = g.contactPhone || ''
      CARDS.arrivals.recipients = [R, leaderName ? leaderName + (contactPhone ? ' · ' + contactPhone : '') : 'Group Leader']
      CARDS.arrivals.eyebrow = eyebrow
      CARDS.arrivals.title = (g.groupName || g.title || 'Group') + ' · ' + (g.totalGuests || '—') + ' guests'
      CARDS.arrivals.rows = [
        ['Группа', g.groupName || g.title || 'Group', ''],
        ['Даты', fmtDate(g.checkIn) + ' → ' + fmtDate(g.checkOut), statusNote],
        ['Гости', String(g.totalGuests || '—'), ''],
        ['Лидер', leaderName || '—', contactPhone ? '📞 ' + contactPhone : ''],
        ['Руминг', rooming && rooming.rooms ? rooming.rooms.length + ' комнат' : tag('attention', 'не загружен'), '']
      ].concat(roomRows)
      CARDS.arrivals.note = rooming
        ? 'Rooming loaded · ' + (rooming.totalOccupants || g.totalGuests || '—') + ' guests assigned.'
        : 'Rooming list not loaded.'
    } else {
      var primary = upcoming[0], n = daysUntil(primary.checkIn)
      CARDS.arrivals.eyebrow = 'IN ' + n + ' DAYS · ' + fmtDate(primary.checkIn)
      CARDS.arrivals.title = primary.groupName || 'Group'
      CARDS.arrivals.rows = upcoming.slice(0, 4).map(function(p) {
        return [p.groupName || 'Group', fmtDate(p.checkIn) + ' → ' + fmtDate(p.checkOut), (p.totalGuests || '—') + ' guests']
      })
      CARDS.arrivals.note = 'Next arrivals from live portal data.'
      CARDS.arrivals.recipients = [R]
    }

    updateCardDom('arrivals')
    syncArrivalsCardClass(portals)
  }
  async function refreshArrivalsCard() {
    const card = document.getElementById('card-arrivals')
    if (card) card.classList.add('loading')
    try {
      if (!pulseCache) await loadPulseData()
      const portals = portalsCache || await loadPortalsData()
      applyArrivalsToCard(portals)
    } catch (err) {
      CARDS.arrivals.note = 'Could not load groups: ' + err.message
      updateCardDom('arrivals')
    } finally {
      document.getElementById('card-arrivals')?.classList.remove('loading')
    }
  }

  async function refreshRisksCard() {
    try {
      const data = pulseCache || await loadPulseData()
      const concerns = Array.isArray(data?.concerns) ? data.concerns : []
      if (!concerns.length) {
        CARDS.risks.rows = [['Field', tag('ok', 'all clear'), 'no open concerns']]
      } else {
        CARDS.risks.rows = concerns.slice(0, 5).map((c) => {
          const place = c.relatedPlace?.name || c.relatedPlace?.unitCode || 'Place'
          const hours = c.openedAt ? Math.round((Date.now() - new Date(c.openedAt)) / 3600000) + 'h' : ''
          return [place, tag('attention', 'open'), hours || 'in progress']
        })
      }
      updateCardDom('risks')
    } catch (err) {
      CARDS.risks.note = 'Could not load risks: ' + err.message
      updateCardDom('risks')
    }
  }

  async function wake(key, why) {
    if (!CARDS[key]) return

    if (shown.indexOf(key) > -1) {
      if (why) setCardWhy(key, why)
      if (key === 'pulse') refreshPulseCard()
      if (key === 'arrivals') refreshArrivalsCard()
      if (key === 'risks') refreshRisksCard()
      return
    }

    const portals = pulseCache?.portals || portalsCache || []
    const isToday = key === 'arrivals' && hasArrivalsToday(portals)
    const cardIndex = shown.length
    const col = cardIndex % 3
    const row = Math.floor(cardIndex / 3)
    const startLeft = 20 + col * 320
    const startTop = 20 + row * 40
    field.insertAdjacentHTML('beforeend', renderCard(key, why || null, isToday ? 'card-today' : ''))
    shown.push(key)
    const placedCard = document.getElementById('card-' + key)
    if (placedCard) {
      let maxBottom = 80
      field.querySelectorAll('.card').forEach(function(c) {
        if (c === placedCard) return
        const b = parseInt(c.style.top || 0) + (c.offsetHeight || 220) + 16
        if (b > maxBottom) maxBottom = b
      })
      // position card on absolute canvas
      var cardBottom = 0
      field.querySelectorAll('.card').forEach(function(c) {
        if (c === placedCard) return
        var t = parseInt(c.style.top || 0)
        var h = c.offsetHeight || 260
        if (t + h + 16 > cardBottom) cardBottom = t + h + 16
      })
      placedCard.style.left = '20px'
      placedCard.style.top = cardBottom + 'px'
      field.style.minHeight = (cardBottom + 300) + 'px'
    }


    if (key === 'pulse') await refreshPulseCard()
    if (key === 'arrivals') await refreshArrivalsCard()
    if (key === 'risks') await refreshRisksCard()

    // Make card draggable
    const newCard = document.getElementById('card-' + key)
    if (newCard) makeDraggableCard(newCard)
  }

  function makeDraggableCard(card) {
    // no-op — drag handled globally via field delegation below
  }

  // Global delegated drag — works for all cards including dynamically added ones
  ;(function initGlobalDrag() {
    let dragging = false, dragCard = null, ox = 0, oy = 0, placeholder = null

    field.addEventListener('mousedown', function (e) {
      const head = e.target.closest('.card-head')
      if (!head) return
      if (e.target.closest('[data-act]')) return
      dragCard = head.closest('.card')
      if (!dragCard) return
      const rect = dragCard.getBoundingClientRect()
      placeholder = document.createElement('div')
      placeholder.style.cssText = 'width:' + rect.width + 'px;height:' + rect.height + 'px;flex:none;border-radius:20px;'
      dragCard.parentNode.insertBefore(placeholder, dragCard.nextSibling)
      ox = e.clientX - rect.left
      oy = e.clientY - rect.top
      dragCard.style.position = 'fixed'
      dragCard.style.left = rect.left + 'px'
      dragCard.style.top = rect.top + 'px'
      dragCard.style.width = rect.width + 'px'
      dragCard.style.zIndex = '60'
      dragCard.style.margin = '0'
      head.style.cursor = 'grabbing'
      dragging = true
      e.preventDefault()
    })

    document.addEventListener('mousemove', function (e) {
      if (!dragging || !dragCard) return
      const panelW = document.body.getAttribute('data-panel') === 'open' ? 440 : 0
      let nx = Math.max(4, Math.min(e.clientX - ox, window.innerWidth - panelW - dragCard.offsetWidth - 4))
      let ny = Math.max(4, e.clientY - oy)
      dragCard.style.left = nx + 'px'
      dragCard.style.top = ny + 'px'
    })

    document.addEventListener('mouseup', function () {
      if (!dragging || !dragCard) return
      dragging = false
      const head = dragCard.querySelector('.card-head')
      if (head) head.style.cursor = 'move'
      // convert fixed position back to absolute inside field
      const fieldRect = field.getBoundingClientRect()
      const ca = document.querySelector('.cards-area')
      const scrollTop = ca ? ca.scrollTop : 0
      const nx = parseFloat(dragCard.style.left) - fieldRect.left
      const ny = parseFloat(dragCard.style.top) - fieldRect.top + scrollTop
      dragCard.style.position = 'absolute'
      dragCard.style.left = Math.max(0, nx) + 'px'
      dragCard.style.top = Math.max(0, ny) + 'px'
      dragCard.style.width = ''
      dragCard.style.zIndex = '12'
      dragCard.style.margin = ''
      if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder)
      placeholder = null
      dragCard = null
    })
  })()

  function resolveCard(key) {
    // transition bubble to stage 2 (flower of life)
    if (typeof lfSetBubbleResolved === 'function') {
      lfSetBubbleResolved(key)
    }
    // update resolve button UI
    const card = document.getElementById('card-' + key)
    if (card) {
      const btn = card.querySelector('.resolve')
      if (btn) {
        btn.textContent = '✓ Решено — цветок жизни'
        btn.style.color = 'var(--ok)'
        btn.style.borderColor = 'var(--ok)'
        btn.disabled = true
      }
      // Save resolved status to Sanity so it persists after reload
      const allIds = window._cardSourceIds ? JSON.stringify(window._cardSourceIds) : 'не установлен'
      const sourceId = window._cardSourceIds && window._cardSourceIds[key]
      console.log('[resolve] key:', key, 'sourceId:', sourceId, 'all:', allIds)
      if (sourceId) {
        apiPost('/api/resolve-concern', {id: sourceId})
          .then(function(r) {
            console.log('[resolve] success:', r)
            delete window._cardSourceIds[key]
          })
          .catch(function(e) { console.error('[resolve] failed:', e) })
      } else {
        // Try to find sourceId from pulseCache directly
        const concerns = (pulseCache && pulseCache.openConcerns) || []
        console.log('[resolve] openConcerns from pulseCache:', concerns.map(function(c){return {id:c._id, place:c.place?.name}}))
        const concern = concerns.find(function(c) {
          const place = c.place?.name || c.place?.unitCode || ''
          return CARDS[key] && (CARDS[key].title || '').toLowerCase().includes(place.toLowerCase())
        }) || concerns[0]
        if (concern) {
          console.log('[resolve] found via pulseCache:', concern._id)
          apiPost('/api/resolve-concern', {id: concern._id})
            .then(function(r) { console.log('[resolve] success via cache:', r) })
            .catch(function(e) { console.error('[resolve] cache failed:', e) })
        }
      }
      // send message to Rita about resolution
      apiPost('/api/rita-chat', {
        message: 'Задача закрыта: ' + (CARDS[key]?.title || key),
        history: [],
        liveData: buildLiveContext()
      }).then(function(json) {
        logLine(key, 'rita', '<b>Рита:</b> ' + esc(json.reply || 'Приняла.'))
      }).catch(function(){})
    }
    // remove card after bubble animation (2.5s)
    setTimeout(function() { removeCard(key) }, 2500)
  }

  function removeCard(key) {
    const c = document.getElementById('card-' + key)
    const chip = tray.querySelector('[data-key="' + key + '"]')
    if (chip) chip.remove()
    if (c) {
      c.classList.add('closing')
      setTimeout(function () {
        if (c.parentNode) c.parentNode.removeChild(c)
        afterRemove(key)
      }, 200)
    } else {
      afterRemove(key)
    }
  }

  function afterRemove(key) {
    const i = shown.indexOf(key)
    if (i > -1) shown.splice(i, 1)

    if (typeof lfRestoreBubble === 'function') lfRestoreBubble(key)
  }

  function minimize(key) {
    const c = document.getElementById('card-' + key)
    if (!c) return
    c.style.display = 'none'
    const d = CARDS[key]
    const chip = document.createElement('button')
    chip.className = 'tray-chip'
    chip.setAttribute('data-key', key)
    chip.type = 'button'
    chip.innerHTML = '<span class="d"></span>' + esc(d.title)
    chip.addEventListener('click', function () {
      c.style.display = ''
      chip.remove()
    })
    tray.appendChild(chip)
  }

  function closeAll() {
    shown.slice().forEach(function (k) {
      const c = document.getElementById('card-' + k)
      if (c && c.parentNode) c.parentNode.removeChild(c)
    })
    tray.innerHTML = ''
    shown.length = 0
    fieldTop.style.display = 'none'
    if (typeof lfRestoreAllBubbles === 'function') lfRestoreAllBubbles()
  }

  function logLine(key, cls, html) {
    const log = document.getElementById('log-' + key)
    if (!log) return
    const el = document.createElement('div')
    el.className = 'logline ' + cls
    el.innerHTML = html
    log.appendChild(el)
  }

  async function sendMsg(key) {
    const card = document.getElementById('card-' + key)
    if (!card) return
    const rcpt = card.querySelector('select').value
    const inp = card.querySelector('.composer input')
    const sendBtn = card.querySelector('.composer .send')
    const msg = inp.value.trim()
    if (!msg) return

    logLine(key, 'you', '<b>Вы → <span class="to">' + esc(rcpt) + '</span>:</b> ' + esc(msg))
    inp.value = ''
    if (sendBtn) sendBtn.disabled = true

    const cardTitle = CARDS[key]?.title || key
    const cardContext = '[Карточка: ' + cardTitle + '] '
    const routed = rcpt === R
      ? cardContext + msg
      : cardContext + '[→ ' + rcpt + '] ' + msg

    const groupContext = key === 'arrivals'
      ? (pulseCache?.portals || portalsCache || []).find(function (p) {
        return p.checkIn === todayIso() && p.status !== 'cancelled'
      })
      : null

    const cardSpecificContext = {
      currentCard: cardTitle,
      ...(groupContext ? {
        activeGroup: {
          name: groupContext.groupName || groupContext.title,
          guests: groupContext.totalGuests,
          checkIn: groupContext.checkIn,
          checkOut: groupContext.checkOut,
          rooming: findRoomingList(groupContext)
        }
      } : {})
    }

    try {
      const json = await apiPost('/api/rita-chat', {
        message: rcpt === R ? ('[Карточка: ' + cardTitle + '] ' + msg) : routed,
        history: [],
        liveData: Object.assign({}, buildLiveContext(), cardSpecificContext)
      })
      logLine(key, 'rita', '<b>Рита:</b> ' + esc(json.reply || 'Приняла.'))
      if (card) {
        card.classList.add('has-log', 'expanded')
        card.scrollIntoView({behavior: 'smooth', block: 'nearest'})
        if (json.reply && json.reply.length > 200) {
          card.style.width = Math.min(520, window.innerWidth * 0.4) + 'px'
        }
      }
    } catch (err) {
      logLine(key, 'rita', '<b>Рита:</b> ' + esc('Ошибка — ' + err.message))
    } finally {
      if (sendBtn) sendBtn.disabled = false
      inp.focus()
    }
  }

  function openPanel() {
    document.body.setAttribute('data-panel', 'open')
  }

  function closePanel() {
    document.body.setAttribute('data-panel', 'closed')
  }

  function addChatMsg(cls, html) {
    const el = document.createElement('div')
    el.className = cls
    el.innerHTML = html
    chatArea.appendChild(el)
    chatArea.scrollTop = chatArea.scrollHeight
    return el
  }

  function restoreChatHistory() {
    if (!chatHistory.length) return
    // render saved messages into chatArea (skip the default greeting)
    chatArea.innerHTML = ''
    chatHistory.forEach(function(m) {
      const cls = m.role === 'rita' ? 'msg-rita' : 'msg-you'
      const html = m.role === 'rita'
        ? '<b>Рита:</b> ' + esc(m.content)
        : esc(m.content)
      const el = document.createElement('div')
      el.className = cls
      el.innerHTML = html
      chatArea.appendChild(el)
    })
    chatArea.scrollTop = chatArea.scrollHeight
  }

  function showChatTyping() {
    const el = addChatMsg('msg-rita', '<b>Рита:</b> ···')
    el.id = 'chatTyping'
    return el
  }

  function hideChatTyping() {
    document.getElementById('chatTyping')?.remove()
  }

  function buildLiveContext() {
    if (!pulseCache) return {}
    const p = pulseCache

    const unitDetails = (p.places || [])
      .filter(function (pl) { return pl.type === 'accommodation' && pl.bedrooms })
      .map(function (pl) {
        const beds = (pl.bedrooms || []).map(function (b) {
          const parts = []
          if (b.kingBeds) parts.push(b.kingBeds + ' king')
          if (b.queenBeds) parts.push(b.queenBeds + ' queen')
          if (b.twinBeds) parts.push(b.twinBeds + ' twin' + (b.twinCanConvertToKing ? ' (convertible)' : ''))
          if (b.bunkBeds) parts.push(b.bunkBeds + ' bunk')
          return b.label + ': ' + parts.join(', ')
        }).join('; ')
        return pl.unitCode + ': ' + beds + ', sleeps ' + pl.capacity + (pl.livingRoomSleeps ? ' (+' + pl.livingRoomSleeps + ' sofa)' : '')
      })

    const buildings = (p.places || [])
      .filter(function (pl) { return pl.type === 'building' })
      .sort(function (a, b) { return (a.buildingNumber || 0) - (b.buildingNumber || 0) })
      .map(function (b) {
        return 'Building ' + b.buildingNumber + ' (' + (b.suiteCategory || '') + ')'
      })

    const sharedSpaces = (p.places || [])
      .filter(function (pl) {
        return ['restaurant', 'bar', 'outdoor-area', 'practice-space', 'event-space', 'pool'].indexOf(pl.type) > -1
      })
      .map(function (pl) {
        return pl.name + ' (' + pl.type + ')' + (pl.capacity ? ' · вместимость ' + pl.capacity : '')
      })

    return {
      property: 'Las Canas Beach Retreat',
      balanceStatus: p.pulse?.balanceStatus || null,
      coherenceStatement: p.pulse?.coherenceStatement || null,
      buildings: buildings,
      sharedSpaces: sharedSpaces,
      unitDetails: unitDetails,
      openConcernsCount: (p.openConcerns || []).length,
      openConcerns: (p.openConcerns || []).map(function (c) {
        return {
          place: c.place?.name || c.place?.unitCode || 'unknown',
          summary: c.summary,
          openedAt: c.openedAt
        }
      }),
      people: (p.people || []).map(function (person) {
        return {
          name: person.name,
          role: person.role,
          department: person.department?.titleEn || null
        }
      }),
      responsibilities: (p.responsibilities || []).map(function (r) {
        return {
          domain: r.title,
          authority: r.authorityLevel,
          holder: r.holder?.name || null
        }
      }),
      upcomingGroups: (p.portals || []).map(function (g) {
        return {
          name: g.groupName || g.title,
          checkIn: g.checkIn,
          checkOut: g.checkOut,
          guests: g.totalGuests,
          category: g.categoryName?.name || null
        }
      }),
      roomingLists: (p.roomingLists || []).map(function (r) {
        return {
          groupId: r.groupId,
          dates: r.stayDateStart + ' → ' + r.stayDateEnd,
          guests: r.totalOccupants,
          rooms: (r.rooms || []).map(function (rm) {
            return 'Room ' + rm.roomNumber + ' (' + rm.roomType + '): ' +
              (rm.occupants || []).map(function (o) { return o.name }).join(', ')
          }).join(' | ')
        }
      }),
      openQuestions: (p.openQuestions || []).map(function (q) { return q.question })
    }
  }

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
    const lfStyle = document.createElement('style')
    lfStyle.textContent = `
.lf-bubble{position:fixed;border-radius:50%;cursor:grab;z-index:8;touch-action:none;}
.lf-bubble:active{cursor:grabbing;}
.lf-ghost{position:fixed;border-radius:50%;pointer-events:none;z-index:7;opacity:.18;display:none;}
.lf-tt{position:fixed;background:rgba(255,253,247,.97);border:1px solid rgba(40,30,18,.13);border-radius:12px;padding:10px 13px;font-size:12px;line-height:1.5;max-width:200px;pointer-events:none;opacity:0;transition:opacity .15s;z-index:50;box-shadow:0 4px 18px rgba(40,30,18,.10);}
.lf-tt-type{font-size:10px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;margin-bottom:4px;}
.lf-tt-text{color:#3d3730;}
.lf-tt-dept{font-size:11px;color:#9a8c7c;margin-top:4px;}
.summon.lf-dragging{transition:none;}
`
    document.head.appendChild(lfStyle)

    const MOCK_BUBBLES = [
      {type: 'concern', cardKey: 'bar', size: 64, urgent: true, status: 'open', stage: 0, openedAt: null,
        text: 'Bar: течёт кран — обслуживание не начато', dept: 'Maintenance · 7ч', ax: 0.22, ay: 0.30},
      {type: 'question', cardKey: 'risks', size: 54, status: 'open', stage: 0, openedAt: null,
        text: 'EF 371170: Руминг-лист получен?', dept: 'Рита → Reception', ax: 0.50, ay: 0.22},
      {type: 'event', cardKey: 'arrivals', size: 48, status: 'open', stage: 0, openedAt: null,
        text: 'EF группа (38 чел) заезжает 15 июня', dept: 'Groups', ax: 0.30, ay: 0.62},
      {type: 'question', cardKey: 'purchase', size: 46, status: 'open', stage: 0, openedAt: null,
        text: 'Dietary restrictions 372551 — данных нет', dept: 'Рита → Groups', ax: 0.68, ay: 0.54}
    ]

    const zones = []
    let animT = 0
    let bubbles = []
    let bubbleIdCounter = 0

    const ttEl = document.createElement('div')
    ttEl.className = 'lf-tt'
    document.body.appendChild(ttEl)
    let ttBubble = null

    const NP = 80

    function getBubbleStage(data) {
      if (data.status === 'resolved') return 2
      if (data.openedAt) {
        const hours = (Date.now() - new Date(data.openedAt).getTime()) / 3600000
        if (hours > 4) return 1
      }
      return 0
    }

    function initParticles(b) {
      b.particles = []
      const R_f = b.size * 0.38

      const flowerCenters = [{x: 0, y: 0}]
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 - Math.PI / 2
        flowerCenters.push({x: R_f * Math.cos(a), y: R_f * Math.sin(a)})
      }
      const ppp = Math.floor(NP / 7)
      const flowerPts = []
      for (const c of flowerCenters) {
        for (let j = 0; j < ppp; j++) {
          const a = j / ppp * Math.PI * 2
          flowerPts.push({x: c.x + R_f * Math.cos(a), y: c.y + R_f * Math.sin(a)})
        }
      }
      while (flowerPts.length < NP) flowerPts.push({x: 0, y: 0})

      for (let i = 0; i < NP; i++) {
        const angle = Math.random() * Math.PI * 2
        const r = Math.random() * b.size * 0.9
        const sa = (i / NP) * Math.PI * 6
        const sr = b.size * 0.1 + (i / NP) * b.size * 0.7

        b.particles.push({
          px: Math.cos(angle) * r,
          py: Math.sin(angle) * r,
          vx: 0, vy: 0,
          chaosX: (Math.random() - 0.5) * b.size * 1.6,
          chaosY: (Math.random() - 0.5) * b.size * 1.6,
          spiralX: sr * Math.cos(sa),
          spiralY: sr * Math.sin(sa),
          flowerX: flowerPts[i].x,
          flowerY: flowerPts[i].y,
          size: 1.0 + Math.random() * 1.8,
          phase: Math.random() * Math.PI * 2,
          speed: 0.4 + Math.random() * 0.5
        })
      }
      b.stageProgress = 0
      b.resolveProgress = 0
    }

    function drawBubble(cv, b, t, dim) {
      if (!b.particles) return

      const half = b.size * 1.5
      const ctx = cv.getContext('2d')
      cv.width = b.size * 3
      cv.height = b.size * 3
      ctx.clearRect(0, 0, cv.width, cv.height)

      const STAGE_COLORS = [
        {r: 184, g: 60, b: 13},
        {r: 160, g: 107, b: 10},
        {r: 29, g: 158, b: 117}
      ]
      const col = STAGE_COLORS[b.stage] || STAGE_COLORS[0]

      b.stageProgress = Math.min(1, b.stageProgress + 0.006)
      const ease = b.stageProgress < 0.5
        ? 2 * b.stageProgress * b.stageProgress
        : 1 - Math.pow(-2 * b.stageProgress + 2, 2) / 2

      if (b.stage === 2 && b.stageProgress > 0.85) {
        b.resolveProgress = Math.min(1, b.resolveProgress + 0.004)
        if (b.resolveProgress >= 1) {
          b.shouldRemove = true
          return
        }
      }

      const globalAlpha = dim
        ? 0.15
        : (b.stage === 2 ? (1 - b.resolveProgress * 0.9) : 1)

      ctx.save()
      ctx.globalAlpha = globalAlpha

      if (b.stage === 2 && ease > 0.3) {
        const R_f = b.size * 0.38
        const centers = [{x: 0, y: 0}]
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2 - Math.PI / 2
          centers.push({x: R_f * Math.cos(a), y: R_f * Math.sin(a)})
        }
        ctx.strokeStyle = 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + (ease * 0.25) + ')'
        ctx.lineWidth = 0.6
        for (const c of centers) {
          ctx.beginPath()
          ctx.arc(half + c.x, half + c.y, R_f, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      for (const p of b.particles) {
        const br = 0.5 + 0.5 * Math.sin(t * p.speed + p.phase)

        let tx, ty
        if (b.stage === 0) {
          tx = p.chaosX + Math.sin(t * p.speed * 1.3 + p.phase) * (1 - ease) * b.size * 0.3
          ty = p.chaosY + Math.cos(t * p.speed + p.phase) * (1 - ease) * b.size * 0.3
        } else if (b.stage === 1) {
          tx = p.spiralX * ease + p.chaosX * (1 - ease)
          ty = p.spiralY * ease + p.chaosY * (1 - ease)
          tx += Math.sin(t * p.speed + p.phase) * (1 - ease) * b.size * 0.15
          ty += Math.cos(t * p.speed + p.phase) * (1 - ease) * b.size * 0.15
        } else {
          tx = p.flowerX * ease + p.spiralX * (1 - ease)
          ty = p.flowerY * ease + p.spiralY * (1 - ease)
        }

        p.vx += (tx - p.px) * 0.07
        p.vy += (ty - p.py) * 0.07
        p.vx *= 0.82
        p.vy *= 0.82
        p.px += p.vx
        p.py += p.vy

        const alpha = dim ? 0.12 : (b.stage === 2
          ? 0.2 + 0.7 * ease + 0.1 * br
          : 0.3 + 0.3 * br)
        const size = p.size * (b.stage === 2 ? (0.7 + 0.5 * ease) : 1)

        ctx.beginPath()
        ctx.arc(half + p.px, half + p.py, size, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + alpha + ')'
        ctx.fill()
      }

      ctx.restore()
    }

    function updateZones() {
      const bubbleZones = zones.filter(function (z) {
        return z.id && String(z.id).indexOf('bubble-') === 0
      })
      zones.length = 0
      bubbleZones.forEach(function (z) { zones.push(z) })
      document.querySelectorAll('.card').forEach(function (card) {
        if (card.style.display === 'none') return
        const rect = card.getBoundingClientRect()
        if (!rect.width) return
        zones.push({
          id: card.dataset.key,
          cx: rect.left + rect.width / 2,
          cy: rect.top + rect.height / 2,
          r: Math.max(rect.width, rect.height) * 0.55
        })
      })
      if (document.body.getAttribute('data-panel') === 'open') {
        const panel = document.getElementById('ritaPanel')
        if (panel) {
          const rect = panel.getBoundingClientRect()
          zones.push({
            id: 'rita-panel',
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
            r: Math.max(rect.width, rect.height) * 0.45
          })
        }
      }
    }

    function showTT(b, x, y) {
      const eventLabel = b.status === 'inhouse' ? 'В доме'
                       : b.status === 'checkout' ? 'Выезд сегодня'
                       : 'Заезд'
      const LABELS = {concern: 'Разрыв', 'concern-new': 'Новая задача', question: 'Рита наблюдает', event: eventLabel}
      const COLORS = {concern: '#b83c0d', 'concern-new': '#a06b0a', question: '#d98a2b', event: '#3a7a55'}
      const drawType = b.bubbleType || b.type
      const c = COLORS[drawType] || '#d98a2b'
      ttEl.innerHTML = '<div class="lf-tt-type" style="color:' + c + '">' + esc(LABELS[drawType] || '') + '</div>'
        + '<div class="lf-tt-text">' + esc(b.text) + '</div>'
        + '<div class="lf-tt-dept">' + esc(b.dept || '') + '</div>'
      ttEl.style.opacity = '1'
      posTT(x, y)
      ttBubble = b
    }

    function hideTT() {
      ttEl.style.opacity = '0'
      ttBubble = null
    }

    function posTT(x, y) {
      const vw = window.innerWidth
      let lx = x + 14
      let ly = y + 14
      if (lx + 210 > vw) lx = x - 220
      if (ly + 90 > window.innerHeight - 20) ly = y - 100
      ttEl.style.left = lx + 'px'
      ttEl.style.top = ly + 'px'
    }

    function restoreBubble(b) {
      b.open = false
      b.ghost.style.display = 'none'
      b.el.style.visibility = 'visible'
      b.vx = 0
      b.vy = 0
      const zi = zones.findIndex(function (z) { return z.id === b.id })
      if (zi > -1) zones.splice(zi, 1)
    }

    function hookCardCloseForBubble(b, cardKey) {
      setTimeout(function () {
        const card = document.getElementById('card-' + cardKey)
        if (!card) return

        const rect = card.getBoundingClientRect()
        const zi = zones.findIndex(function (z) { return z.id === b.id })
        const zone = {
          id: b.id,
          cx: rect.left + rect.width / 2,
          cy: rect.top + rect.height / 2,
          r: Math.max(rect.width, rect.height) * 0.72
        }
        if (zi > -1) zones[zi] = zone
        else zones.push(zone)

        card.querySelectorAll('[data-act="close"], [data-act="min"], .resolve').forEach(function (btn) {
          btn.addEventListener('click', function () { restoreBubble(b) }, {once: true})
        })
      }, 100)
    }

    window.lfRestoreBubble = function lfRestoreBubble(cardKey) {
      bubbles.forEach(function (b) {
        if (b.open && b._openedCardKey === cardKey) restoreBubble(b)
      })
    }

    window.lfSetBubbleResolved = function lfSetBubbleResolved(cardKey) {
      bubbles.forEach(function (b) {
        if (b._openedCardKey === cardKey || b.cardKey === cardKey) {
          b.stage = 2
          b.stageProgress = 0
        }
      })
    }

    window.lfRestoreAllBubbles = function lfRestoreAllBubbles() {
      bubbles.forEach(function (b) {
        if (b.open) restoreBubble(b)
      })
    }

    function clearBubbles() {
      bubbles.forEach(function (b) {
        if (b.el.parentNode) b.el.parentNode.removeChild(b.el)
        if (b.ghost.parentNode) b.ghost.parentNode.removeChild(b.ghost)
      })
      bubbles = []
    }

    function nextBubblePos(index) {
      const cols = 4
      const col = index % cols
      const row = Math.floor(index / cols)
      return {
        ax: 0.14 + col * 0.16 + (Math.random() * 0.04),
        ay: 0.18 + row * 0.14 + (Math.random() * 0.04)
      }
    }

    function buildBubbleDataFromLive(cache) {
      if (!cache) return null
      const items = []
      let idx = 0

      ;(cache.openQuestions || []).slice(0, 5).forEach(function (q) {
        const pos = nextBubblePos(idx++)
        const qData = {
          type: 'question',
          size: Math.max(54, 46 + Math.min(24, String(q.question || '').length * 0.4)),
          text: q.question || 'Open question',
          dept: 'Рита наблюдает',
          cardKey: 'risks',
          sourceId: q._id,
          status: 'open',
          openedAt: q.openedAt || null,
          ax: pos.ax,
          ay: pos.ay
        }
        qData.stage = getBubbleStage(qData)
        items.push(qData)
      })

      ;(cache.openConcerns || []).slice(0, 6).forEach(function (c) {
        const hours = c.openedAt ? (Date.now() - new Date(c.openedAt).getTime()) / 3600000 : 0
        const bubbleType = hours >= 6 ? 'concern' : 'concern-new'
        const place = c.place?.name || c.place?.unitCode || 'Place'
        const pos = nextBubblePos(idx++)
        // skip concerns that are actually group/arrival info
        const isGroupInfo = /EF|368297|371|grup|group|pax|habitaci/i.test(c.summary || '')
        if (isGroupInfo) return
        const isUnit = /bar/i.test(place) || /bar/i.test(c.summary || '')
        const cData = {
          type: bubbleType === 'concern-new' ? 'concern-new' : 'concern',
          bubbleType: bubbleType,
          urgent: hours >= 6,
          size: hours >= 6 ? 64 : 54,
          text: place + ': ' + (c.summary || 'open issue'),
          dept: (hours >= 6 ? 'Maintenance · ' : 'New · ') + Math.max(1, Math.round(hours)) + 'ч',
          cardKey: isUnit ? 'bar' : 'risks',
          sourceId: c._id,
          status: c.status || 'open',
          openedAt: c.openedAt || null,
          ax: pos.ax,
          ay: pos.ay
        }
        cData.stage = getBubbleStage(cData)
        items.push(cData)
      })

      const today = todayIso()
      ;(cache.portals || []).filter(function (p) {
        if (!p.checkIn || p.status === 'cancelled') return false
        const daysAway = (new Date(p.checkIn) - new Date(today)) / 86400000
        const arriving = daysAway >= 0 && daysAway <= 5
        const inHouse  = p.checkIn < today && p.checkOut >= today
        return arriving || inHouse
      }).slice(0, 6).forEach(function (p) {
        const isCheckout = p.checkOut === today
        const isInHouse  = p.checkIn <= today && p.checkOut > today && !isCheckout
        const isArriving = p.checkIn === today && !isCheckout
        const pos = nextBubblePos(idx++)
        items.push({
          type: 'event',
          size: isInHouse || isArriving ? 54 : 48,
          text: (p.groupName || p.title || 'Group') + ' · ' + (p.totalGuests || '—') + ' guests',
          dept: isCheckout  ? 'checkout today · ' + fmtDate(p.checkOut)
              : isInHouse   ? 'in house · until ' + fmtDate(p.checkOut)
              : isArriving  ? 'arrived today · until ' + fmtDate(p.checkOut)
              : fmtDate(p.checkIn) + ' → ' + fmtDate(p.checkOut),
          cardKey: 'arrivals',
          status: isCheckout ? 'checkout' : isInHouse || isArriving ? 'inhouse' : 'arriving',
          bubbleStage: isCheckout ? 1 : (isInHouse || isArriving ? 1 : 0),
          ax: pos.ax,
          ay: pos.ay
        })
      })

      return items.length ? items : null
    }

    function spawnBubble(data) {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const canvasSize = data.size * 3
      const el = document.createElement('div')
      el.className = 'lf-bubble'
      el.style.width = canvasSize + 'px'
      el.style.height = canvasSize + 'px'

      const cv = document.createElement('canvas')
      cv.width = canvasSize
      cv.height = canvasSize
      el.appendChild(cv)

      const ghost = document.createElement('div')
      ghost.className = 'lf-ghost'
      ghost.style.width = canvasSize + 'px'
      ghost.style.height = canvasSize + 'px'
      const gcv = document.createElement('canvas')
      ghost.appendChild(gcv)
      document.body.appendChild(ghost)
      document.body.appendChild(el)

      const px = (data.ax || 0.2) * vw
      const py = (data.ay || 0.3) * vh
      const half = data.size * 1.5

      const b = Object.assign({}, data, {
        id: 'bubble-' + (++bubbleIdCounter),
        el: el,
        cv: cv,
        gcv: gcv,
        ghost: ghost,
        px: px,
        py: py,
        homeX: px,
        homeY: py,
        vx: 0,
        vy: 0,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.3,
        bSpeed: 1 + Math.random(),
        amp: 4 + Math.random() * 6,
        stage: data.bubbleStage !== undefined ? data.bubbleStage : (data.stage !== undefined ? data.stage : getBubbleStage(data)),
        open: false,
        isDragging: false,
        didMove: false,
        shouldRemove: false
      })

      initParticles(b)

      let dragOx = 0
      let dragOy = 0

      el.addEventListener('mousedown', function (e) {
        if (b.open) return
        b.isDragging = true
        b.didMove = false
        dragOx = e.clientX - b.px
        dragOy = e.clientY - b.py
        b.vx = 0
        b.vy = 0
        hideTT()
        e.preventDefault()
      })

      el.addEventListener('mouseenter', function (e) {
        if (!b.open && !b.isDragging) showTT(b, e.clientX, e.clientY)
      })

      el.addEventListener('mousemove', function (e) {
        if (ttBubble === b && !b.isDragging) posTT(e.clientX, e.clientY)
      })

      el.addEventListener('mouseleave', hideTT)

      el.addEventListener('click', function () {
        if (b.didMove) return
        if (b.open) return
        b.open = true
        b.stage = Math.max(b.stage, 1)
        b.stageProgress = 0

        drawBubble(b.gcv, b, animT, true)
        b.ghost.style.left = (b.px - half) + 'px'
        b.ghost.style.top = (b.py - half) + 'px'
        b.ghost.style.display = 'block'
        b.el.style.visibility = 'hidden'
        hideTT()

        const cardKey = b.cardKey || b.type
        b._openedCardKey = cardKey

        if (document.body.getAttribute('data-panel') === 'open') {
          closePanel()
        }

        // Store sourceId so resolveCard can find it
        if (b.sourceId) {
          window._cardSourceIds = window._cardSourceIds || {}
          window._cardSourceIds[cardKey] = b.sourceId
        }

        if (typeof wake === 'function') {
          wake(cardKey, b.text)
        }

        setTimeout(function () {
          const ca = document.getElementById('cardsArea')
          if (ca) ca.scrollTop = 0
        }, 50)

        const vw = window.innerWidth
        const vh = window.innerHeight
        zones.push({id: b.id, cx: vw / 2, cy: vh / 2, r: 180})

        hookCardCloseForBubble(b, cardKey)
      })

      document.addEventListener('mousemove', function (e) {
        if (!b.isDragging) return
        b.didMove = true
        b.px = e.clientX - dragOx
        b.py = e.clientY - dragOy
        b.homeX = b.px
        b.homeY = b.py
        const mg = half + 4
        const vw2 = window.innerWidth
        const vh2 = window.innerHeight
        b.px = Math.max(mg, Math.min(b.px, vw2 - mg))
        b.py = Math.max(mg, Math.min(b.py, vh2 - mg - 40))
      })

      document.addEventListener('mouseup', function () {
        if (!b.isDragging) return
        b.isDragging = false
      })

      el.style.left = (px - half) + 'px'
      el.style.top = (py - half) + 'px'

      bubbles.push(b)
      return b
    }

    function initBubbles(dataList) {
      clearBubbles()
      dataList.forEach(function (d) { spawnBubble(d) })
    }

    window.lfRefreshBubblesFromLive = function lfRefreshBubblesFromLive() {
      const live = buildBubbleDataFromLive(pulseCache)
      console.log('[RITA bubbles] pulseCache:', pulseCache ? Object.keys(pulseCache) : 'NULL')
      console.log('[RITA bubbles] live items:', live ? live.length : 'NULL', live)
      if (live && live.length > 0) {
        initBubbles(live)
      }
    }

    function tick() {
      animT += 0.011
      updateZones()
      const vw = window.innerWidth
      const vh = window.innerHeight
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]
        const half = b.size * 1.5
        const mg = half + 4

        if (b.shouldRemove) {
          b.el.remove()
          if (b.ghost) b.ghost.remove()
          bubbles.splice(i, 1)
          continue
        }

        if (b.open) {
          drawBubble(b.gcv, b, animT, true)
          continue
        }
        if (b.isDragging) {
          b.el.style.left = (b.px - half) + 'px'
          b.el.style.top = (b.py - half) + 'px'
          drawBubble(b.cv, b, animT, false)
          continue
        }
        const fdx = Math.cos(animT * b.speed * 0.55 + b.phase) * b.amp * 0.3
        const fdy = Math.sin(animT * b.speed + b.phase) * b.amp
        let fx = 0
        let fy = 0
        zones.forEach(function (z) {
          const ddx = b.px - z.cx
          const ddy = b.py - z.cy
          const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1
          const repR = z.r + half + 16
          if (dist < repR) {
            const ov = repR - dist
            fx += (ddx / dist) * ov * 1.4
            fy += (ddy / dist) * ov * 1.4
          }
        })
        const dhx = b.homeX - b.px
        const dhy = b.homeY - b.py
        if (Math.sqrt(dhx * dhx + dhy * dhy) > 2) {
          fx += dhx * 0.04
          fy += dhy * 0.04
        }
        b.vx = (b.vx + fx) * 0.78
        b.vy = (b.vy + fy) * 0.78
        b.px += b.vx
        b.py += b.vy
        b.px = Math.max(mg, Math.min(b.px, vw - mg))
        b.py = Math.max(mg, Math.min(b.py, vh - mg - 40))
        b.el.style.left = (b.px + fdx - half) + 'px'
        b.el.style.top = (b.py + fdy - half) + 'px'
        drawBubble(b.cv, b, animT, false)
      }
      requestAnimationFrame(tick)
    }

    function makeDraggable(el, onClick) {
      let ox = 0
      let oy = 0
      let on = false
      let moved = false
      el.addEventListener('mousedown', function (e) {
        moved = false
        on = true
        ox = e.clientX - el.getBoundingClientRect().left
        oy = e.clientY - el.getBoundingClientRect().top
        el.classList.add('lf-dragging')
        e.preventDefault()
      })
      document.addEventListener('mousemove', function (e) {
        if (!on) return
        moved = true
        const vw = window.innerWidth
        const vh = window.innerHeight
        const w = el.offsetWidth
        const h = el.offsetHeight
        let nx = e.clientX - ox
        let ny = e.clientY - oy
        nx = Math.max(8, Math.min(nx, vw - w - 8))
        ny = Math.max(8, Math.min(ny, vh - h - 8))
        el.style.position = 'fixed'
        el.style.right = 'auto'
        el.style.bottom = 'auto'
        el.style.left = nx + 'px'
        el.style.top = ny + 'px'
      })
      document.addEventListener('mouseup', function () {
        if (on && !moved && onClick) onClick()
        on = false
        el.classList.remove('lf-dragging')
      })
    }

    const summonBtn = document.getElementById('summon')
    if (summonBtn) {
      summonBtn.style.zIndex = '110'
      makeDraggable(summonBtn, function () {
        document.body.getAttribute('data-panel') === 'open' ? closePanel() : openPanel()
      })
    }

    initBubbles([])  // start empty — live data loads in loadPulseData()
    requestAnimationFrame(tick)
    loadPulseData().catch(function () {})
  })()

  // PDF attach button
  const panelAttachBtn = document.getElementById('panelAttach')
  const panelFileInput = document.getElementById('panelFile')
  const pdfBadgeEl = document.getElementById('pdfBadge')

  if (panelAttachBtn && panelFileInput) {
    panelAttachBtn.addEventListener('click', function() {
      panelFileInput.click()
    })
    panelFileInput.addEventListener('change', function() {
      const file = panelFileInput.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = function(e) {
        // extract base64 (remove data:...;base64, prefix)
        pendingPdfData = e.target.result.split(',')[1]
        pendingPdfName = file.name
        panelAttachBtn.classList.add('has-file')
        if (pdfBadgeEl) {
          pdfBadgeEl.textContent = file.name.slice(0, 20)
          pdfBadgeEl.style.display = 'inline-block'
        }
      }
      reader.readAsDataURL(file)
    })
  }

  // Restore chat history from localStorage
  restoreChatHistory()

  document.getElementById('closePanel').addEventListener('click', closePanel)
  document.getElementById('panelSend').addEventListener('click', sendChat)
  const panelInputEl = document.getElementById('panelInput')
  panelInputEl.addEventListener('input', function () {
    this.style.height = 'auto'
    this.style.height = Math.min(this.scrollHeight, 140) + 'px'
  })
  panelInputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendChat()
    }
    // Shift+Enter = new line
  })


  // Boot: load portals + pulse data, start polling
  loadPortalsData().catch(function () {})
  loadPulseData().catch(function () {})

  // Poll every 60 seconds to refresh bubbles and cards
  setInterval(function () {
    loadPulseData().catch(function () {})
  }, 60000)
})()
