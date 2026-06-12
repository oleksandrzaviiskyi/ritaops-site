const {createClient} = require('@sanity/client')
const {resolveStaffAuth} = require('./lib/staffAuth')

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
}

const writeToken =
  process.env.SANITY_TOKEN ||
  process.env.SANITY_API_WRITE_TOKEN ||
  process.env.SANITY_API_READ_TOKEN

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token: writeToken,
  useCdn: false
})

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors}
  }

  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const auth = resolveStaffAuth(event, body, context)
    if (!auth.authorized) {
      return {statusCode: 401, headers: cors, body: JSON.stringify({error: 'Staff auth required'})}
    }

    const slug = String(body.slug || '').trim()
    const categoryId = String(body.categoryId || '').trim()

    if (!slug) {
      return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'slug is required'})}
    }

    const portal = await client.fetch(
      `*[_type == "groupPortal" && portalSlug.current == $slug][0]{ _id }`,
      {slug}
    )
    if (!portal?._id) {
      return {statusCode: 404, headers: cors, body: JSON.stringify({error: 'Group not found'})}
    }

    if (categoryId) {
      await client
        .patch(portal._id)
        .set({category: {_type: 'reference', _ref: categoryId}})
        .commit()
    } else {
      await client.patch(portal._id).unset(['category']).commit()
    }

    const category = categoryId
      ? await client.fetch(`*[_type == "groupCategory" && _id == $id][0]{ _id, code, name }`, {
          id: categoryId
        })
      : null

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ok: true, slug, category})
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
