const Anthropic = require('@anthropic-ai/sdk')

const INTAKE_MODEL = 'claude-sonnet-4-6'

const INTAKE_SYSTEM_PROMPT = `You are Rita at Las Canas Beach Retreat — operational intake for place-based concerns and tasks.

Staff report issues, completions, and updates in natural language (often Russian, English, or Spanish). You understand context from recent conversation.

You receive:
- places: rooms and areas with _id, name, unitCode, type
- departments: with _id, code, title, titleEn
- open concerns: each groups open tasks for one place

Your job is comprehension — not rigid keyword rules. Decide whether this message is an operational report about a physical place (maintenance, cleaning, grounds, guest room issue, completion update). Casual chat, bookings questions, philosophy, thanks — are NOT operational (isOperational: false).

When operational:
- Resolve which place they mean using unitCode (e.g. 5A, 5a), name, or context from open concerns and history. If genuinely unclear, set placeId null and needsClarification — ask in reply, do not guess.
- newTasks: concrete work items to create. Pick departmentCode ONLY from the real department codes provided (maintenance, cleaning, kitchen, grounds, restaurant, security, reception, bar, purchases, reservations, accounting, groups, etc.).
- completedTaskIds: ids of EXISTING open tasks (from the concerns list) that the reporter says are now done. Only use ids you see in the data.
- Use judgment on urgency — mention the manager in reply only when it genuinely warrants attention. No invented rules.
- reply: natural response in the reporter's language. Confirm what you understood and what you routed or closed.

LANGUAGE RULE (critical):
- reply and needsClarification: write in the reporter's language (Russian, English, Spanish, etc.).
- OPERATIONAL RECORDS always in English: newTasks[].description must be written in English even when the report is in another language. These strings are stored in the system and shown to managers on the Pulse dashboard.

Respond with STRICT JSON ONLY — no markdown, no prose outside JSON:
{
  "isOperational": boolean,
  "placeId": string|null,
  "newTasks": [{"description": string, "departmentCode": string, "reportedBy": string}],
  "completedTaskIds": [string],
  "needsClarification": string|null,
  "reply": string
}

If isOperational is false, still include a brief reply string (can be empty — caller may use normal chat instead).

If not operational, set placeId null, newTasks [], completedTaskIds [], needsClarification null.`

function parseIntakeJson(text) {
  const cleaned = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()
  return JSON.parse(cleaned)
}


async function fetchOperationalContext(client) {
  const [places, departments, concerns] = await Promise.all([
    client.fetch(`*[_type == "place" && defined(name)]{_id, name, unitCode, type}`),
    client.fetch(`*[_type == "department"]{_id, code, title, titleEn}`),
    client.fetch(`*[_type == "ritaConcern" && status == "open"]{
      _id,
      summary,
      relatedPlace->{_id, name, unitCode},
      "tasks": *[_type == "ritaTask" && references(^._id)]{
        _id, description, status, department->{code, title}
      }
    }`)
  ])
  return {places, departments, concerns}
}

function buildIntakeUserContent({message, history, context}) {
  const recent = (history || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'rita')
    .slice(-4)
    .map((m) => `${m.role === 'rita' ? 'assistant' : m.role}: ${m.content}`)
    .join('\n')

  return `OPERATIONAL CONTEXT:
${JSON.stringify(context, null, 2)}

RECENT CONVERSATION:
${recent || '(none)'}

CURRENT MESSAGE:
${message}`
}

async function parseOperationalIntake({client, apiKey, message, history}) {
  const context = await fetchOperationalContext(client)
  const anthropic = new Anthropic({apiKey})

  const response = await anthropic.messages.create({
    model: INTAKE_MODEL,
    max_tokens: 2048,
    system: INTAKE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildIntakeUserContent({message, history, context})
      }
    ]
  })

  const text = response.content?.find((block) => block.type === 'text')?.text || ''
  const parsed = parseIntakeJson(text)

  return {
    ...parsed,
    isOperational: Boolean(parsed.isOperational),
    placeId: parsed.placeId ? String(parsed.placeId).trim() : null,
    newTasks: Array.isArray(parsed.newTasks) ? parsed.newTasks : [],
    completedTaskIds: Array.isArray(parsed.completedTaskIds)
      ? parsed.completedTaskIds.map(String)
      : [],
    needsClarification: parsed.needsClarification ? String(parsed.needsClarification).trim() : null,
    reply: String(parsed.reply || '').trim(),
    _context: context
  }
}

