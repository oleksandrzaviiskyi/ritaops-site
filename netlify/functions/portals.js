const { createClient } = require('@sanity/client')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false,
})

const LIST_QUERY = `*[_type == "groupPortal"] | order(checkIn asc) {
  _id, groupName, checkIn, checkOut, totalGuests, status, progressPercent,
  "slug": portalSlug.current,
  portalAccessToken
}`

exports.handler = async () => {
  try {
    const docs = await client.fetch(LIST_QUERY)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portals: docs }),
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
