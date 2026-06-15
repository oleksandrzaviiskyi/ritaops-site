const {createClient} = require('@sanity/client')

const cors = {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {statusCode: 204, headers: cors}
  if (event.httpMethod !== 'POST') return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}

  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch(e) {}

  const {id, staffKey} = body
  console.log('[resolve-concern] id:', id, 'staffKey:', staffKey)

  if (!id) return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'id required'})}

  const writeToken = process.env.SANITY_TOKEN || process.env.SANITY_API_WRITE_TOKEN
  if (!writeToken) return {statusCode: 500, headers: cors, body: JSON.stringify({error: 'SANITY_TOKEN not set'})}

  const client = createClient({
    projectId: '0po0panc',
    dataset: 'production',
    apiVersion: '2025-05-20',
    token: writeToken,
    useCdn: false
  })

  try {
    const result = await client.patch(id).set({
      status: 'resolved',
      resolvedAt: new Date().toISOString()
    }).commit()

    console.log('[resolve-concern] patched:', result._id)
    return {statusCode: 200, headers: cors, body: JSON.stringify({ok: true, id: result._id})}
  } catch (err) {
    console.error('[resolve-concern] error:', err.message)
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
