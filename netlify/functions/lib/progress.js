/** Прогресс и напоминания для groupPortal (RitaOps). */

function filledString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function filledNumber(v) {
  return typeof v === 'number' && !Number.isNaN(v) && v > 0
}

function computePortalProgress(doc) {
  const coreChecks = [
    filledString(doc.groupName),
    !!doc.checkIn,
    !!doc.checkOut,
    filledNumber(doc.totalGuests),
    filledNumber(doc.adults),
    !!doc.eventType
  ]
  const core = Math.round((coreChecks.filter(Boolean).length / coreChecks.length) * 100)

  const flights = Array.isArray(doc.flights) ? doc.flights : []
  const hasArrival = flights.some(
    (f) => f?.direction === 'arrival' && (f.flightNumber || f.date)
  )
  const hasDeparture = flights.some(
    (f) => f?.direction === 'departure' && (f.flightNumber || f.date)
  )
  const travelParts = [hasArrival, hasDeparture, doc.transferNeeded != null]
  const travel = Math.round(
    (travelParts.filter(Boolean).length / travelParts.length) * 100
  )

  const menuDays = Array.isArray(doc.menuPlan) ? doc.menuPlan : []
  let food = 0
  if (menuDays.length > 0) {
    const filledDays = menuDays.filter(
      (d) =>
        filledString(d?.breakfast) || filledString(d?.lunch) || filledString(d?.dinner)
    ).length
    food = Math.round((filledDays / menuDays.length) * 100)
  }

  const dietary = Array.isArray(doc.dietaryRestrictions) ? doc.dietaryRestrictions : []
  const dining = Math.round(
    dietary.length > 0
      ? Math.min(100, food + 20)
      : food
  )

  const activities = Array.isArray(doc.activities) ? doc.activities : []
  const program =
    activities.length === 0
      ? 0
      : Math.round(
          (activities.filter((a) => a?.activity && a?.date).length / activities.length) * 100
        )

  const notes = filledString(doc.specialRequests) ? 100 : 0

  const weights = {core: 30, travel: 25, food: 25, program: 10, notes: 10}
  const sections = {
    core,
    travel,
    food: dining,
    program,
    notes,
    wellness: 0,
    kids: doc.children > 0 ? Math.min(100, core) : 0
  }

  const percent = Math.min(
    100,
    Math.round(
      (sections.core * weights.core +
        sections.travel * weights.travel +
        sections.food * weights.food +
        sections.program * weights.program +
        sections.notes * weights.notes) /
        100
    )
  )

  return {percent, sections}
}

function derivePortalStatus(doc, percent) {
  const flights = Array.isArray(doc.flights) ? doc.flights : []
  const menuDays = Array.isArray(doc.menuPlan) ? doc.menuPlan : []
  const hasFlights = flights.length > 0
  const hasMenu = menuDays.some(
    (d) => filledString(d?.breakfast) || filledString(d?.lunch) || filledString(d?.dinner)
  )

  if (percent >= 85 && hasFlights && hasMenu) return 'ready'
  if (hasMenu) return 'menu_done'
  if (hasFlights) return 'flights_done'
  if (percent > 5) return 'in_progress'
  return 'new'
}

function buildReminders(doc) {
  const items = []
  const flights = Array.isArray(doc.flights) ? doc.flights : []
  const menuDays = Array.isArray(doc.menuPlan) ? doc.menuPlan : []
  const dietary = Array.isArray(doc.dietaryRestrictions) ? doc.dietaryRestrictions : []

  if (!flights.some((f) => f?.direction === 'arrival' && f.date)) {
    items.push({id: 'flights', text: 'Добавить рейсы прилёта группы', priority: 'high'})
  }
  if (menuDays.length === 0) {
    items.push({id: 'menu', text: 'Заполнить меню по дням', priority: 'high'})
  }
  if (dietary.length === 0 && (doc.totalGuests || 0) > 0) {
    items.push({id: 'diet', text: 'Уточнить диетические ограничения гостей', priority: 'medium'})
  }
  if (!doc.checkIn || !doc.checkOut) {
    items.push({id: 'dates', text: 'Указать даты заезда и выезда', priority: 'high'})
  }
  if ((doc.progressPercent ?? 0) < 30) {
    items.push({id: 'kickoff', text: 'Новая группа — отправить организатору ссылку на портал', priority: 'medium'})
  }

  return items
}

function enrichPortal(doc) {
  const {percent, sections} = computePortalProgress(doc)
  const status = derivePortalStatus(doc, percent)
  return {
    ...doc,
    progressPercent: percent,
    progressSections: sections,
    status,
    reminders: buildReminders({...doc, progressPercent: percent})
  }
}

function isValidPortal(doc) {
  return doc && (doc.groupName || doc.slug) && doc.slug
}

module.exports = {
  computePortalProgress,
  derivePortalStatus,
  buildReminders,
  enrichPortal,
  isValidPortal
}
