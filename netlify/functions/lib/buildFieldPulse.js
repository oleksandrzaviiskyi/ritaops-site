/**
 * Build Pulse Field payload: place fund + open-concern overlay.
 * Department colors for the UI live in pulse-shared.js (DEPARTMENT_COLORS).
 */

const STRUCTURE_TYPES = new Set(['property', 'building', 'accommodation', 'villa'])

/** Canonical shared-space row order and name matching. */
const CANONICAL_SHARED = [
  {key: 'pool', displayName: 'Pool', match: /^pool$/i},
  {key: 'restaurant', displayName: 'Restaurant', match: /^restaurant$/i},
  {key: 'bar', displayName: 'Bar', match: /^bar$/i},
  {key: 'palapa', displayName: 'Palapa', match: /^palapa$/i},
  {key: 'beach-deck', displayName: 'Beach deck', match: /beach\s*deck/i},
  {key: 'fire-pit', displayName: 'Fire pit', match: /fire\s*pit/i}
]

function shortDescription(text) {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
  return words.join(' ') || 'open'
}

function hoursOpenLabel(openedAt) {
  if (!openedAt) return ''
  const hours = (Date.now() - new Date(openedAt).getTime()) / 3600000
  if (hours < 1) return 'under 1h'
  if (hours < 24) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

function concernOverlay(concern) {
  const task = concern.openTasks?.[0]
  return {
    departmentCode: task?.departmentCode || 'other',
    shortDescription: shortDescription(task?.description || concern.summary),
    hoursOpen: hoursOpenLabel(concern.openedAt)
  }
}

function buildConcernMap(concerns) {
  const map = {}
  for (const c of concerns || []) {
    const placeId = c.placeId || c.relatedPlace?._id
    if (!placeId) continue
    map[placeId] = concernOverlay(c)
  }
  return map
}

function matchSharedCanonical(place) {
  const name = place.name || ''
  return CANONICAL_SHARED.find((c) => c.match.test(name))
}

function sortUnitCodes(a, b) {
  return String(a.unitCode || '').localeCompare(String(b.unitCode || ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  })
}

/**
 * @param {Array<object>} places - all place docs from Sanity
 * @param {Array<object>} concerns - open ritaConcern docs with openTasks
 */
function buildFieldPulse(places, concerns) {
  const concernMap = buildConcernMap(concerns)

  const sharedCandidates = places.filter((p) => !STRUCTURE_TYPES.has(p.type))
  const buildings = places
    .filter((p) => p.type === 'building')
    .sort((a, b) => (a.buildingNumber || 0) - (b.buildingNumber || 0))
  const accommodations = places.filter((p) => p.type === 'accommodation')
  const villaPlace = places.find((p) => p.type === 'villa') || null

  const sharedByKey = {}
  for (const place of sharedCandidates) {
    const canon = matchSharedCanonical(place)
    if (canon && !sharedByKey[canon.key]) {
      sharedByKey[canon.key] = place
    }
  }

  const sharedSpaces = CANONICAL_SHARED.map((canon) => {
    const place = sharedByKey[canon.key]
    const id = place?._id || null
    return {
      _id: id,
      name: place?.name || canon.displayName,
      displayName: canon.displayName,
      concern: id && concernMap[id] ? concernMap[id] : null
    }
  })

  const buildingCards = buildings.map((b) => {
    const units = accommodations
      .filter((u) => u.parentId === b._id)
      .sort(sortUnitCodes)
      .map((u) => ({
        _id: u._id,
        unitCode: u.unitCode,
        concern: concernMap[u._id] || null
      }))
    return {
      _id: b._id,
      buildingNumber: b.buildingNumber,
      name: `Building ${b.buildingNumber}`,
      units
    }
  })

  const villa = villaPlace
    ? {
        _id: villaPlace._id,
        name: 'Villa',
        unitCode: villaPlace.unitCode || 'Villa',
        concern: concernMap[villaPlace._id] || null
      }
    : null

  return {sharedSpaces, buildings: buildingCards, villa}
}

const PLACES_QUERY = `*[_type == "place" && defined(name)]{
  _id,
  name,
  unitCode,
  type,
  buildingNumber,
  capacity,
  floor,
  livingRoomSleeps,
  "parentId": parentPlace._ref,
  bedrooms[]{
    label,
    kingBeds,
    queenBeds,
    twinBeds,
    bunkBeds,
    twinCanConvertToKing,
    hasPrivateBathroom
  }
}`

const CONCERNS_WITH_TASKS_QUERY = `*[_type == "ritaConcern" && status == "open"] | order(openedAt desc) {
  _id,
  openedAt,
  summary,
  "placeId": relatedPlace._ref,
  relatedPlace->{_id, name, unitCode},
  "openTasks": *[_type == "ritaTask" && references(^._id) && status == "open"] | order(reportedAt desc) {
    description,
    reportedAt,
    "departmentCode": department->code,
    department->{code, titleEn, title}
  }
}`

module.exports = {
  CANONICAL_SHARED,
  buildFieldPulse,
  PLACES_QUERY,
  CONCERNS_WITH_TASKS_QUERY
}
