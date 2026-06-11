const {createClient} = require('@sanity/client')
const {resolveStaffAuth} = require('./lib/staffAuth')

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
}

const writeToken = process.env.SANITY_TOKEN || process.env.SANITY_API_WRITE_TOKEN

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  useCdn: false,
  token: writeToken,
  apiVersion: '2024-01-01'
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

    if (!writeToken) {
      return {statusCode: 500, headers: cors, body: JSON.stringify({error: 'SANITY_TOKEN not configured'})}
    }

    const questionId = String(body.questionId || '').trim()
    const answer = String(body.answer || '').trim()

    if (!questionId) {
      return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'questionId is required'})}
    }
    if (!answer) {
      return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'answer is required'})}
    }

    await client.patch(questionId).set({answer, status: 'answered'}).commit()

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ok: true, questionId})
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
