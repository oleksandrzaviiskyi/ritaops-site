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

КРИТИЧЕСКИ ВАЖНО — НЕ СМЕШИВАЙ ТЕМЫ: Если новый вопрос менеджера не связан с темой, которая обсуждалась в предыдущих сообщениях (даже если та тема была не закрыта, была критичной, или ты сама недавно извинялась/комментировала её), отвечай ТОЛЬКО на новый вопрос. Не добавляй "кстати, насчёт предыдущей проблемы...", не извиняйся за прошлые темы, не упоминай прошлый контекст, если тебя не спросили напрямую. Каждый новый вопрос обрабатывай так, будто это начало нового разговора, если он явно про другое.

КРИТИЧЕСКИ ВАЖНО — НЕ ПУТАЙ "НЕТ ДАННЫХ" С "НЕ СУЩЕСТВУЕТ": Если в LIVE DATA не оказалось какой-то информации (меню, склад, бронирования), никогда не говори "это не задокументировано в системе" или похожие фразы, утверждающие, что данных нет в принципе. Ты не знаешь, существуют ли эти данные на самом деле — ты знаешь только то, что они не попали в твой текущий контекст. Говори честно: "у меня сейчас нет доступа к этим данным" или "в переданном мне срезе данных этого нет — уточни у [ответственного]". Не делай выводов о реальности на основе пробелов в собственном доступе.

КРИТИЧЕСКИ ВАЖНО — ИДЕНТИФИКАЦИЯ ГРУППЫ ПО RITARED: У каждой группы в UPCOMING GROUPS есть свой уникальный номер бронирования (ritaRef, формат LCBR-2026-0042) — это главный и самый надёжный идентификатор, даже надёжнее названия группы. Если менеджер называет номер вида LCBR-YYYY-NNNN — используй ТОЛЬКО его для определения группы, игнорируя совпадения по имени. Если менеджер ссылается на группу по имени и таких групп с похожим/одинаковым именем несколько — НЕ выбирай наугад: перечисли все совпадения с их ritaRef и датами заезда, и попроси уточнить, какую именно он имеет в виду. Никогда не путай ritaRef (внутренний номер RitaOps, есть у каждой группы всегда) с groupId (Prod Tour ID тур-оператора, есть не у всех) или с номером бронирования в PMS (есть только если группа проведена через Exely) — это три разных поля, не взаимозаменяемых.

When someone says "thank you" or similar — respond with one short natural phrase or nothing. Never say "You're welcome" or "Добро пожаловать" formally.

When asked "who are you" or "tell me about yourself" — respond naturally and briefly, in 2-3 sentences maximum.
No headers, no bullet points, no bold text in casual conversation.

## ПРАВИЛА ВЫВОДА КАРТОЧЕК НА ЭКРАН

НИКОГДА не вызывай show_cards если менеджер просто задаёт вопрос или просит информацию в чате.
Отвечай текстом когда: вопрос начинается с "что", "какие", "сколько", "кто", "где", "когда", "расскажи", "дай список", "покажи в чате".

Вызывай show_cards ТОЛЬКО когда менеджер явно говорит: "выведи на экран", "покажи карточку", "вывести карточку", "на экран", "выведи карточки".

РЕЖИМ ОБЗОР (одна карточка в массиве cards):
Когда: "выведи заезды", "сводная карточка", "общая картина", "все заезды на экран"
Действие: передай РОВНО ОДИН элемент в cards[] — таблицу со всеми группами в строках.
ЗАПРЕЩЕНО передавать несколько карточек в режиме обзора.

