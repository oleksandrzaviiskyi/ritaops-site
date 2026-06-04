const { createClient } = require('@sanity/client')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false,
})

const PORTAL_QUERY = `*[_type == "groupPortal" && portalSlug.current == $slug][0]{
  _id, groupName, checkIn, checkOut, totalGuests, adults, children, eventType,
  status, progressPercent, flights, transferNeeded, dietaryRestrictions, menuPlan,
  activities, specialRequests, organizerEmail, portalAccessToken, portalSlug
}`

exports.handler = async (event) => {
  const slug = event.queryStringParameters?.slug
  const token = event.queryStringParameters?.token

  if (!slug || !token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Нужны slug и token' }) }
  }

  try {
    const doc = await client.fetch(PORTAL_QUERY, { slug })
    if (!doc || doc.portalAccessToken !== token) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Портал не найден или неверная ссылка' }) }
    }
    const { portalAccessToken: _, ...safe } = doc
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portal: safe }),
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
