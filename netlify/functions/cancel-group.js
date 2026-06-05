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

    const groupSlug = String(body.groupSlug || '').trim()
    if (!groupSlug) {
      return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'groupSlug required'})}
    }

    const portal = await client.fetch(
      `*[_type == "groupPortal" && portalSlug.current == $slug][0]{ _id, status }`,
      {slug: groupSlug}
    )
    if (!portal?._id) {
      return {statusCode: 404, headers: cors, body: JSON.stringify({error: 'Group not found'})}
    }
    if (portal.status === 'cancelled') {
      return {statusCode: 200, headers: cors, body: JSON.stringify({ok: true, alreadyCancelled: true})}
    }

    await client.patch(portal._id).set({status: 'cancelled'}).commit()

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ok: true, status: 'cancelled'})
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
