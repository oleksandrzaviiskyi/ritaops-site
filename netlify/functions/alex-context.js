const {createClient} = require('@sanity/client')
const {staffAuthorized} = require('./lib/staffAuth')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'alex',
  apiVersion: '2025-05-20',
  useCdn: false,
  token: process.env.SANITY_TOKEN || process.env.SANITY_API_READ_TOKEN
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

    const [principles, observations, livingPrinciples] = await Promise.all([
      client.fetch(`*[_type == "principle"]{ title, shortText }`),
      client.fetch(`*[_type == "foundationalObservation"]{ title, observation, notes }`),
      client.fetch(`*[_type == "livingPrinciple"]{ title, statement }`)
    ])

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({principles, observations, livingPrinciples})
    }
  } catch (err) {
    return {statusCode: 500, headers, body: JSON.stringify({error: err.message})}
  }
}
