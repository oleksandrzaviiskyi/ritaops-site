const {createClient} = require('@sanity/client')
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

    const groupSlug = String(body.groupSlug || '').trim()
    if (!groupSlug) {
      return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'groupSlug required'})}
    }

    const portal = await client.fetch(
      `*[_type == "groupPortal" && portalSlug.current == $slug][0]{ _id }`,
      {slug: groupSlug}
    )
    if (!portal?._id) {
      return {statusCode: 404, headers: cors, body: JSON.stringify({error: 'Group not found'})}
    }

    const incoming = Array.isArray(body.transfers) ? body.transfers : []
    const existingIds = await client.fetch(
      `*[_type == "transfer" && groupPortal._ref == $id]._id`,
      {id: portal._id}
    )

    let tx = client.transaction()
    existingIds.forEach((id) => {
      tx = tx.delete(id)
    })

    incoming.forEach((t, index) => {
      const flights = Array.isArray(t.flights)
        ? t.flights.map((f) => String(f).trim()).filter(Boolean)
        : []
      const doc = {
        _type: 'transfer',
        _id: `transfer.${portal._id}.${t.type || 'arrival'}.${index}.${Date.now()}`,
        groupPortal: {_type: 'reference', _ref: portal._id},
        type: t.type === 'departure' ? 'departure' : 'arrival',
        flights,
        date: t.date || undefined,
        time: t.time || undefined,
        pickupTime: t.pickupTime || undefined,
        passengers: Number(t.passengers) || 1,
        driver: t.driver ? String(t.driver).trim() : 'Chiche',
        total: Number(t.total) || 0,
        driverPay: Number(t.chiche ?? t.driverPay) || 0,
        lasCanas: Number(t.lasCanas) || 0,
        status: t.status || 'pending'
      }
      tx = tx.createOrReplace(doc)
    })

    await tx.commit()

    const saved = await client.fetch(
      `*[_type == "transfer" && groupPortal._ref == $id] | order(type asc, date asc){
        _id, type, flights, date, time, pickupTime, passengers, driver,
        total, driverPay, lasCanas, status
      }`,
      {id: portal._id}
    )

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ok: true, transfers: saved})
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
