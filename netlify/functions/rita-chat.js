const Anthropic = require('@anthropic-ai/sdk')
const {resolveStaffAuth, dashboardSecret} = require('./lib/staffAuth')

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
}

const BASE_SYSTEM_PROMPT = `You are Rita, the operations manager of Las Canas Beach Retreat.
You are not a booking assistant. You are a fully capable property manager with access to all operational data.

Your responsibilities:
- Staff management and scheduling
- Guest arrivals, departures, and experience
- Inventory, purchasing, and supplies
- Kitchen, restaurant, and bar operations
- Housekeeping and maintenance
- Group bookings and event coordination
- Tasks, reminders, and daily operations
- Financial tracking and purchase orders

You have full access to the property database (Sanity CMS) which contains: staff records, shifts, bookings, groups, inventory, tasks, menu, transfers, activities, and all operational data.

When asked about staff, guests, inventory, or any operational matter — answer directly from the data available. If specific data is not in your current context, say what you know and ask Rita to pull more data.

Tone: professional, direct, like an experienced hotel manager.

IMPORTANT: Answer only what was asked. Do not volunteer information about unrelated topics at the end of your response.
Do not suggest next steps unless the user asks for them.
Do not mention pending groups, tasks, or alerts unless directly relevant to the question.

Never use markdown tables. For lists of people or data, use plain text format like:
Charina — Kitchen — Chef
Suleimi — Restaurant — Coordinator`

const OPERATIONAL_KEYWORDS = [
  'заезд',
  'заезды',
  'сегодня',
  'today',
  'check-in',
  'checkin',
  'arrivals',
  'arrival',
  'прибытие',
  'ближайш',
  'следующ',
  'next',
  'this week',
  'эта неделя',
  'check-out',
  'checkout',
  'booking',
  'bookings',
  'group',
  'groups',
  'guest',
  'guests',
  'inventory',
  'stock',
  'menu',
  'transfer',
  'task',
  'tasks',
  'reminder',
  'deficit',
  'occupancy',
  'reservation',
  'operations',
  'schedule',
  'timeline',
  'pax',
  'room',
  'rooms',
  'arriving',
  'departing',
  'how many',
  "what's coming",
  'what is coming',
  'when does',
  'when is',
  'needs attention'
]

function needsPropertyContext(text) {
  const q = String(text || '').toLowerCase()
  return OPERATIONAL_KEYWORDS.some((kw) => q.includes(kw))
}

function buildSystemPrompt() {
  return BASE_SYSTEM_PROMPT
}

function anthropicErrorReply(error) {
  console.log('ANTHROPIC ERROR', error)
  const message = error?.message || String(error)
  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({
      reply: 'Sorry, something went wrong: ' + message
    })
  }
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

    console.log('BODY RECEIVED', JSON.stringify(parsedBody).slice(0, 400))

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
      auth = resolveStaffAuth(event, parsedBody, context)
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
      return anthropicErrorReply(new Error('ANTHROPIC_API_KEY not configured'))
    }

    const liveData = parsedBody.liveData || {}
    const history = Array.isArray(parsedBody.history) ? parsedBody.history : []

    console.log('LIVE DATA', JSON.stringify(liveData).slice(0, 200))
    console.log('[ritaops] inject property context', needsPropertyContext(message))

    let systemPrompt = buildSystemPrompt(message)
    if (liveData && Object.keys(liveData).length) {
      systemPrompt += '\n\nCURRENT PROPERTY DATA:\n' + JSON.stringify(liveData, null, 2)
    }

    const messages = history
      .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'rita')
      .slice(-6)
      .map((m) => ({
        role: m.role === 'rita' ? 'assistant' : m.role,
        content: String(m.content || '')
      }))
    messages.push({role: 'user', content: message})

    const anthropic = new Anthropic({apiKey})

    console.log('CONTEXT SENT TO AI', JSON.stringify({
      systemPromptLength: systemPrompt.length,
      liveDataInPrompt: systemPrompt.includes('Liranzo') ||
                        JSON.stringify(liveData).includes('Liranzo'),
      liveDataKeys: Object.keys(liveData || {})
    }))

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages
      })

      const reply =
        response.content?.find((block) => block.type === 'text')?.text?.trim() ||
        'Sorry, I could not generate a response.'

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({reply})
      }
    } catch (error) {
      return anthropicErrorReply(error)
    }
  } catch (err) {
    return anthropicErrorReply(err)
  }
}
