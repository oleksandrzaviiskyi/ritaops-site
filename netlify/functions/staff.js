const {createClient} = require('@sanity/client')
const {staffAuthorized} = require('./lib/staffAuth')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false
})

const STAFF_QUERY = `*[_type == "staffMember"] {
  name,
  role,
  department,
  phone,
  email,
  notes
}`

const SHIFTS_QUERY = `*[_type == "staffShift" && date == $today] {
  staffMember,
  role,
  shiftStart,
  shiftEnd,
  isRestDay
}`

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  }

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers}
  }

  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, headers, body: JSON.stringify({error: 'Method not allowed'})}
  }

  try {
    if (!staffAuthorized(event, null, context)) {
      return {statusCode: 401, headers, body: JSON.stringify({error: 'Staff auth required'})}
    }

    const today =
      event.queryStringParameters?.today || new Date().toISOString().slice(0, 10)

    const [staff, shiftsToday] = await Promise.all([
      client.fetch(STAFF_QUERY),
      client.fetch(SHIFTS_QUERY, {today})
    ])

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({staff, shiftsToday, today})
    }
  } catch (err) {
    return {statusCode: 500, headers, body: JSON.stringify({error: err.message})}
  }
}
