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

function readJoinCode(event) {
  const fromQuery = event.queryStringParameters?.code
  const fromPath = event.path?.split('/join/')?.[1]
  const fromParams = event.pathParameters?.code
  const raw = fromQuery || fromPath || fromParams || ''
  return decodeURIComponent(raw.split('?')[0].split('/')[0]).trim()
}

function joinBridgeHtml(slug, token) {
  const portalPath = `/portal/${slug}`
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"/>
<title>Opening portal…</title>
<script>
sessionStorage.setItem('portalSlug', ${JSON.stringify(slug)});
sessionStorage.setItem('portalToken', ${JSON.stringify(token)});
location.replace(${JSON.stringify(portalPath)});
</script>
</head><body><p>Opening portal…</p></body></html>`
}

exports.handler = async (event) => {
  const code = readJoinCode(event)

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

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      },
      body: joinBridgeHtml(match.slug, match.portalAccessToken)
    }
  } catch (err) {
    return {statusCode: 500, body: err.message}
  }
}
