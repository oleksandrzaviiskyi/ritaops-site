const {createClient} = require('@sanity/client')
const {staffAuthorized} = require('./lib/staffAuth')

const cors = {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {statusCode: 204, headers: cors}
  if (event.httpMethod !== 'POST') return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}

  const body = JSON.parse(event.body || '{}')
  if (!staffAuthorized(event, body)) return {statusCode: 401, headers: cors, body: JSON.stringify({error: 'Unauthorized'})}

  const {id} = body
  if (!id) return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'id required'})}

  const client = createClient({
    projectId: '0po0panc',
    dataset: 'production',
    apiVersion: '2025-05-20',
    token: process.env.SANITY_TOKEN || process.env.SANITY_API_WRITE_TOKEN,
    useCdn: false
  })

  try {
    await client.patch(id).set({
      status: 'resolved',
      resolvedAt: new Date().toISOString()
    }).commit()

    return {statusCode: 200, headers: cors, body: JSON.stringify({ok: true, id})}
  } catch (err) {
    console.error('resolve-concern error:', err)
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
