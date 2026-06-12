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

const doc = {
  _id: 'groupCategory.ef',
  _type: 'groupCategory',
  code: 'EF',
  name: 'Education First',
  summary:
    'EF (Education First) — мировой лидер международного образования с 1965 года. Языковые программы, образовательные туры, культурный обмен, gap year. Группы, приезжающие в Las Canas, — образовательные: визит имеет учебную и культурную цель, а не только отдых.',
  participantProfile:
    'Чаще молодые участники — подростки и молодёжь (типично 13–25 лет), нередко несовершеннолетние. Международный состав: студенты из разных стран, разные родные языки, разный уровень английского и испанского.',
  leadershipStructure:
    'Группой руководит EF-лидер или учитель-сопровождающий. Это ключевой контакт Rita — вся координация идёт через лидера, а не через отдельных участников. Лидер несёт ответственность за группу.',
  operationalSpecifics:
    'Структурированное расписание: учебная часть, активности, групповое питание в чёткие часы. Нужен supervision и внимание к безопасности, особенно на воде и экскурсиях. Активности должны быть возрастно-уместными. Формат — всё включено, групповой.',
  sensitivities:
    'Разные диеты (религиозные, культурные, аллергии). Языковые барьеры. Если есть несовершеннолетние — без алкоголя, повышенное внимание к безопасности и к ожиданиям родителей и школы.',
  ritaGuidance:
    'Воспринимай EF-группу как молодую, организованную, образовательную, находящуюся под ответственностью лидера. Естественный порядок (Ṛta) здесь — это ясное расписание, безопасность, чёткая коммуникация через лидера и уважение к учебной цели визита. Замечай, когда что-то угрожает структуре или безопасности группы, и поднимай это рано.'
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

    if (!writeToken) {
      return {statusCode: 500, headers: cors, body: JSON.stringify({error: 'SANITY_TOKEN not configured'})}
    }

    const result = await client.createOrReplace(doc)

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ok: true, id: result._id, code: doc.code, name: doc.name})
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
