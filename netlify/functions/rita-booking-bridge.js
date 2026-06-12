const {createClient} = require('@sanity/client')
const {triggerRitaReflect} = require('./lib/triggerRitaReflect')

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
}

const writeToken = process.env.SANITY_TOKEN || process.env.SANITY_API_WRITE_TOKEN

const sanity = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  useCdn: false,
  token: writeToken,
  apiVersion: '2024-01-01'
})

function readWebhookSecret(event) {
  const headers = event.headers || {}
  return (
    headers['x-rita-secret'] ||
    headers['X-Rita-Secret'] ||
    headers['X-RITA-SECRET'] ||
    ''
  ).trim()
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors}
  }

  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}
  }

  const expectedSecret = (process.env.RITA_WEBHOOK_SECRET || '').trim()
  if (!expectedSecret) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({error: 'RITA_WEBHOOK_SECRET not configured'})
    }
  }

  const receivedSecret = readWebhookSecret(event)
  if (!receivedSecret || receivedSecret !== expectedSecret) {
    return {statusCode: 401, headers: cors, body: JSON.stringify({error: 'Unauthorized'})}
  }

  if (!writeToken) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({error: 'SANITY_TOKEN not configured'})
    }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch (err) {
    return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'Invalid JSON body'})}
  }

  if (body.status === 'cancelled') {
    if (!body._id) {
      return {statusCode: 400, headers: cors, body: JSON.stringify({error: '_id is required'})}
    }

    const safeId = body._id.replace(/[^a-zA-Z0-9]/g, '-')
    const eventId = `cancellation-${safeId}`
    const reason = String(body.cancellationReason || '').trim()
    const cancellationCause = String(body.cancellationCause || 'unknown').trim()
    const cancellationIsPrivate = Boolean(body.cancellationIsPrivate)

    const description =
      `Отмена бронирования: «${body.groupName || 'без названия'}»` +
      (body.checkIn ? ` — заезд ${body.checkIn}` : '') +
      (reason ? `. Причина: ${reason}` : '')

    try {
      await sanity.createIfNotExists({
        _id: eventId,
        _type: 'ritaEvent',
        description,
        eventType: 'cancellation',
        source: 'system',
        timestamp: body.cancelledAt || new Date().toISOString(),
        processed: false,
        rawData: JSON.stringify({
          groupPortalId: body._id,
          groupName: body.groupName,
          checkIn: body.checkIn,
          checkOut: body.checkOut,
          totalGuests: body.totalGuests,
          eventType: body.eventType,
          cancellationReason: reason,
          cancellationCause,
          cancellationIsPrivate
        }),
        relatedGroup: {_type: 'reference', _ref: body._id}
      })

      await triggerRitaReflect()

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({created: true, eventId, type: 'cancellation'})
      }
    } catch (err) {
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({error: err.message})
      }
    }
  }

  if (!body._id) {
    return {statusCode: 400, headers: cors, body: JSON.stringify({error: '_id is required'})}
  }

  const safeId = body._id.replace(/[^a-zA-Z0-9]/g, '-')
  const eventId = `booking-${safeId}`

  const description = `Новое групповое бронирование через портал: "${body.groupName || 'без названия'}" — ${body.totalGuests || body.adults || '?'} гостей, заезд ${body.checkIn || '?'}, выезд ${body.checkOut || '?'}${body.eventType ? `, тип: ${body.eventType}` : ''}.`

  try {
    await sanity.createIfNotExists({
      _id: eventId,
      _type: 'ritaEvent',
      description,
      eventType: 'booking',
      source: 'system',
      timestamp: new Date().toISOString(),
      processed: false,
      rawData: JSON.stringify({
        groupPortalId: body._id,
        groupName: body.groupName,
        totalGuests: body.totalGuests,
        adults: body.adults,
        children: body.children,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        eventType: body.eventType
      }),
      relatedGroup: {_type: 'reference', _ref: body._id}
    })

    await triggerRitaReflect()

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({created: true, eventId})
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({error: err.message})
    }
  }
}
