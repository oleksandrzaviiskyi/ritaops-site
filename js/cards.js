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
      dragCard.style.position = 'relative'
      dragCard.style.left = ''
      dragCard.style.top = ''
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