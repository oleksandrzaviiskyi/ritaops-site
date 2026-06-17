import { tag, fmtDate, formatBalance, todayIso } from '../utils/api.js'
import { R } from '../data/cards.js'

export function applyPulseToCard(prev, data) {
  const pulse = data?.pulse || {}
  const concerns = Array.isArray(data?.concerns) ? data.concerns : []
  const balance = formatBalance(pulse.balanceStatus)
  const concernCount = concerns.length
  const fieldLabel = concernCount ? tag('attention', concernCount + ' open') : tag('ok', 'all clear')

  return {
    ...prev,
    eyebrow: 'Today · Pulse',
    title: 'Las Canas Beach Retreat',
    rows: [
      ['Balance', tag('ok', balance.toLowerCase()), 'hotel load tier'],
      ['Field', fieldLabel, concernCount ? 'open concerns' : 'no open concerns'],
      ['Concerns', String(concernCount), concernCount === 1 ? 'needs attention' : 'total open']
    ],
    note: pulse.coherenceStatement?.trim() || ''
  }
}

function daysUntil(checkIn) {
  const d1 = new Date(todayIso() + 'T12:00:00')
  const d2 = new Date(checkIn + 'T12:00:00')
  return Math.round((d2 - d1) / 86400000)
}

function portalGroupId(portal, pulseCache) {
  if (portal.groupId) return portal.groupId
  const fromPulse = (pulseCache?.portals || []).find(
    p => p._id === portal._id || p.groupName === portal.groupName
  )
  return fromPulse?.groupId || null
}

function findRoomingList(group, pulseCache) {
  const lists = pulseCache?.roomingLists || []
  if (!group) return null
  const gid = portalGroupId(group, pulseCache)
  return lists.find(r =>
    r.groupId === gid ||
    r.relatedGroupRef === group._id ||
    r.groupId === (group.groupName || '').replace(/\D/g, '').slice(-6)
  ) || null
}

function hasArrivalsToday(portals) {
  const today = todayIso()
  return (portals || []).some(p => p.checkIn === today && p.status !== 'cancelled')
}

function buildTodayGroupCard(prev, g, pulseCache, isToday) {
  const today = todayIso()
  const rooming = findRoomingList(g, pulseCache)
  const roomRows = []
  if (rooming?.rooms) {
    rooming.rooms.slice(0, 8).forEach(rm => {
      const names = (rm.occupants || []).map(o => o.name).join(', ')
      roomRows.push(['Room ' + rm.roomNumber, rm.roomType, names])
    })
  }
  const leaderRoom = rooming?.rooms?.find(rm => rm.occupants?.length === 1)
  const leaderName = leaderRoom ? (leaderRoom.occupants[0].name || '') : ''
  const contactPhone = g.contactPhone || ''

  return {
    isToday,
    data: {
      ...prev,
      eyebrow: 'ARRIVING TODAY · ' + fmtDate(today),
      title: (g.groupName || g.title || 'Group') + ' · ' + (g.totalGuests || '—') + ' guests',
      rows: [
        ['Группа', g.groupName || g.title || 'Group', ''],
        ['Даты', fmtDate(g.checkIn) + ' → ' + fmtDate(g.checkOut), ''],
        ['Гости', String(g.totalGuests || '—'), 'check-in today'],
        ['Лидер', leaderName || '—', contactPhone ? '📞 ' + contactPhone : ''],
        ['Руминг', rooming?.rooms ? rooming.rooms.length + ' комнат' : tag('attention', 'не загружен'), ''],
        ...roomRows
      ],
      note: rooming
        ? 'Rooming loaded · ' + (rooming.totalOccupants || '—') + ' guests assigned.'
        : 'Rooming list not loaded yet — ask Rita to pull the latest.',
      recipients: [R, leaderName ? leaderName + (contactPhone ? ' · ' + contactPhone : '') : 'Group Leader']
    }
  }
}

function buildUpcomingGroupCard(prev, p) {
  const n = daysUntil(p.checkIn)
  return {
    isToday: false,
    data: {
      ...prev,
      eyebrow: 'IN ' + n + ' DAYS · ' + fmtDate(p.checkIn),
      title: p.groupName || 'Group',
      rows: [[
        p.groupName || 'Group',
        fmtDate(p.checkIn) + ' → ' + fmtDate(p.checkOut),
        (p.totalGuests || '—') + ' guests'
      ]],
      note: 'Next arrivals from live portal data.'
    }
  }
}

export function applyArrivalsToCard(prev, pulseCache, portals, specificPortalId = null) {
  const today = todayIso()

  if (specificPortalId) {
    const portal = portals.find(p => p._id === specificPortalId)
    if (portal) {
      if (portal.checkIn === today && portal.status !== 'cancelled') {
        return buildTodayGroupCard(prev, portal, pulseCache, true)
      }
      const n = daysUntil(portal.checkIn)
      if (portal.checkIn && portal.checkIn > today && n >= 1 && n <= 3 && portal.status !== 'cancelled') {
        return buildUpcomingGroupCard(prev, portal)
      }
      return buildTodayGroupCard(prev, portal, pulseCache, portal.checkIn === today)
    }
  }

  const arriving = portals.filter(p => p.checkIn === today && p.status !== 'cancelled')
  const upcoming = portals.filter(p => {
    if (!p.checkIn || p.checkIn <= today || p.status === 'cancelled') return false
    const n = daysUntil(p.checkIn)
    return n >= 1 && n <= 3
  })

  const isToday = hasArrivalsToday(portals)

  if (!arriving.length && !upcoming.length) {
    return {
      isToday,
      data: {
        ...prev,
        eyebrow: 'Arrivals · ' + fmtDate(today),
        title: 'No groups today',
        rows: [['Groups', tag('ok', 'clear'), 'no check-ins scheduled']],
        note: 'Live data from portals.'
      }
    }
  }

  if (arriving.length) {
    return buildTodayGroupCard(prev, arriving[0], pulseCache, isToday)
  }

  const primary = upcoming[0]
  const n = daysUntil(primary.checkIn)
  return {
    isToday,
    data: {
      ...prev,
      eyebrow: upcoming.length === 1
        ? 'IN ' + n + ' DAYS · ' + fmtDate(primary.checkIn)
        : 'UPCOMING · 1–3 DAYS',
      title: upcoming.length === 1
        ? (primary.groupName || 'Group')
        : upcoming.length + ' groups',
      rows: upcoming.slice(0, 6).map(p => [
        p.groupName || 'Group',
        fmtDate(p.checkIn) + ' → ' + fmtDate(p.checkOut),
        (p.totalGuests || '—') + ' guests'
      ]),
      note: 'Next arrivals from live portal data.'
    }
  }
}

export function applyRisksToCard(prev, data) {
  const concerns = Array.isArray(data?.concerns) ? data.concerns : []
  const rows = concerns.length
    ? concerns.slice(0, 5).map(c => {
      const place = c.relatedPlace?.name || c.relatedPlace?.unitCode || 'Place'
      const hours = c.openedAt ? Math.round((Date.now() - new Date(c.openedAt)) / 3600000) + 'h' : ''
      return [place, tag('attention', 'open'), hours || 'in progress']
    })
    : [['Field', tag('ok', 'all clear'), 'no open concerns']]
  return { ...prev, rows }
}
