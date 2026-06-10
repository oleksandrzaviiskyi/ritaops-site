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

    const allTypes = await client.fetch(`
      array::unique(*[]._type)
    `)

    // Skip Sanity-internal types (image assets, retention policies etc.) — not useful for Rita
    const contentTypes = allTypes.filter(
      (t) => !String(t).startsWith('sanity.') && !String(t).startsWith('system.')
    )

    const allData = {}
    for (const type of contentTypes) {
      allData[type] = await client.fetch(`*[_type == $type][0...50]`, {type})
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(allData)
    }
  } catch (err) {
    return {statusCode: 500, headers, body: JSON.stringify({error: err.message})}
  }
}
