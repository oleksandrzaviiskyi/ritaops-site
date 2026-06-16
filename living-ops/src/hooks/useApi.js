import { useEffect, useRef } from 'react'
import { apiGet, tag, fmtDate, formatBalance, todayIso } from '../utils/api.js'
import { actions, useStore } from './useStore.js'

function buildLiveContext(pulseCache, portalsCache) {
  if (!pulseCache) return {}
  const p = pulseCache

  const unitDetails = (p.places || [])
    .filter(pl => pl.type === 'accommodation' && pl.bedrooms)
    .map(pl => {
      const beds = (pl.bedrooms || []).map(b => {
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
    .filter(pl => pl.type === 'building')
    .sort((a, b) => (a.buildingNumber || 0) - (b.buildingNumber || 0))
    .map(b => 'Building ' + b.buildingNumber + ' (' + (b.suiteCategory || '') + ')')

  const sharedSpaces = (p.places || [])
    .filter(pl => ['restaurant', 'bar', 'outdoor-area', 'practice-space', 'event-space', 'pool'].includes(pl.type))
    .map(pl => pl.name + ' (' + pl.type + ')' + (pl.capacity ? ' · вместимость ' + pl.capacity : ''))

  return {
    property: 'Las Canas Beach Retreat',
    balanceStatus: p.pulse?.balanceStatus || null,
    coherenceStatement: p.pulse?.coherenceStatement || null,
    buildings,
    sharedSpaces,
    unitDetails,
    openConcernsCount: (p.openConcerns || []).length,
    openConcerns: (p.openConcerns || []).map(c => ({
      place: c.place?.name || c.place?.unitCode || 'unknown',
      summary: c.summary,
      openedAt: c.openedAt
    })),
    people: (p.people || []).map(person => ({
      name: person.name,
      role: person.role,
      department: person.department?.titleEn || null
    })),
    responsibilities: (p.responsibilities || []).map(r => ({
      domain: r.title,
      authority: r.authorityLevel,
      holder: r.holder?.name || null
    })),
    upcomingGroups: (p.portals || []).map(g => ({
      name: g.groupName || g.title,
      checkIn: g.checkIn,
      checkOut: g.checkOut,
      guests: g.totalGuests,
      category: g.categoryName?.name || null
    })),
    roomingLists: (p.roomingLists || []).map(r => ({
      groupId: r.groupId,
      dates: r.stayDateStart + ' → ' + r.stayDateEnd,
      guests: r.totalOccupants,
      rooms: (r.rooms || []).map(rm =>
        'Room ' + rm.roomNumber + ' (' + rm.roomType + '): ' +
        (rm.occupants || []).map(o => o.name).join(', ')
      ).join(' | ')
    })),
    openQuestions: (p.openQuestions || []).map(q => q.question)
  }
}

export function useApi() {
  const pulseCache = useStore(s => s.pulseCache)
  const portalsCache = useStore(s => s.portalsCache)

  const getLive = () => buildLiveContext(pulseCache, portalsCache)

  async function loadPulseData() {
    const data = await apiGet('/api/ops-pulse')
    actions.setPulseCache(data)
    // Trigger bubble refresh
    if (typeof window.lfRefreshBubblesFromLive === 'function') {
      window.lfRefreshBubblesFromLive()
    }
    return data
  }

  async function loadPortalsData() {
    const data = await apiGet('/api/portals')
    actions.setPortalsCache(data.portals || [])
    return data.portals || []
  }

  return { loadPulseData, loadPortalsData, getLive }
}

export { buildLiveContext }
