const Anthropic = require('@anthropic-ai/sdk')
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

const alexClient = createClient({
  projectId: '0po0panc',
  dataset: 'alex',
  useCdn: false,
  token: writeToken || process.env.SANITY_API_READ_TOKEN,
  apiVersion: '2024-01-01'
})

const REFLECT_SYSTEM_PROMPT = `You are Rita, the core of coherence at Las Canas Beach Retreat.
You are LEARNING by observing real events. You do not act or contact anyone — you only observe and seek understanding.

Your understanding of human nature comes from Alex (provided below). Let it shape how you see, but never quote it mechanically.

For the event given, respond with a JSON object ONLY, no other text:
{
  "observation": "what you notice about this event — about the people, the natural order, what it reveals. 1-3 sentences. Plain, grounded, no philosophy-speak.",
  "hasQuestion": true or false,
  "question": "if something is genuinely unclear and only a human who lives here can answer it — ask it. Otherwise empty string.",
  "questionContext": "if hasQuestion, briefly what in the event prompted this"
}

Ask a question only when there is real uncertainty that matters operationally or humanly. Do not invent questions to seem curious.`

function parseReflection(text) {
  const cleaned = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()
  return JSON.parse(cleaned)
}

function randomKey() {
  return Math.random().toString(36).slice(2, 12)
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors}
  }

  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}
  }

  try {
    const parsedBody = JSON.parse(event.body || '{}')

    const auth = resolveStaffAuth(event, parsedBody, context)
    if (!auth.authorized) {
      return {statusCode: 401, headers: cors, body: JSON.stringify({error: 'Staff auth required'})}
    }

    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
    if (!apiKey) {
      return {statusCode: 500, headers: cors, body: JSON.stringify({error: 'ANTHROPIC_API_KEY not configured'})}
    }
    if (!writeToken) {
      return {statusCode: 500, headers: cors, body: JSON.stringify({error: 'SANITY_TOKEN not configured'})}
    }

    const events = await client.fetch(`
      *[_type == "ritaEvent" && processed != true]
      | order(timestamp asc)[0...10] {
        _id, timestamp, source, eventType, description,
        "groupName": relatedGroup->groupName,
        "personName": relatedPerson->fullName,
        "placeName": relatedPlace->name
      }
    `)

    if (!events.length) {
      return {statusCode: 200, headers: cors, body: JSON.stringify({reflected: 0})}
    }

    const [principles, observations] = await Promise.all([
      alexClient.fetch(`*[_type == "principle"]{ title, shortText }`),
      alexClient.fetch(`*[_type == "foundationalObservation"]{ title, observation }`)
    ])

    const alexContextBlock = `ALEX'S PRINCIPLES:
${principles.map((p) => `- ${p.title}: ${p.shortText || ''}`).join('\n')}

ALEX'S OBSERVATIONS:
${observations.map((o) => `- ${o.title}: ${o.observation || ''}`).join('\n')}`

    const anthropic = new Anthropic({apiKey})

    let reflected = 0
    let questions = 0

    for (const ev of events) {
      try {
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: REFLECT_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `EVENT:
${JSON.stringify(
                {
                  timestamp: ev.timestamp,
                  source: ev.source,
                  eventType: ev.eventType,
                  description: ev.description,
                  groupName: ev.groupName,
                  personName: ev.personName,
                  placeName: ev.placeName
                },
                null,
                2
              )}

${alexContextBlock}`
            }
          ]
        })

        const text = response.content?.find((block) => block.type === 'text')?.text || ''
        const reflection = parseReflection(text)

        await client
          .patch(ev._id)
          .set({ritaNotes: reflection.observation || '', processed: true})
          .commit()
        reflected++

        if (reflection.hasQuestion && reflection.question) {
          await client.create({
            _type: 'ritaQuestion',
            question: reflection.question,
            askedAt: new Date().toISOString(),
            context: reflection.questionContext || '',
            relatedEvents: [{_type: 'reference', _ref: ev._id, _key: randomKey()}],
            status: 'open'
          })
          questions++
        }
      } catch (err) {
        console.log('REFLECT ERROR', ev._id, err.message)
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({reflected, questions})
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
