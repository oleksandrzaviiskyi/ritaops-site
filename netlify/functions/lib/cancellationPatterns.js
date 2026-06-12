const PATTERN_CAUSES = new Set(['financial', 'climate', 'political', 'organizational', 'other'])
const PATTERN_MIN_COUNT = 3
const PATTERN_WINDOW_DAYS = 180

function parseRawData(rawData) {
  if (!rawData) return {}
  try {
    return typeof rawData === 'string' ? JSON.parse(rawData) : rawData
  } catch {
    return {}
  }
}

function isPatternEligible(raw) {
  if (raw.cancellationIsPrivate) return false
  const cause = String(raw.cancellationCause || '').trim()
  if (!cause || cause === 'personal' || cause === 'health' || cause === 'unknown') return false
  return PATTERN_CAUSES.has(cause) || cause === 'financial' || cause === 'climate' || cause === 'political'
}

function causeLabel(cause) {
  const labels = {
    personal: 'личное / семейное',
    health: 'здоровье',
    financial: 'финансовое / экономическое',
    climate: 'климат / погода',
    political: 'политика / безопасность / визы',
    organizational: 'организационное',
    other: 'другое',
    unknown: 'неясно'
  }
  return labels[cause] || cause
}

function randomKey() {
  return Math.random().toString(36).slice(2, 12)
}

async function watchCancellationPatterns(client, currentEvent) {
  if (currentEvent?.eventType !== 'cancellation') return null

  const currentRaw = parseRawData(currentEvent.rawData)
  const cause = String(currentRaw.cancellationCause || '').trim()
  if (!isPatternEligible(currentRaw)) return null

  const since = new Date(Date.now() - PATTERN_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const siblings = await client.fetch(
    `*[_type == "ritaEvent" && eventType == "cancellation" && timestamp > $since && _id != $currentId]{
      _id, rawData, "groupName": relatedGroup->groupName
    }`,
    {since, currentId: currentEvent._id}
  )

  const matching = siblings.filter((ev) => {
    const raw = parseRawData(ev.rawData)
    return String(raw.cancellationCause || '').trim() === cause && isPatternEligible(raw)
  })

  const total = matching.length + 1
  if (total < PATTERN_MIN_COUNT) return null

  const eventRefs = [
    {_type: 'reference', _ref: currentEvent._id, _key: randomKey()},
    ...matching.slice(0, 8).map((ev) => ({
      _type: 'reference',
      _ref: ev._id,
      _key: randomKey()
    }))
  ]

  const groupNames = [
    currentEvent.groupName,
    ...matching.map((ev) => ev.groupName).filter(Boolean)
  ].filter(Boolean)

  const statement =
    `За последние ${Math.round(PATTERN_WINDOW_DAYS / 30)} месяцев ${total} отмены указывают на одну внешнюю причину: ${causeLabel(cause)}.` +
    (groupNames.length ? ` Группы: ${groupNames.slice(0, 5).join(', ')}${groupNames.length > 5 ? '…' : ''}.` : '')

  const existing = await client.fetch(
    `*[_type == "ritaHypothesis" && status == "proposed" && statement match $needle][0]{ _id, supportingEvents }`,
    {needle: `*${causeLabel(cause)}*`}
  )

  const confidence = total >= 5 ? 'repeated' : total >= 4 ? 'emerging' : 'low'

  if (existing?._id) {
    const mergedRefs = [...(existing.supportingEvents || [])]
    for (const ref of eventRefs) {
      if (!mergedRefs.some((r) => r._ref === ref._ref)) {
        mergedRefs.push(ref)
      }
    }
    await client
      .patch(existing._id)
      .set({
        statement,
        confidence,
        supportingEvents: mergedRefs.slice(0, 12)
      })
      .commit()
    return {hypothesisId: existing._id, updated: true, count: total}
  }

  const created = await client.create({
    _type: 'ritaHypothesis',
    statement,
    discoveredAt: new Date().toISOString(),
    supportingEvents: eventRefs,
    confidence,
    status: 'proposed'
  })

  return {hypothesisId: created._id, updated: false, count: total}
}

module.exports = {
  parseRawData,
  isPatternEligible,
  causeLabel,
  watchCancellationPatterns
}
