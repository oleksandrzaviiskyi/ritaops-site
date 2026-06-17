const {createClient} = require('@sanity/client')
const {staffAuthorized} = require('./lib/staffAuth')
const {
  buildFieldPulse,
  PLACES_QUERY,
  CONCERNS_WITH_TASKS_QUERY
} = require('./lib/buildFieldPulse')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false
})

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
}

const PULSE_QUERY = `*[_id == "lasCanasPulse.lcbr"][0]{
  "coherenceStatement": coherence.coherenceStatement,
  "balanceStatus": coherence.balanceStatus,
  "lastSyncedAt": coherence.lastSyncedAt
}`

// Fix: include fullName explicitly + schedules so Rita knows every person
const PEOPLE_QUERY = `*[_type == "people"] | order(fullName asc) {
  _id,
  "name": fullName,
  fullName,
  "role": coalesce(position->title, role),
  department->{code, titleEn},
  position->{title},
  personCategory,
  workScheduleRegular,
  workScheduleGroups,
  lunchTime,
  active
}`

const RESPONSIBILITY_QUERY = `*[_type == "responsibilityDomain"]{
  _id, title, authorityLevel,
  "holder": currentHolder->{"name": fullName, "role": position->title},
  "people": relatedPeople[]->{"name": fullName, "role": position->title}
}`

const PORTALS_QUERY = `*[_type == "groupPortal" && status != "cancelled"] | order(checkIn asc) {
  _id,
  "title": groupName,
  groupName,
  checkIn,
  checkOut,
  totalGuests,
  "groupId": groupId,
  "categoryName": category->{name}
}`

const ROOMING_QUERY = `*[_type == "groupRoomingList"] | order(stayDateStart asc) {
  _id, groupId, stayDateStart, stayDateEnd, totalOccupants,
  "relatedGroupRef": relatedGroup._ref,
  rooms[]{roomNumber, roomType, "occupants": occupants[]{name, gender, age}}
}`

const RITA_QUESTIONS_QUERY = `*[_type == "ritaQuestion" && status == "open"] | order(askedAt desc) {
  _id, question, context, askedAt
}`

const CONCERNS_OPEN_QUERY = `*[_type == "ritaConcern" && status == "open"] | order(openedAt desc) {
  _id, summary, openedAt,
  "place": relatedPlace->{name, unitCode}
}`

function deptDetailsFromTasks(openTasks) {
  const seen = new Set()
  const list = []
  for (const task of openTasks || []) {
    const dept = task.department
    if (!dept?.code || seen.has(dept.code)) continue
    seen.add(dept.code)
    list.push(dept)
  }
  return list
}

function findGroupTurnovers(portals) {
  if (!portals || portals.length < 2) return []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const targetDate = new Date(today)
  targetDate.setDate(targetDate.getDate() + 2)
  const targetIso = targetDate.toISOString().slice(0, 10)

  const checkouts = new Map()
  const checkins = new Map()

  for (const portal of portals) {
    if (portal.checkOut) {
      if (!checkouts.has(portal.checkOut)) checkouts.set(portal.checkOut, [])
      checkouts.get(portal.checkOut).push(portal)
    }
    if (portal.checkIn) {
      if (!checkins.has(portal.checkIn)) checkins.set(portal.checkIn, [])
      checkins.get(portal.checkIn).push(portal)
    }
  }

  const turnovers = []

  for (const [date, outGroups] of checkouts) {
    if (checkins.has(date) && date === targetIso) {
      const inGroups = checkins.get(date)
      turnovers.push({
        date,
        checkingOut: outGroups.map(g => g.groupName || g.title),
        checkingIn: inGroups.map(g => g.groupName || g.title),
        totalGuestsOut: outGroups.reduce((s, g) => s + (g.totalGuests || 0), 0),
        totalGuestsIn: inGroups.reduce((s, g) => s + (g.totalGuests || 0), 0)
      })
    }
  }

  return turnovers
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors}
  }

  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}
  }

  try {
    const body = event.httpMethod === 'GET' ? null : JSON.parse(event.body || '{}')
    if (!staffAuthorized(event, body, context)) {
      return {statusCode: 401, headers: cors, body: JSON.stringify({error: 'Staff auth required'})}
    }

    const [
      pulse,
      places,
      concernsRaw,
      people,
      responsibilities,
      portals,
      roomingLists,
      openQuestions,
      openConcerns
    ] = await Promise.all([
      client.fetch(PULSE_QUERY),
      client.fetch(PLACES_QUERY),
      client.fetch(CONCERNS_WITH_TASKS_QUERY),
      client.fetch(PEOPLE_QUERY),
      client.fetch(RESPONSIBILITY_QUERY),
      client.fetch(PORTALS_QUERY),
      client.fetch(ROOMING_QUERY),
      client.fetch(RITA_QUESTIONS_QUERY),
      client.fetch(CONCERNS_OPEN_QUERY)
    ])

    const concerns = (concernsRaw || []).map((c) => ({
      ...c,
      deptDetails: deptDetailsFromTasks(c.openTasks)
    }))

    const field = buildFieldPulse(places || [], concernsRaw || [])
    const groupTurnovers = findGroupTurnovers(portals || [])

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        pulse: pulse || {},
        field,
        concerns,
        places: places || [],
        people: people || [],
        responsibilities: responsibilities || [],
        portals: portals || [],
        roomingLists: roomingLists || [],
        openQuestions: openQuestions || [],
        openConcerns: openConcerns || [],
        groupTurnovers
      })
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
