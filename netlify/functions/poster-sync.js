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
    // Запрашиваем параллельно: склады, ингредиенты с остатками, категории
    const [storages, ingredients, categories] = await Promise.all([
      posterGet('storage.getStorages'),
      posterGet('storage.getIngredients'),
      posterGet('menu.getCategories')
    ])

    // Группируем ингредиенты по складам
    const byStorage = {}
    for (const item of ingredients || []) {
      const storageId = item.storage_id || 'main'
      if (!byStorage[storageId]) byStorage[storageId] = []
      byStorage[storageId].push({
        id: item.ingredient_id,
        name: item.ingredient_name,
        unit: item.ingredient_unit,
        inStock: parseFloat(item.ingredient_left || 0),
        minStock: parseFloat(item.ingredient_limit || 0),
        needsReorder: parseFloat(item.ingredient_left || 0) <= parseFloat(item.ingredient_limit || 0)
      })
    }

    // Строим итоговый список по складам
    const result = (storages || []).map(s => ({
      storageId: s.storage_id,
      name: s.storage_name,
      items: byStorage[s.storage_id] || []
    }))

    // Список всего что нужно дозакупить
    const needsReorder = (ingredients || [])
      .filter(i => parseFloat(i.ingredient_left || 0) <= parseFloat(i.ingredient_limit || 0))
      .map(i => ({
        id: i.ingredient_id,
        name: i.ingredient_name,
        unit: i.ingredient_unit,
        inStock: parseFloat(i.ingredient_left || 0),
        minStock: parseFloat(i.ingredient_limit || 0),
        shortage: parseFloat(i.ingredient_limit || 0) - parseFloat(i.ingredient_left || 0)
      }))

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
