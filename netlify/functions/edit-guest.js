const {createClient} = require('@sanity/client')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false
})

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
}

const SUBMISSION_QUERY = `*[_type == "guestSubmission" && editToken == $token][0]{
  _id,
  firstName,
  lastName,
  email,
  phone,
  guestName,
  adults,
  children,
  flights,
  dietaryRestrictions,
  activities,
  massageRequested,
  specialRequests,
  editTokenExpiresAt,
  "groupSlug": groupPortal->portalSlug.current,
  "groupName": groupPortal->groupName,
  "checkIn": groupPortal->checkIn,
  "checkOut": groupPortal->checkOut
}`

function readToken(event) {
  const fromQuery = event.queryStringParameters?.token
  const fromPath = event.path?.match(/\/edit\/([^/?]+)/)?.[1]
  const fromBody = (() => {
    try {
      const b = JSON.parse(event.body || '{}')
      return b.token
    } catch {
      return null
    }
  })()
  const raw = fromQuery || fromPath || fromBody || ''
  return decodeURIComponent(String(raw).trim())
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

function tokenValid(doc) {
  if (!doc?.editTokenExpiresAt) return false
  return new Date(doc.editTokenExpiresAt).getTime() > Date.now()
}

function validateContact(body) {
  const firstName = String(body.firstName || '').trim()
  const lastName = String(body.lastName || '').trim()
  const email = String(body.email || '').trim()
  const phone = String(body.phone || '').trim()
  const guestName = [firstName, lastName].filter(Boolean).join(' ')
  if (!firstName || !lastName || !email || !phone) {
    return {error: 'firstName, lastName, email, and phone are required'}
  }
  return {firstName, lastName, email, phone, guestName}
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors}
  }

  const token = readToken(event)

  if (event.httpMethod === 'GET') {
    if (!token) {
      return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'token required'})}
    }
    try {
      const doc = await client.fetch(SUBMISSION_QUERY, {token})
      if (!doc?._id) {
        return {statusCode: 404, headers: cors, body: JSON.stringify({error: 'Submission not found'})}
      }
      if (!tokenValid(doc)) {
        return {
          statusCode: 410,
          headers: cors,
          body: JSON.stringify({error: 'Edit link expired. Request a new link from the guest form.'})
        }
      }
      const {groupSlug, groupName, checkIn, checkOut, editTokenExpiresAt, ...submission} = doc
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          submission,
          group: {
            groupName,
            checkIn,
            checkOut,
            groupSlug,
            property: 'Las Canas Beach Retreat'
          },
          expiresAt: editTokenExpiresAt
        })
      }
    } catch (err) {
      return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}')
      const postToken = readToken(event)
      if (!postToken) {
        return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'token required'})}
      }

      const doc = await client.fetch(SUBMISSION_QUERY, {token: postToken})
      if (!doc?._id) {
        return {statusCode: 404, headers: cors, body: JSON.stringify({error: 'Submission not found'})}
      }
      if (!tokenValid(doc)) {
        return {
          statusCode: 410,
          headers: cors,
          body: JSON.stringify({error: 'Edit link expired. Request a new link from the guest form.'})
        }
      }

      const contact = validateContact(body)
      if (contact.error) {
        return {statusCode: 400, headers: cors, body: JSON.stringify({error: contact.error})}
      }

      await client
        .patch(doc._id)
        .set({
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          guestName: contact.guestName,
          adults: body.adults != null ? Number(body.adults) : undefined,
          children: body.children != null ? Number(body.children) : 0,
          flights: withKeys(body.flights),
          dietaryRestrictions: withKeys(body.dietaryRestrictions),
          activities: withKeys(body.activities),
          massageRequested: Boolean(body.massageRequested),
          specialRequests: body.specialRequests || undefined,
          lastEditedAt: new Date().toISOString()
        })
        .commit()

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ok: true})
      }
    } catch (err) {
      return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
    }
  }

  return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}
}
