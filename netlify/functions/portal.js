const {createClient} = require('@sanity/client')
const {enrichPortal} = require('./lib/progress')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false
})

const PORTAL_QUERY = `*[_type == "groupPortal" && portalSlug.current == $slug][0]{
  _id, groupName, checkIn, checkOut, totalGuests, adults, children, eventType,
  status, progressPercent, flights, transferNeeded, dietaryRestrictions, menuPlan,
  activities, specialRequests, organizerEmail, portalAccessToken, portalSlug
}`

const ORGANIZER_WRITABLE = [
  'groupName',
  'checkIn',
  'checkOut',
  'totalGuests',
  'adults',
  'children',
  'eventType',
  'flights',
  'transferNeeded',
  'dietaryRestrictions',
  'menuPlan',
  'activities',
  'specialRequests',
  'organizerEmail'
]

exports.handler = async (event) => {
  const headers = {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}

  if (event.httpMethod === 'OPTIONS') return {statusCode: 204, headers}

  const {slug, token} = event.queryStringParameters || {}

  if (event.httpMethod === 'GET') {
    if (!slug || !token) {
      return {statusCode: 400, headers, body: JSON.stringify({error: 'Нужны slug и token'})}
    }
    const doc = await client.fetch(PORTAL_QUERY, {slug})
    if (!doc || doc.portalAccessToken !== token) {
      return {statusCode: 404, headers, body: JSON.stringify({error: 'Портал не найден или неверная ссылка'})}
    }
    const enriched = enrichPortal(doc)
    const {portalAccessToken: _, portalSlug: __, ...safe} = enriched
    return {statusCode: 200, headers, body: JSON.stringify({portal: safe})}
  }

  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body || '{}')
    const {slug: bodySlug, token: bodyToken, data} = body
    const s = bodySlug || slug
    const t = bodyToken || token
    if (!s || !t || !data) {
      return {statusCode: 400, headers, body: JSON.stringify({error: 'Нужны slug, token, data'})}
    }
    const doc = await client.fetch(PORTAL_QUERY, {slug: s})
    if (!doc || doc.portalAccessToken !== t) {
      return {statusCode: 403, headers, body: JSON.stringify({error: 'Доступ запрещён'})}
    }
    const patch = {}
    for (const key of ORGANIZER_WRITABLE) {
      if (key in data) patch[key] = data[key]
    }
    const merged = {...doc, ...patch}
    const enriched = enrichPortal(merged)

    await client
      .patch(doc._id)
      .set({
        ...patch,
        progressPercent: enriched.progressPercent,
        status: enriched.status,
        lastPortalSaveAt: new Date().toISOString()
      })
      .commit()

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        progressPercent: enriched.progressPercent,
        progressSections: enriched.progressSections,
        status: enriched.status
      })
    }
  }

  return {statusCode: 405, headers, body: JSON.stringify({error: 'Method not allowed'})}
}
