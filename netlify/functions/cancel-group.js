const {createClient} = require('@sanity/client')
const {staffAuthorized} = require('./lib/staffAuth')
const {triggerRitaReflect} = require('./lib/triggerRitaReflect')

const writeToken = process.env.SANITY_TOKEN || process.env.SANITY_API_WRITE_TOKEN

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: writeToken,
  useCdn: false
})

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
}

const VALID_CAUSES = new Set([
  'personal',
  'health',
  'financial',
  'climate',
  'political',
  'organizational',
  'other',
  'unknown'
])

function buildCancellationDescription(portal, reason) {
  const parts = [
    `Отмена бронирования: «${portal.groupName || 'без названия'}»`,
    portal.checkIn ? `заезд ${portal.checkIn}` : null,
    portal.totalGuests != null ? `${portal.totalGuests} гостей` : null
  ].filter(Boolean)

  if (reason) parts.push(`Причина: ${reason}`)
  return parts.join(' — ')
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors}
  }

  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}
  }

  try {
    const body = JSON.parse(event.body || '{}')

    if (!staffAuthorized(event, body, context)) {
      return {statusCode: 401, headers: cors, body: JSON.stringify({error: 'Staff key required'})}
    }

    if (!writeToken) {
      return {statusCode: 500, headers: cors, body: JSON.stringify({error: 'SANITY_TOKEN not configured'})}
    }

    const groupSlug = String(body.groupSlug || '').trim()
    if (!groupSlug) {
      return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'groupSlug required'})}
    }

    const reason = String(body.cancellationReason || body.reason || '').trim()
    const causeRaw = String(body.cancellationCause || body.cause || 'unknown').trim()
    const cancellationCause = VALID_CAUSES.has(causeRaw) ? causeRaw : 'unknown'
    const cancellationIsPrivate = Boolean(
      body.cancellationIsPrivate ?? (cancellationCause === 'personal' || cancellationCause === 'health')
    )

    const portal = await client.fetch(
      `*[_type == "groupPortal" && portalSlug.current == $slug][0]{
        _id, groupName, checkIn, checkOut, totalGuests, eventType, status
      }`,
      {slug: groupSlug}
    )
    if (!portal?._id) {
      return {statusCode: 404, headers: cors, body: JSON.stringify({error: 'Group not found'})}
    }
    if (portal.status === 'cancelled') {
      return {statusCode: 200, headers: cors, body: JSON.stringify({ok: true, alreadyCancelled: true})}
    }

    const cancelledAt = new Date().toISOString()
    const safeId = portal._id.replace(/[^a-zA-Z0-9]/g, '-')
    const eventId = `cancellation-${safeId}`

    await client
      .patch(portal._id)
      .set({
        status: 'cancelled',
        cancelledAt,
        cancellationReason: reason || undefined,
        cancellationCause,
        cancellationIsPrivate
      })
      .commit()

    await client.createIfNotExists({
      _id: eventId,
      _type: 'ritaEvent',
      description: buildCancellationDescription(portal, reason),
      eventType: 'cancellation',
      source: 'system',
      timestamp: cancelledAt,
      processed: false,
      rawData: JSON.stringify({
        groupPortalId: portal._id,
        groupName: portal.groupName,
        checkIn: portal.checkIn,
        checkOut: portal.checkOut,
        totalGuests: portal.totalGuests,
        eventType: portal.eventType,
        cancellationReason: reason,
        cancellationCause,
        cancellationIsPrivate
      }),
      relatedGroup: {_type: 'reference', _ref: portal._id}
    })

    await triggerRitaReflect()

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        ok: true,
        status: 'cancelled',
        eventId,
        needsReason: !reason
      })
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
