const {createClient} = require('@sanity/client')
const {enrichPortal} = require('./lib/progress')
const {portalJoinCode} = require('./lib/joinCode')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false
})

const PORTAL_QUERY = `*[_type == "groupPortal" && portalSlug.current == $slug][0]{
  _id, groupName, checkIn, checkOut, totalGuests, adults, children, eventType,
  status, progressPercent, lastPortalSaveAt, flights, transferNeeded,
  dietaryRestrictions, menuPlan, activities, specialRequests, organizerEmail,
  "slug": portalSlug.current,
  "groupSlug": portalSlug.current,
  portalAccessToken
}`

function staffAuthorized(event) {
  const secret = process.env.DASHBOARD_SECRET
  if (!secret) return true
  const key = (event.queryStringParameters || {}).key
  return key === secret
}

exports.handler = async (event) => {
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

  if (!staffAuthorized(event)) {
    return {statusCode: 401, headers, body: JSON.stringify({error: 'Требуется ключ staff (?key=)'})}
  }

  const slug = (event.queryStringParameters || {}).slug
  if (!slug) {
    return {statusCode: 400, headers, body: JSON.stringify({error: 'Нужен slug'})}
  }

  try {
    const doc = await client.fetch(PORTAL_QUERY, {slug})
    if (!doc) {
      return {statusCode: 404, headers, body: JSON.stringify({error: 'Группа не найдена'})}
    }

    const enriched = enrichPortal(doc)
    const {portalAccessToken, ...safe} = enriched
    const host = event.headers.host || 'ritaops.com'
    const proto = event.headers['x-forwarded-proto'] || 'https'
    const base = `${proto}://${host}`
    const staff = staffAuthorized(event)

    let organizerJoinUrl = null
    let organizerPortalUrl = null
    let guestFormUrl = null
    if (staff && portalAccessToken && slug) {
      const code = portalJoinCode(slug, portalAccessToken)
      organizerJoinUrl = `${base}/join/${encodeURIComponent(code)}`
      organizerPortalUrl = `${base}/portal/${encodeURIComponent(slug)}?token=${encodeURIComponent(portalAccessToken)}`
      guestFormUrl = `${base}/guest/${encodeURIComponent(slug)}`
    } else if (staff && slug) {
      guestFormUrl = `${base}/guest/${encodeURIComponent(slug)}`
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        portal: {
          ...safe,
          property: 'Las Canas Beach Retreat',
          organizerJoinUrl,
          organizerPortalUrl,
          guestFormUrl,
          groupSlug: slug
        }
      })
    }
  } catch (err) {
    return {statusCode: 500, headers, body: JSON.stringify({error: err.message})}
  }
}
