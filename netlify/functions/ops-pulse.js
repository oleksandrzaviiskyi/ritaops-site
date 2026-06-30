const {createClient} = require('@sanity/client')
const {staffAuthorized} = require('./lib/staffAuth')
const {
  buildFieldPulse,
  PLACES_QUERY,
  CONCERNS_WITH_TASKS_QUERY
} = require('./lib/buildFieldPulse')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false
})

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
}

const PULSE_QUERY = `*[_id == "lasCanasPulse.lcbr"][0]{
  "coherenceStatement": coherence.coherenceStatement,
  "balanceStatus": coherence.balanceStatus,
  "lastSyncedAt": coherence.lastSyncedAt
}`

const PEOPLE_QUERY = `*[_type == "people"] | order(fullName asc) {
  _id,
  "name": fullName,
  fullName,
  "role": coalesce(position->title, role),
  department->{code, titleEn},
  position->{title},
  personCategory,
  workScheduleRegular,
  workScheduleGroups,
  lunchTime,
  active
}`

const RESPONSIBILITY_QUERY = `*[_type == "responsibilityDomain"]{
  _id, title, authorityLevel,
  "holder": currentHolder->{"name": fullName, "role": position->title},
  "people": relatedPeople[]->{"name": fullName, "role": position->title}
}`

const PORTALS_QUERY = `*[_type == "groupPortal" && status != "cancelled"] | order(checkIn asc) {
  _id,
  ritaRef,
  "title": groupName,
  groupName,
  checkIn,
  checkOut,
  totalGuests,
  "groupId": groupId,
  "categoryName": category->{name}
}`

const ROOMING_QUERY = `*[_type == "groupRoomingList"] | order(stayDateStart asc) {
  _id, groupId, stayDateStart, stayDateEnd, totalOccupants,
  "relatedGroupRef": relatedGroup._ref,
  rooms[]{roomNumber, roomType, "occupants": occupants[]{name, gender, age}}
}`

const RITA_QUESTIONS_QUERY = `*[_type == "ritaQuestion" && status == "open"] | order(askedAt desc) {
  _id, question, context, askedAt
}`

const CONCERNS_OPEN_QUERY = `*[_type == "ritaConcern" && status == "open"] | order(openedAt desc) {
  _id, summary, openedAt,
  "place": relatedPlace->{name, unitCode}
}`

async function getBookingStats(today) {
  const allBookings = await client.fetch(
    `*[_type == "lcbrBooking"]{
      checkIn, checkOut, guestCount, isGroup, source, totalAmount
    }`
  )
  const total = allBookings.length
  const past = allBookings.filter(b => b.checkOut < today).length
  const future = allBookings.filter(b => b.checkIn >= today).length
  const current = allBookings.filter(b => b.checkIn <= today && b.checkOut >= today).length
  const futureBookings = allBookings.filter(b => b.checkIn >= today)
  const futureGroups = futureBookings.filter(b => b.isGroup).length
  const futureIndividual = futureBookings.filter(b => !b.isGroup).length
  const futureGuests = futureBookings.reduce((s, b) => s + (b.guestCount || 0), 0)
  const bySource = {}
  for (const b of allBookings) {
    const src = b.source || 'Unknown'
    bySource[src] = (bySource[src] || 0) + 1
  }
  const in90 = new Date(today)
  in90.setDate(in90.getDate() + 90)
  const in90Iso = in90.toISOString().slice(0, 10)
  const next90 = allBookings.filter(b => b.checkIn >= today && b.checkIn <= in90Iso)
  return {
    total, past, current, future,
    futureGroups, futureIndividual, futureGuests,
    bySource,
    next90: {
      bookings: next90.length,
      groups: next90.filter(b => b.isGroup).length,
      individual: next90.filter(b => !b.isGroup).length,
      guests: next90.reduce((s, b) => s + (b.guestCount || 0), 0)
    }
  }
}

// Poster POS — складские остатки (сырьё/ингредиенты, не готовые блюда)
async function getPosterInventory() {
  try {
    const token = process.env.POSTER_API_TOKEN
    if (!token) return null

    const base = `https://joinposter.com/api`

    // Получаем склады
    const storagesRes = await fetch(`${base}/storage.getStorages?token=${token}`)
    const storagesData = await storagesRes.json()
    const storages = storagesData.response || []
    console.log('[poster] storages:', JSON.stringify(storages.slice(0, 2)))

    // Получаем остатки по каждому складу
    const storageItems = await Promise.all(
      storages.map(s =>
        fetch(`${base}/storage.getStorageLeftovers?token=${token}&storage_id=${s.storage_id}`)
          .then(r => r.json())
          .then(d => {
            console.log('[poster] storage leftovers raw:', JSON.stringify((d.response || []).slice(0, 2)))
            return {
              storageId: String(s.storage_id),
              name: s.storage_name,
              items: (d.response || []).map(i => ({
                id: String(i.ingredient_id),
                name: i.ingredient_name,
                unit: i.ingredient_unit,
                inStock: parseFloat(i.ingredient_left || 0),
                minStock: parseFloat(i.limit_value || 0),
                needsReorder: parseFloat(i.ingredient_left || 0) <= parseFloat(i.limit_value || 0) && parseFloat(i.limit_value || 0) > 0
              }))
            }
          })
          .catch(() => ({storageId: String(s.storage_id), name: s.storage_name, items: []}))
      )
    )

    const needsReorder = storageItems
      .flatMap(s => s.items.filter(i => i.needsReorder))

    return { storages: storageItems, needsReorder, syncedAt: new Date().toISOString() }
  } catch (err) {
    console.error('[poster] error:', err.message)
    return null
  }
}

