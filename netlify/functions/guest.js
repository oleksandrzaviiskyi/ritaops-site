const {createClient} = require('@sanity/client')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false
})

const GROUP_QUERY = `*[_type == "groupPortal" && portalSlug.current == $groupSlug][0]{
  _id,
  groupName,
  checkIn,
  checkOut,
  "groupSlug": portalSlug.current
}`

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
}

function readGroupSlug(event) {
  const fromQuery = event.queryStringParameters?.groupSlug
  const fromPath = event.path?.split('/guest/')?.[1]
  const fromParams = event.pathParameters?.groupSlug
  const raw = fromQuery || fromPath || fromParams || ''
  return decodeURIComponent(raw.split('?')[0].split('/')[0]).trim()
}

function randomKey() {
  return Math.random().toString(36).slice(2, 12)
}

function withKeys(items) {
  if (!Array.isArray(items)) return []
  return items.map((item) => ({
    ...item,
    _key: item._key || randomKey()
  }))
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors}
  }

  const groupSlug = readGroupSlug(event)

  if (event.httpMethod === 'GET') {
    if (!groupSlug) {
      return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'groupSlug required'})}
    }
    try {
      const group = await client.fetch(GROUP_QUERY, {groupSlug})
      if (!group) {
        return {statusCode: 404, headers: cors, body: JSON.stringify({error: 'Group not found'})}
      }
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          group: {
            groupName: group.groupName,
            checkIn: group.checkIn,
            checkOut: group.checkOut,
            groupSlug: group.groupSlug,
            property: 'Las Canas Beach Retreat'
          }
        })
      }
    } catch (err) {
      return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}')
      const slug = body.groupSlug || groupSlug
      if (!slug) {
        return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'groupSlug required'})}
      }
      const firstName = String(body.firstName || '').trim()
      const lastName = String(body.lastName || '').trim()
      const email = String(body.email || '').trim()
      const phone = String(body.phone || '').trim()
      const guestName =
        [firstName, lastName].filter(Boolean).join(' ') ||
        String(body.guestName || '').trim()

      if (!firstName || !lastName || !email || !phone) {
        return {
          statusCode: 400,
          headers: cors,
          body: JSON.stringify({error: 'firstName, lastName, email, and phone are required'})
        }
      }

      const portal = await client.fetch(GROUP_QUERY, {groupSlug: slug})
      if (!portal) {
        return {statusCode: 404, headers: cors, body: JSON.stringify({error: 'Group not found'})}
      }

      const doc = {
        _type: 'guestSubmission',
        groupPortal: {_type: 'reference', _ref: portal._id},
        submittedAt: new Date().toISOString(),
        firstName,
        lastName,
        email,
        phone,
        guestName,
        adults: body.adults != null ? Number(body.adults) : undefined,
        children: body.children != null ? Number(body.children) : 0,
        flights: withKeys(body.flights),
        dietaryRestrictions: withKeys(body.dietaryRestrictions),
        activities: withKeys(body.activities),
        massageRequested: Boolean(body.massageRequested),
        specialRequests: body.specialRequests || undefined
      }

      const created = await client.create(doc)

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ok: true, id: created._id})
      }
    } catch (err) {
      return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
    }
  }

  return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}
}
