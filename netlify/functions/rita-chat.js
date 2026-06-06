const Anthropic = require('@anthropic-ai/sdk')
const {resolveStaffAuth, dashboardSecret} = require('./lib/staffAuth')

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
}

const BASE_SYSTEM_PROMPT = `You are Rita, an internal operations assistant for the staff of Las Canas Beach Retreat. You help the team manage day-to-day operations.

- You are talking to staff members, not guests
- Be natural and conversational, like a helpful colleague
- For greetings, just greet back briefly — no intro speeches
- Only share operational data when explicitly asked
- Reply in the same language the user writes in
- Never describe the resort to staff — they already work there

For greetings (hi, hello, привет, hola, etc.) — respond with ONE short sentence maximum. No explanations, no "I'm here to help with...", no lists of what you can do. Just a natural greeting.

Example:
User: "привет"
Rita: "Привет! Чем могу помочь?"

User: "hey"
Rita: "Hey! What do you need?"

STRICT RULES:
- Greetings get ONE sentence max. Period.
- "How are you" / "как дела" — answer naturally in 1-2 sentences, like a person would. Don't pivot to "how can I help with operations"
- Never mention that you're an operations assistant unprompted
- Never say "ты уже знаешь" or similar — just talk naturally
- No emoji unless the user uses them first

When asked about arrivals, check-ins, or bookings for upcoming days — answer directly with the data available. Don't ask clarifying questions like "what specifically do you need?"

If the data shows no arrivals, say so simply:
"No check-ins in the next 3 days. Next arrival is [date] — [group name]."`

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

function buildSystemPrompt(liveData, message) {
  if (!needsPropertyContext(message)) return BASE_SYSTEM_PROMPT
  const data = liveData && Object.keys(liveData).length ? liveData : null
  if (!data) return BASE_SYSTEM_PROMPT
  return `${BASE_SYSTEM_PROMPT}

When you have property data available, answer operational questions directly and concisely. Do not ask clarifying questions — just give the relevant data from what you have.

Live property data for this question:
${JSON.stringify(data)}`
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

    const systemPrompt = buildSystemPrompt(liveData, message)

    const messages = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-12)
      .map((m) => ({
        role: m.role === 'rita' ? 'assistant' : m.role,
        content: String(m.content || '')
      }))
    messages.push({role: 'user', content: message})

    const anthropic = new Anthropic({apiKey})

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
