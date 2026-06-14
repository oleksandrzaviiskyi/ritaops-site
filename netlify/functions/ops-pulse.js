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

const ROOMING_QUERY = `*[_type == "groupRoomingList"] | order(stayDateStart asc) {
  _id,
  groupId,
  stayDateStart,
  stayDateEnd,
  totalOccupants,
  sourceFileName,
  "relatedGroupId": relatedGroup._ref,
  rooms[]{
    roomNumber,
    roomType,
    "occupants": occupants[]{name, gender, age}
  }
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

    const [pulse, places, concernsRaw, roomingLists] = await Promise.all([
      client.fetch(PULSE_QUERY),
      client.fetch(PLACES_QUERY),
      client.fetch(CONCERNS_WITH_TASKS_QUERY),
      client.fetch(ROOMING_QUERY)
    ])

    const concerns = (concernsRaw || []).map((c) => ({
      ...c,
      deptDetails: deptDetailsFromTasks(c.openTasks)
    }))

    const field = buildFieldPulse(places || [], concernsRaw || [])

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        pulse: pulse || {coherenceStatement: null, balanceStatus: null},
        field,
        concerns,
        places: places || []
      })
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
