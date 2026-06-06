const {resolveStaffAuth, dashboardSecret} = require('./lib/staffAuth')

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

  console.log('AUTH DEBUG', {
    headers: JSON.stringify(event.headers),
    queryParams: JSON.stringify(event.queryStringParameters),
    hasBody: !!event.body
  })

  try {
    const parsedBody = JSON.parse(event.body || '{}')

    console.log('AUTH CHECK', {
      authHeader: event.headers.authorization || event.headers.Authorization || 'MISSING',
      keyParam: event.queryStringParameters?.key || 'MISSING',
      staffKeyInBody: parsedBody?.staffKey || 'MISSING',
      dashboardSecretSet: Boolean(dashboardSecret())
    })

    let auth
    if (!dashboardSecret()) {
      console.warn('[ritaops] DASHBOARD_SECRET not set — allowing request through (temporary bypass)')
      auth = {authorized: true, method: 'open'}
    } else {
      auth = await resolveStaffAuth(event, parsedBody, context)
    }

    const anthropicKeyPresent = Boolean((process.env.ANTHROPIC_API_KEY || '').trim())

    console.log('[ritaops] rita-chat auth', {
      method: auth.method || 'none',
      authorized: auth.authorized,
      anthropicKeyPresent,
      hasBearer: Boolean(
        (event.headers?.authorization || event.headers?.Authorization || '').match(/^Bearer\s+/i)
      ),
      hasStaffKey: Boolean(parsedBody?.staffKey || event.queryStringParameters?.key)
    })

    if (!auth.authorized) {
      return {statusCode: 401, headers: cors, body: JSON.stringify({error: 'Staff auth required'})}
    }

    const message = String(parsedBody.message || '').trim()
    if (!message) {
      return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'message required'})}
    }

    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
    if (!apiKey) {
      return {statusCode: 500, headers: cors, body: JSON.stringify({error: 'ANTHROPIC_API_KEY not configured'})}
    }

    const liveData = parsedBody.liveData || {}
    const history = Array.isArray(parsedBody.history) ? parsedBody.history : []

    const systemPrompt = `You are Rita, operations assistant for Las Canas Beach Retreat. You have access to the following live data: ${JSON.stringify(liveData)}

Answer concisely for hotel operations staff. Use clear labels and numbers when citing data. Mention specific group names and dates when relevant.`

    const messages = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-12)
      .map((m) => ({
        role: m.role === 'rita' ? 'assistant' : m.role,
        content: String(m.content || '')
      }))
    messages.push({role: 'user', content: message})

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages
      })
    })

    const json = await res.json()
    if (!res.ok) {
      const errMsg = json.error?.message || json.error || res.statusText
      return {statusCode: res.status, headers: cors, body: JSON.stringify({error: errMsg})}
    }

    const reply =
      json.content?.find((block) => block.type === 'text')?.text?.trim() ||
      'Sorry, I could not generate a response.'

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({reply})
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
