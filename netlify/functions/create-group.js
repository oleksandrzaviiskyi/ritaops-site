const crypto = require('node:crypto')
const {createClient} = require('@sanity/client')
const {portalJoinCode} = require('./lib/joinCode')
const {uniqueSlug} = require('./lib/slugFromGroup')
const {staffAuthorized} = require('./lib/staffAuth')

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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors}
  }

  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}
  }

  try {
    const body = JSON.parse(event.body || '{}')

    if (!staffAuthorized(event, body)) {
      return {statusCode: 401, headers: cors, body: JSON.stringify({error: 'Staff key required'})}
    }

    const groupName = String(body.groupName || '').trim()
    if (!groupName) {
      return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'groupName required'})}
    }

    const guests = body.totalGuests != null ? Number(body.totalGuests) : undefined
    const slug = await uniqueSlug(client, groupName, body.checkIn)
    const portalAccessToken = crypto.randomBytes(32).toString('hex')
    const portalId = `groupPortal.${slug.replace(/[^a-z0-9-]/g, '-')}`

    const internalNotes = []
    if (body.organizerName) {
      internalNotes.push(`Organizer: ${String(body.organizerName).trim()}`)
    }

    const doc = {
      _id: portalId,
      _type: 'groupPortal',
      groupName,
      portalSlug: {_type: 'slug', current: slug},
      portalAccessToken,
      status: 'new',
      progressPercent: 0,
      children: 0,
      transferNeeded: true
    }

    if (body.checkIn) doc.checkIn = body.checkIn
    if (body.checkOut) doc.checkOut = body.checkOut
    if (body.eventType) doc.eventType = body.eventType
    if (body.organizerEmail) doc.organizerEmail = String(body.organizerEmail).trim()
    if (guests != null && !Number.isNaN(guests)) {
      doc.totalGuests = guests
      doc.adults = guests
    }
    if (internalNotes.length) doc.internalNotes = internalNotes.join('\n')

    await client.createOrReplace(doc)

    const host = event.headers.host || 'ritaops.com'
    const proto = event.headers['x-forwarded-proto'] || 'https'
    const base = `${proto}://${host}`
    const code = portalJoinCode(slug, portalAccessToken)

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        slug,
        organizerLink: `${base}/join/${encodeURIComponent(code)}`,
        guestLink: `${base}/guest/${encodeURIComponent(slug)}`
      })
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
