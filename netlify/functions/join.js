const {createClient} = require('@sanity/client')
const {portalJoinCode} = require('./lib/joinCode')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false
})

const LIST_QUERY = `*[_type == "groupPortal" && defined(portalSlug.current) && defined(portalAccessToken)]{
  "slug": portalSlug.current,
  portalAccessToken
}`

exports.handler = async (event) => {
  const code = (event.queryStringParameters?.code || '').trim()

  if (!code) {
    return {statusCode: 400, body: 'Missing join code'}
  }

  try {
    const portals = await client.fetch(LIST_QUERY)
    const match = portals.find(
      (p) => portalJoinCode(p.slug, p.portalAccessToken) === code
    )

    if (!match) {
      return {statusCode: 404, body: 'Join link not found or expired'}
    }

    const host = event.headers.host || 'ritaops.com'
    const proto = event.headers['x-forwarded-proto'] || 'https'
    const location = `${proto}://${host}/portal/${encodeURIComponent(match.slug)}?token=${encodeURIComponent(match.portalAccessToken)}`

    return {
      statusCode: 302,
      headers: {Location: location, 'Cache-Control': 'no-store'}
    }
  } catch (err) {
    return {statusCode: 500, body: err.message}
  }
}
