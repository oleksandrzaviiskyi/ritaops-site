/**
 * One-off seed: EF groupCategory in production.
 * Run: SANITY_TOKEN=sk... node scripts/seed-ef-group-category.js
 */

const {createClient} = require('@sanity/client')

const token = process.env.SANITY_TOKEN || process.env.SANITY_API_WRITE_TOKEN
if (!token) {
  console.error('Missing SANITY_TOKEN')
  process.exit(1)
}

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  useCdn: false,
  token,
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

async function main() {
  const result = await client.createOrReplace(doc)
  console.log('Created:', result._id, result.name || doc.name)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