function resolveDepartmentRef(departments, departmentCode) {
  const code = String(departmentCode || '')
    .trim()
    .toLowerCase()
  if (!code) return null

  const match = departments.find((d) => String(d.code || '').toLowerCase() === code)
  if (match?._id) {
    return {_type: 'reference', _ref: match._id}
  }

  return {_type: 'reference', _ref: `department-lcbr-${code}`}
}

function buildConcernSummary(place, newTasks) {
  const placeLabel = place?.name || place?.unitCode || ''
  const taskPart = newTasks
    .map((t) => String(t.description || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' + ')
  if (placeLabel && taskPart) return `${placeLabel}: ${taskPart}`
  return taskPart || placeLabel || 'New concern'
}

async function findOpenConcernForPlace(client, placeId) {
  return client.fetch(
    `*[_type == "ritaConcern" && status == "open" && relatedPlace._ref == $placeId][0]{ _id }`,
    {placeId}
  )
}

async function applyOperationalIntake(client, intake, {message}) {
  const now = new Date().toISOString()
  const {places, departments} = intake._context || {}
  const result = {
    concernId: null,
    createdTaskIds: [],
    completedTaskIds: [],
    resolvedConcernIds: []
  }

  const touchedConcernIds = new Set()

  if (intake.completedTaskIds.length) {
    for (const taskId of intake.completedTaskIds) {
      const task = await client.fetch(
        `*[_type == "ritaTask" && _id == $id][0]{ _id, relatedConcern }`,
        {id: taskId}
      )
      if (!task?._id) continue

      await client
        .patch(task._id)
        .set({status: 'done', doneAt: now})
        .commit()

      result.completedTaskIds.push(task._id)
      if (task.relatedConcern?._ref) {
        touchedConcernIds.add(task.relatedConcern._ref)
      }
    }
  }

  const placeId = intake.placeId
  const hasNewTasks = intake.newTasks.length > 0
  const canCreate =
    placeId &&
    hasNewTasks &&
    !intake.needsClarification &&
    places?.some((p) => p._id === placeId)

  if (canCreate) {
    let concern = await findOpenConcernForPlace(client, placeId)
    const place = places.find((p) => p._id === placeId)

    if (!concern?._id) {
      const reportedBy =
        intake.newTasks.map((t) => String(t.reportedBy || '').trim()).find(Boolean) || 'Staff'

      concern = await client.create({
        _type: 'ritaConcern',
        relatedPlace: {_type: 'reference', _ref: placeId},
        status: 'open',
        openedAt: now,
        openedBy: reportedBy,
        summary: buildConcernSummary(place, intake.newTasks),
        sourceMessage: message
      })
      result.concernId = concern._id
    } else {
      result.concernId = concern._id
    }

    touchedConcernIds.add(concern._id)

    for (const task of intake.newTasks) {
      const description = String(task.description || '').trim()
      if (!description) continue

      const created = await client.create({
        _type: 'ritaTask',
        relatedConcern: {_type: 'reference', _ref: concern._id},
        relatedPlace: {_type: 'reference', _ref: placeId},
        description,
        department: resolveDepartmentRef(departments, task.departmentCode),
        status: 'open',
        reportedBy: String(task.reportedBy || '').trim() || undefined,
        reportedAt: now,
        sourceMessage: message
      })
      result.createdTaskIds.push(created._id)
    }
  }

  for (const concernId of touchedConcernIds) {
    const openCount = await client.fetch(
      `count(*[_type == "ritaTask" && relatedConcern._ref == $id && status == "open"])`,
      {id: concernId}
    )
    if (openCount === 0) {
      await client
        .patch(concernId)
        .set({status: 'resolved', resolvedAt: now})
        .commit()
      result.resolvedConcernIds.push(concernId)
    }
  }

  return result
}

module.exports = {
  INTAKE_MODEL,
  fetchOperationalContext,
  parseOperationalIntake,
  applyOperationalIntake
}
