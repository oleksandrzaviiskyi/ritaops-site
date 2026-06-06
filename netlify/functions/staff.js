const {createClient} = require('@sanity/client')
const {staffAuthorized} = require('./lib/staffAuth')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false
})

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

    const today = new Date().toISOString().split('T')[0]

    const staff = await client.fetch(`
      *[_type == "people" && personCategory == "staff"] {
        "name": fullName,
        "department": department->title,
        "position": position->title,
        email,
        "phone": phone
      }
    `)

    const shiftsToday = await client.fetch(
      `
      *[_type == "staffShift" && date == $today] {
        staffMember,
        role,
        shiftStart,
        shiftEnd,
        isRestDay
      }
    `,
      {today}
    )

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({staff, shiftsToday, today})
    }
  } catch (err) {
    return {statusCode: 500, headers, body: JSON.stringify({error: err.message})}
  }
}
