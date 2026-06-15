async function loadPulseData() {
    const data = await apiGet('/api/ops-pulse')
    pulseCache = data
    if (typeof lfRefreshBubblesFromLive === 'function') lfRefreshBubblesFromLive()
    return data
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
    const arriving = portals.filter(function (p) {
      return p.checkIn === today && p.status !== 'cancelled'
    })
    const upcoming = portals.filter(function (p) {
      if (!p.checkIn || p.checkIn <= today || p.status === 'cancelled') return false
      const n = daysUntil(p.checkIn)
      return n >= 1 && n <= 3
    })

    if (!arriving.length && !upcoming.length) {
      CARDS.arrivals.eyebrow = 'Arrivals · ' + fmtDate(today)
      CARDS.arrivals.title = 'No groups today'
      CARDS.arrivals.rows = [['Groups', tag('ok', 'clear'), 'no check-ins scheduled']]
      CARDS.arrivals.note = 'Live data from portals.'
      updateCardDom('arrivals')
      syncArrivalsCardClass(portals)
      return
    }

    if (arriving.length) {
      const g = arriving[0]
      const rooming = findRoomingList(g)
      const roomRows = []

      if (rooming && rooming.rooms) {
        rooming.rooms.slice(0, 8).forEach(function (rm) {
          const names = (rm.occupants || []).map(function (o) { return o.name }).join(', ')
          roomRows.push(['Room ' + rm.roomNumber, rm.roomType, names])
        })
      }

      // Find group leader — first single room occupant
      const leaderRoom = rooming && rooming.rooms ? rooming.rooms.find(function(rm) {
        return rm.occupants && rm.occupants.length === 1
      }) : null
      const leaderName = leaderRoom ? (leaderRoom.occupants[0].name || '') : ''
      const contactPhone = g.contactPhone || ''
      const leaderLabel = leaderName
        ? leaderName + (contactPhone ? ' · ' + contactPhone : '')
        : 'Group Leader'
      CARDS.arrivals.recipients = [R, leaderLabel]
      CARDS.arrivals.groupLeader = {name: leaderName, phone: contactPhone}

      CARDS.arrivals.eyebrow = 'ARRIVING TODAY · ' + fmtDate(today)
      CARDS.arrivals.title = (g.groupName || g.title || 'Group') + ' · ' + (g.totalGuests || '—') + ' guests'
      CARDS.arrivals.rows = [
        ['Группа', g.groupName || g.title || 'Group', ''],
        ['Даты', fmtDate(g.checkIn) + ' → ' + fmtDate(g.checkOut), ''],
        ['Гости', String(g.totalGuests || '—'), 'check-in today'],
        ['Лидер', leaderName || '—', contactPhone ? '📞 ' + contactPhone : ''],
        ['Руминг', rooming && rooming.rooms ? rooming.rooms.length + ' комнат' : tag('attention', 'не загружен'), ''],
        ...roomRows
      ]
      CARDS.arrivals.note = rooming
        ? 'Rooming loaded · ' + (rooming.totalOccupants || '—') + ' guests assigned.'
        : 'Rooming list not loaded yet — ask Rita to pull the latest.'
    } else {
      const primary = upcoming[0]
      const n = daysUntil(primary.checkIn)
      CARDS.arrivals.eyebrow = upcoming.length === 1
        ? 'IN ' + n + ' DAYS · ' + fmtDate(primary.checkIn)
        : 'UPCOMING · 1–3 DAYS'
      CARDS.arrivals.title = upcoming.length === 1
        ? (primary.groupName || 'Group')
        : upcoming.length + ' groups'
      CARDS.arrivals.rows = upcoming.slice(0, 6).map(function (p) {
        return [
          p.groupName || 'Group',
          fmtDate(p.checkIn) + ' → ' + fmtDate(p.checkOut),
          (p.totalGuests || '—') + ' guests'
        ]
      })
      CARDS.arrivals.note = 'Next arrivals from live portal data.'
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
      // card flows naturally in column layout
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