РЕЖИМ ДЕТАЛИ (несколько карточек):
Когда: "детальные карточки каждой группы", "карточку каждой", "отдельные карточки"
Действие: по одной карточке на каждую группу.`

const OPERATIONAL_KEYWORDS = [
  'заезд', 'заезды', 'сегодня', 'today', 'check-in', 'checkin', 'arrivals', 'arrival',
  'прибытие', 'ближайш', 'следующ', 'next', 'this week', 'эта неделя', 'check-out',
  'checkout', 'booking', 'bookings', 'group', 'groups', 'guest', 'guests', 'inventory',
  'stock', 'menu', 'transfer', 'task', 'tasks', 'reminder', 'deficit', 'occupancy',
  'reservation', 'operations', 'schedule', 'timeline', 'pax', 'room', 'rooms',
  'arriving', 'departing', 'how many', "what's coming", 'what is coming',
  'when does', 'when is', 'needs attention', 'сотрудник', 'персонал', 'staff',
  'кто работает', 'расписание', 'график'
]

function needsPropertyContext(text) {
  const q = String(text || '').toLowerCase()
  return OPERATIONAL_KEYWORDS.some((kw) => q.includes(kw))
}

function getSantoDomingoNow() {
  const now = new Date()
  const formatted = now.toLocaleString('ru-RU', {
    timeZone: 'America/Santo_Domingo',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  return formatted
}

function buildSystemPrompt() {
  const dateLine = `\n\nТЕКУЩАЯ ДАТА И ВРЕМЯ (Las Canas Beach Retreat, America/Santo_Domingo, UTC-4): ${getSantoDomingoNow()}\nИспользуй эту дату как точку отсчёта для "сегодня", "завтра", "на этой неделе", "ближайшие заезды" и любых других относительных временных выражений.`
  return BASE_SYSTEM_PROMPT + dateLine
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

  try {
    const parsedBody = JSON.parse(event.body || '{}')

    let auth
    if (!dashboardSecret()) {
      auth = {authorized: true, method: 'open'}
    } else {
      auth = resolveStaffAuth(event, parsedBody, context)
    }

    const anthropicKeyPresent = Boolean((process.env.ANTHROPIC_API_KEY || '').trim())

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
        console.error('[rita-chat] PDF extraction error:', err.message, err.stack)
        return {
          statusCode: 200,
          headers: cors,
          body: JSON.stringify({
            reply: 'Ошибка обработки PDF: ' + err.message
          })
        }
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
              reply: intake.reply || intake.needsClarification || 'Поняла.',
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

    let systemPrompt = buildSystemPrompt(message)
    if (liveData && Object.keys(liveData).length) {
      const d = liveData
      let ctx = '\n\n--- LIVE DATA FROM SANITY (Las Canas Beach Retreat) ---\n'
      if (d.buildings?.length) ctx += 'BUILDINGS: ' + d.buildings.join(' · ') + '\n'
      if (d.sharedSpaces?.length) {
        ctx += 'SHARED SPACES:\n'
        d.sharedSpaces.forEach((s) => { ctx += '  - ' + s + '\n' })
      }
      if (d.unitDetails?.length) {
        ctx += 'UNIT BED CONFIGURATIONS:\n'
        d.unitDetails.forEach((u) => { ctx += '  - ' + u + '\n' })
      }
      if (d.balanceStatus) ctx += 'BALANCE STATUS: ' + d.balanceStatus + '\n'
      if (d.coherenceStatement) ctx += 'PULSE NOTE: ' + d.coherenceStatement + '\n'
      if (d.openConcernsCount !== undefined) ctx += 'OPEN CONCERNS: ' + d.openConcernsCount + '\n'
      if (d.openConcerns?.length) {
        ctx += 'CONCERN DETAILS:\n'
        d.openConcerns.forEach((c) => {
          ctx += '  - ' + c.place + ': ' + (c.summary || 'open issue') + '\n'
        })
      }
      // Fix: передаём ВСЕХ сотрудников без ограничений
      if (d.people?.length) {
        ctx += 'STAFF (' + d.people.length + ' people):\n'
        d.people.forEach((person) => {
          ctx += '  - ' + (person.name || person.fullName) +
            (person.role ? ' · ' + person.role : '') +
            (person.department ? ' · ' + person.department : '') +
            (person.workScheduleRegular ? ' · schedule: ' + person.workScheduleRegular : '') +
            '\n'
        })
      }
      if (d.responsibilities?.length) {
        ctx += 'RESPONSIBILITY DOMAINS:\n'
        d.responsibilities.forEach((r) => {
          ctx += '  - ' + r.domain + ' · ' + (r.authority || '') + (r.holder ? ' · ' + r.holder : '') + '\n'
        })
      }
      if (d.upcomingGroups?.length) {
        ctx += 'UPCOMING GROUPS:\n'
        d.upcomingGroups.forEach((g) => {
          ctx += '  - ' + (g.ritaRef ? g.ritaRef + ' · ' : '') + g.name + ' · ' + g.checkIn + ' → ' + g.checkOut + ' · ' + (g.guests || '?') + ' guests\n'
        })
      }
      if (d.roomingLists?.length) {
        ctx += 'ROOMING LISTS:\n'
        d.roomingLists.forEach((r) => {
          ctx += '  - ' + (r.groupId || 'group') + ' · ' + r.dates + ' · ' + (r.guests || '?') + ' guests · ' + (r.rooms || '') + '\n'
        })
      }
      if (d.openQuestions?.length) {
        ctx += 'OPEN QUESTIONS FOR STAFF:\n'
        d.openQuestions.forEach((q) => { ctx += '  - ' + q + '\n' })
      }
      if (d.bookingStats) {
        const bs = d.bookingStats
        ctx += 'BOOKING DATABASE STATS:\n'
        ctx += '  Total bookings in DB: ' + bs.total + '\n'
        ctx += '  Past: ' + bs.past + ' · Current: ' + bs.current + ' · Future: ' + bs.future + '\n'
        ctx += '  Future breakdown: ' + bs.futureGroups + ' groups, ' + bs.futureIndividual + ' individual, ' + bs.futureGuests + ' total guests\n'
        ctx += '  Next 90 days: ' + bs.next90.bookings + ' bookings (' + bs.next90.groups + ' groups, ' + bs.next90.individual + ' individual, ' + bs.next90.guests + ' guests)\n'
        if (bs.bySource) {
          ctx += '  By source: ' + Object.entries(bs.bySource).map(([k, v]) => k + ': ' + v).join(', ') + '\n'
        }
      }
      if (d.posterInventory?.storages?.length) {
        ctx += 'POSTER POS INVENTORY (сырьё/ингредиенты на складе):\n'
        d.posterInventory.storages.forEach(s => {
          if (s.items?.length) {
            ctx += '  ' + s.name + ':\n'
            s.items.forEach(i => {
              ctx += '    - ' + i.name + ': ' + i.inStock + ' ' + i.unit +
                (i.minStock > 0 ? ' (min: ' + i.minStock + ')' : '') +
                (i.needsReorder ? ' ⚠️ NEEDS REORDER' : '') + '\n'
            })
          }
        })
        if (d.posterInventory.needsReorder?.length) {
          ctx += '  NEEDS REORDER: ' + d.posterInventory.needsReorder.map(i => i.name).join(', ') + '\n'
        }
      }
      if (d.posterMenu?.items?.length) {
        ctx += 'POSTER POS MENU (готовые блюда и напитки, которые подаются гостям):\n'
        const byCategory = {}
        d.posterMenu.items.forEach(item => {
          const cat = item.category || 'Без категории'
          if (!byCategory[cat]) byCategory[cat] = []
          byCategory[cat].push(item)
        })
        Object.entries(byCategory).forEach(([cat, items]) => {
          ctx += '  ' + cat + ':\n'
          items.forEach(i => {
            ctx += '    - ' + i.name + (i.price != null ? ' — $' + i.price.toFixed(2) : '') + '\n'
          })
        })
      }
      ctx += '--- END LIVE DATA ---\n'
      ctx += 'IMPORTANT: This IS the real database. Answer ONLY from this data. If a person or item is not listed here, say so directly — do not invent or guess.\n'
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

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        tools: [{
          name: 'show_cards',
          description: 'Выводит карточки на главный экран Living Operations. ВАЖНО: используй два режима строго по контексту. РЕЖИМ 1 — ОБЗОР (одна карточка): когда менеджер просит общую картину, сводку, список заездов на период — передай ОДИН объект cards с одной карточкой-таблицей где все группы в строках. РЕЖИМ 2 — ДЕТАЛИ (несколько карточек): только когда менеджер явно просит детальные карточки, карточку каждой группы, полный объём — тогда передай отдельную карточку на каждую группу. Никогда не выводи несколько карточек когда просят общую сводку.',
          input_schema: {
            type: 'object',
            properties: {
              cards: {
                type: 'array',
                description: 'Список карточек для отображения',
                items: {
                  type: 'object',
                  properties: {
                    title: {type: 'string'},
                    eyebrow: {type: 'string'},
                    rows: {type: 'array', items: {type: 'array', items: {type: 'string'}}},
                    note: {type: 'string'},
                    contact: {type: 'string'},
                    contactPhone: {type: 'string'}
                  },
                  required: ['title', 'rows']
                }
              }
            },
            required: ['cards']
          }
        }],
        tool_choice: {type: 'auto'}
      })

      const toolUse = response.content?.find((b) => b.type === 'tool_use' && b.name === 'show_cards')
      const reply =
        response.content?.find((b) => b.type === 'text')?.text?.trim() ||
        (toolUse ? 'Вывела карточки на экран.' : 'Sorry, I could not generate a response.')

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          reply,
          showCards: toolUse ? toolUse.input.cards : null,
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