// Poster POS — меню (готовые блюда и напитки, видимые в /manage/dishes).
// Отдельно от getPosterInventory(): инвентарь — это сырьё на складе (ингредиенты),
// а меню — это то, что реально подаётся гостям (название, категория, цена).
// Без этого Rita физически не видит список коктейлей/блюд и ошибочно говорит
// "не задокументировано", хотя данные есть в Poster — просто не были подключены.
async function getPosterMenu() {
  try {
    const token = process.env.POSTER_API_TOKEN
    if (!token) return null

    const base = `https://joinposter.com/api`

    const [categoriesRes, productsRes] = await Promise.all([
      fetch(`${base}/menu.getCategories?token=${token}`).then(r => r.json()),
      fetch(`${base}/menu.getProducts?token=${token}`).then(r => r.json())
    ])

    const categories = categoriesRes.response || []
    const products = productsRes.response || []

    const categoryNameById = new Map(
      categories.map(c => [String(c.category_id), c.category_name])
    )

    const items = products
      .filter(p => p.hidden !== '1')
      .map(p => {
        // price comes per spot (point of sale); take the first available price
        const priceObj = Array.isArray(p.price) ? p.price[0] : p.price
        const priceRaw = priceObj && typeof priceObj === 'object'
          ? Object.values(priceObj)[0]
          : priceObj
        const price = priceRaw != null ? parseFloat(priceRaw) / 100 : null
        return {
          id: String(p.product_id),
          name: p.product_name,
          categoryId: String(p.menu_category_id || ''),
          category: categoryNameById.get(String(p.menu_category_id)) || 'Без категории',
          price
        }
      })

    return { items, syncedAt: new Date().toISOString() }
  } catch (err) {
    console.error('[poster] menu error:', err.message)
    return null
  }
}

function deptDetailsFromTasks(openTasks) {
  const seen = new Set()
  const list = []
  for (const task of openTasks || []) {
    const dept = task.department
    if (!dept?.code || seen.has(dept.code)) continue
    seen.add(dept.code)
    list.push(dept)
  }
  return list
}

function findGroupTurnovers(portals) {
  if (!portals || portals.length < 2) return []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const targetDate = new Date(today)
  targetDate.setDate(targetDate.getDate() + 2)
  const targetIso = targetDate.toISOString().slice(0, 10)
  const checkouts = new Map()
  const checkins = new Map()
  for (const portal of portals) {
    if (portal.checkOut) {
      if (!checkouts.has(portal.checkOut)) checkouts.set(portal.checkOut, [])
      checkouts.get(portal.checkOut).push(portal)
    }
    if (portal.checkIn) {
      if (!checkins.has(portal.checkIn)) checkins.set(portal.checkIn, [])
      checkins.get(portal.checkIn).push(portal)
    }
  }
  const turnovers = []
  for (const [date, outGroups] of checkouts) {
    if (checkins.has(date) && date === targetIso) {
      const inGroups = checkins.get(date)
      turnovers.push({
        date,
        checkingOut: outGroups.map(g => g.groupName || g.title),
        checkingIn: inGroups.map(g => g.groupName || g.title),
        totalGuestsOut: outGroups.reduce((s, g) => s + (g.totalGuests || 0), 0),
        totalGuestsIn: inGroups.reduce((s, g) => s + (g.totalGuests || 0), 0)
      })
    }
  }
  return turnovers
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return {statusCode: 204, headers: cors}
  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}
  }

  try {
    const body = null
    if (!staffAuthorized(event, body, context)) {
      return {statusCode: 401, headers: cors, body: JSON.stringify({error: 'Staff auth required'})}
    }

    const today = new Date().toISOString().slice(0, 10)

    const [
      pulse, places, concernsRaw, people, responsibilities,
      portals, roomingLists, openQuestions, openConcerns,
      bookingStats, posterInventory, posterMenu
    ] = await Promise.all([
      client.fetch(PULSE_QUERY),
      client.fetch(PLACES_QUERY),
      client.fetch(CONCERNS_WITH_TASKS_QUERY),
      client.fetch(PEOPLE_QUERY),
      client.fetch(RESPONSIBILITY_QUERY),
      client.fetch(PORTALS_QUERY),
      client.fetch(ROOMING_QUERY),
      client.fetch(RITA_QUESTIONS_QUERY),
      client.fetch(CONCERNS_OPEN_QUERY),
      getBookingStats(today),
      getPosterInventory(),
      getPosterMenu()
    ])

    const concerns = (concernsRaw || []).map(c => ({
      ...c, deptDetails: deptDetailsFromTasks(c.openTasks)
    }))

    const field = buildFieldPulse(places || [], concernsRaw || [])
    const groupTurnovers = findGroupTurnovers(portals || [])

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        pulse: pulse || {},
        field, concerns,
        places: places || [],
        people: people || [],
        responsibilities: responsibilities || [],
        portals: portals || [],
        roomingLists: roomingLists || [],
        openQuestions: openQuestions || [],
        openConcerns: openConcerns || [],
        groupTurnovers,
        bookingStats,
        posterInventory,
        posterMenu
      })
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
