const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
}

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

  const baseUrl = (process.env.URL || '').replace(/\/$/, '')
  const dashboardSecret = (process.env.DASHBOARD_SECRET || '').trim()

  if (!baseUrl) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: 'URL not configured'})}
  }
  if (!dashboardSecret) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({error: 'DASHBOARD_SECRET not configured'})
    }
  }

  try {
    const res = await fetch(`${baseUrl}/api/rita-reflect`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({staffKey: dashboardSecret})
    })

    const result = await res.json()
    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: cors,
        body: JSON.stringify({triggered: false, error: result.error || res.statusText, ...result})
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({triggered: true, ...result})
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({triggered: false, error: err.message})
    }
  }
}
