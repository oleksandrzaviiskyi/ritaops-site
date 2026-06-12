const {createClient} = require('@sanity/client')
const {staffAuthorized} = require('./lib/staffAuth')

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
}

const token =
  process.env.SANITY_TOKEN ||
  process.env.SANITY_API_WRITE_TOKEN ||
  process.env.SANITY_API_READ_TOKEN

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token,
  useCdn: false
})

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors}
  }

  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}
  }

  try {
    if (!staffAuthorized(event, null, context)) {
      return {statusCode: 401, headers: cors, body: JSON.stringify({error: 'Staff auth required'})}
    }

    const categories = await client.fetch(
      `*[_type == "groupCategory"] | order(code asc) { _id, code, name }`
    )

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({categories})
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
