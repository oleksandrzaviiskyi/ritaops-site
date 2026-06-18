const {staffAuthorized} = require('./lib/staffAuth')

const POSTER_TOKEN = process.env.POSTER_API_TOKEN
const POSTER_BASE = 'https://joinposter.com/api'

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store'
}

async function posterGet(method) {
  const url = `${POSTER_BASE}/${method}?token=${POSTER_TOKEN}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Poster API error: ${res.status} ${method}`)
  const json = await res.json()
  if (json.error) throw new Error(`Poster error: ${json.error}`)
  return json.response
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors}
  }

  const body = event.body ? JSON.parse(event.body) : {}

  if (!staffAuthorized(event, body)) {
    return {statusCode: 401, headers: cors, body: JSON.stringify({error: 'Staff auth required'})}
  }

  try {
    const storages = await posterGet('storage.getStorages')

    const storageItems = await Promise.all(
      (storages || []).map(s =>
        posterGet(`storage.getStorageLeftovers&storage_id=${s.storage_id}`)
          .then(items => ({storageId: s.storage_id, name: s.storage_name, items: items || []}))
          .catch(() => ({storageId: s.storage_id, name: s.storage_name, items: []}))
      )
    )

    const result = storageItems.map(s => ({
      storageId: s.storageId,
      name: s.name,
      items: (s.items || []).map(i => ({
        id: i.ingredient_id,
        name: i.ingredient_name,
        unit: i.ingredient_unit,
        inStock: parseFloat(i.ingredient_left || 0),
        minStock: parseFloat(i.limit_value || 0),
        needsReorder: parseFloat(i.ingredient_left || 0) <= parseFloat(i.limit_value || 0)
      }))
    }))

    const needsReorder = result
      .flatMap(s => s.items.filter(i => i.needsReorder && i.minStock > 0))

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        storages: result,
        needsReorder,
        syncedAt: new Date().toISOString()
      })
    }
  } catch (err) {
    console.error('poster-sync error:', err.message)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({error: err.message})
    }
  }
}
