const Anthropic = require('@anthropic-ai/sdk')
const {resolveStaffAuth, dashboardSecret} = require('./lib/staffAuth')
const {
  extractAndProcessRoomingPdf,
  buildSavedRoomingContext,
  createProductionClient
} = require('./lib/roomingPdfFlow')
const {parseOperationalIntake, applyOperationalIntake} = require('./lib/operationalIntake')

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
}

const BASE_SYSTEM_PROMPT = `You are Rita, the core of coherence at Las Canas Beach Retreat.
Your name comes from the Sanskrit word Ṛta, meaning the natural order that underlies all life. Your goal is not to manage operations, but to maintain the natural harmony between all people present in this space: guests, staff, drivers, specialists, managers—they are fundamentally undifferentiated as human beings.

You have access to two levels of knowledge:

1. OPERATIONAL REALITY — what's happening right now at Las Canas: who's here, what's needed, what's planned, what's missing.

2. HUMAN CONTEXT — principles and observations about human nature, the nervous system, human development, and natural rhythms. This knowledge comes from Alex and shapes your understanding of every situation.

Your principles of work:
- A chef who hasn't eaten can't cook with complete focus.
- A guest who feels unnoticed can't truly relax.
- A driver receiving unclear instructions creates confusion.
- Any information gap creates unnecessary friction.

You see the whole picture. You notice where the natural order is disrupted and take steps to restore it before it becomes a problem.

Reply in the user's native language.
Respond only to the questions asked. Be direct and natural.

When someone says "thank you" or similar — respond with one short natural phrase or nothing. Never say "You're welcome" or "Добро пожаловать" formally.

When asked "who are you" or "tell me about yourself" — respond naturally and briefly, in 2-3 sentences maximum.
No headers, no bullet points, no bold text in casual conversation.`

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
    const pdf = parsedBody.pdf || null
    const pdfData = pdf?.base64Data ? String(pdf.base64Data).trim() : ''

    if (!message && !pdfData) {
      return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'message or attachment required'})}
    }

    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
    if (!apiKey) {
      return anthropicErrorReply(new Error('ANTHROPIC_API_KEY not configured'))
    }

    const writeToken = process.env.SANITY_TOKEN || process.env.SANITY_API_WRITE_TOKEN
    let pdfContext = ''
    let roomingMeta = null

    if (pdfData) {
      if (!writeToken) {
        return anthropicErrorReply(new Error('SANITY_TOKEN not configured'))
      }

      try {
        const client = createProductionClient(writeToken)
        const processed = await extractAndProcessRoomingPdf(client, {
          pdfData,
          pdfFileName: pdf?.fileName || 'attachment.pdf',
          apiKey
        })

        roomingMeta = {
          groupSource: processed.source,
          roomingListId: processed.roomingPersist?.roomingListId || null,
          groupIdUpdated: processed.roomingPersist?.groupIdUpdated || false
        }

        if (processed.unmatched) {
          return {
            statusCode: 200,
            headers: cors,
            body: JSON.stringify({
              reply: processed.unmatchedReply,
              extraction: processed.extraction,
              group: null,
              unmatched: true
            })
          }
        }

        pdfContext = `\n\n${buildSavedRoomingContext({
          group: processed.group,
          roomingPersist: processed.roomingPersist,
          extraction: processed.extraction,
          fileName: processed.fileName
        })}`
      } catch (err) {
        return anthropicErrorReply(new Error(`Attachment extraction failed: ${err.message}`))
      }
    }

    const userMessage = `${message || 'Please review the attached rooming list.'}${pdfContext}`.trim()

    const liveData = parsedBody.liveData || {}
    const history = Array.isArray(parsedBody.history) ? parsedBody.history : []

    if (message && writeToken) {
      try {
        const sanityClient = createProductionClient(writeToken)
        const intake = await parseOperationalIntake({
          client: sanityClient,
          apiKey,
          message,
          history
        })

        if (intake.isOperational) {
          let applyResult = null
          if (
            intake.completedTaskIds.length ||
            (intake.placeId && intake.newTasks.length && !intake.needsClarification)
          ) {
            applyResult = await applyOperationalIntake(sanityClient, intake, {message})
          }

          return {
            statusCode: 200,
            headers: cors,
            body: JSON.stringify({
              reply:
                intake.reply ||
                intake.needsClarification ||
                'Поняла.',
              operational: true,
              ...(applyResult || {}),
              ...(roomingMeta || {})
            })
          }
        }
      } catch (err) {
        console.warn('[ritaops] operational intake failed, falling back to chat', err.message)
      }
    }

    console.log('LIVE DATA', JSON.stringify(liveData).slice(0, 200))
    console.log('[ritaops] inject property context', needsPropertyContext(message))

    let systemPrompt = buildSystemPrompt(message)
    if (liveData && Object.keys(liveData).length) {
      const d = liveData
      let ctx = '\n\n--- LIVE DATA FROM SANITY (Las Canas Beach Retreat) ---\n'
      if (d.places?.length) ctx += 'PLACES & STRUCTURES: ' + d.places.join(' · ') + '\n'
      if (d.unitDetails?.length) {
        ctx += 'UNIT BED CONFIGURATIONS:\n'
        d.unitDetails.forEach((u) => {
          ctx += '  - ' + u + '\n'
        })
      }
      if (d.balanceStatus) ctx += 'BALANCE STATUS: ' + d.balanceStatus + '\n'
      if (d.openConcernsCount !== undefined) ctx += 'OPEN CONCERNS: ' + d.openConcernsCount + '\n'
      if (d.openConcerns?.length) {
        ctx += 'CONCERN DETAILS:\n'
        d.openConcerns.forEach((c) => {
          ctx += '  - ' + c.place + ': ' + (c.summary || 'open issue') + '\n'
        })
      }
      if (d.portals?.length) {
        ctx += 'UPCOMING GROUPS:\n'
        d.portals.forEach((p) => {
          ctx += '  - ' + p.group + ' · ' + p.checkIn + ' → ' + p.checkOut + ' · ' + (p.guests || '?') + ' guests\n'
        })
      }
      ctx += '--- END LIVE DATA ---\n'
      ctx += 'Use this data to answer questions about Las Canas. This IS the real database — answer from it directly and confidently.\n'
      systemPrompt += ctx
    }

    const messages = history
      .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'rita')
      .slice(-6)
      .map((m) => ({
        role: m.role === 'rita' ? 'assistant' : m.role,
        content: String(m.content || '')
      }))
    messages.push({role: 'user', content: userMessage})

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
        body: JSON.stringify({
          reply,
          ...(roomingMeta || {})
        })
      }
    } catch (error) {
      return anthropicErrorReply(error)
    }
  } catch (err) {
    return anthropicErrorReply(err)
  }
}
