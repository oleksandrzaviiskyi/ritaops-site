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
  status, progressPercent, lastPortalSaveAt, flights, transferNeeded,
  dietaryRestrictions, menuPlan, activities, specialRequests, organizerEmail,
  "slug": portalSlug.current,
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        portal: {
          ...safe,
          property: 'Las Canas Beach Retreat',
          organizerPortalUrl:
            staffAuthorized(event) && portalAccessToken
              ? `https://ritaops.com/portal/${slug}?token=${portalAccessToken}`
              : null
        }
      })
    }
  } catch (err) {
    return {statusCode: 500, headers, body: JSON.stringify({error: err.message})}
  }
}
