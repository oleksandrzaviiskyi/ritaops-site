const {createClient} = require('@sanity/client')
const {staffAuthorized} = require('./lib/staffAuth')

const token = process.env.SANITY_TOKEN || process.env.SANITY_API_READ_TOKEN

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  useCdn: false,
  token,
  apiVersion: '2024-01-01'
})

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  }

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers}
  }

  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, headers, body: JSON.stringify({error: 'Method not allowed'})}
  }

  try {
    if (!staffAuthorized(event, null, context)) {
      return {statusCode: 401, headers, body: JSON.stringify({error: 'Staff auth required'})}
    }

    const questions = await client.fetch(`
      *[_type == "ritaQuestion" && status == "open"]
      | order(askedAt desc) {
        _id,
        question,
        context,
        askedAt,
        "events": relatedEvents[]-> {
          _id,
          description,
          eventType,
          timestamp,
          ritaNotes
        }
      }
    `)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({questions, count: questions.length})
    }
  } catch (err) {
    return {statusCode: 500, headers, body: JSON.stringify({error: err.message})}
  }
}
