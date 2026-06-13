const {createClient} = require('@sanity/client')
const {staffAuthorized} = require('./lib/staffAuth')

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

const CONCERNS_QUERY = `*[_type == "ritaConcern" && status == "open"] | order(openedAt asc) {
  _id,
  openedAt,
  summary,
  relatedPlace->{name, unitCode},
  "openTasks": count(*[_type == "ritaTask" && references(^._id) && status == "open"]),
  "depts": array::unique(*[_type == "ritaTask" && references(^._id) && status == "open"].department->code)
}`

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

    const [pulse, concerns] = await Promise.all([
      client.fetch(PULSE_QUERY),
      client.fetch(CONCERNS_QUERY)
    ])

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        pulse: pulse || {coherenceStatement: null, balanceStatus: null},
        concerns: concerns || []
      })
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
