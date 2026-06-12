function resolveGroupFromQuestion(question) {
  for (const ev of question?.events || []) {
    if (ev?.group?._id || ev?.group?.groupName) {
      return ev.group
    }
  }
  return null
}

function prodIdsFromExtraction(extraction) {
  const ids = []
  for (const key of ['prodTourId', 'groupId']) {
    const value = String(extraction?.[key] || '').trim()
    if (value && !ids.includes(value)) ids.push(value)
  }
  return ids
}

async function findGroupPortalByProdId(client, extraction) {
  const prodIds = prodIdsFromExtraction(extraction)
  if (!prodIds.length) return null

  for (const prodId of prodIds) {
    const byGroupId = await client.fetch(
      `*[_type == "groupPortal" && groupId == $prodId && status != "cancelled"][0]{
        _id, groupName, groupId, checkIn, checkOut
      }`,
      {prodId}
    )
    if (byGroupId?._id) {
      return {group: byGroupId, matchedBy: 'groupId', prodId}
    }

    const byName = await client.fetch(
      `*[_type == "groupPortal" && groupName match $pattern && status != "cancelled"][0]{
        _id, groupName, groupId, checkIn, checkOut
      }`,
      {pattern: `*${prodId}*`}
    )
    if (byName?._id) {
      return {group: byName, matchedBy: 'groupName', prodId}
    }
  }

  return null
}

async function resolveGroupForRooming(client, {question, extraction}) {
  const fromQuestion = resolveGroupFromQuestion(question)
  if (fromQuestion?._id) {
    return {group: fromQuestion, source: 'question', prodId: fromQuestion.groupId || null}
  }

  if (extraction) {
    const match = await findGroupPortalByProdId(client, extraction)
    if (match?.group?._id) {
      return {
        group: match.group,
        source: match.matchedBy,
        prodId: match.prodId
      }
    }
  }

  return {group: null, source: null, prodId: prodIdsFromExtraction(extraction)[0] || null}
}

function buildUnmatchedGroupReply(extraction) {
  const prodIds = prodIdsFromExtraction(extraction)
  if (prodIds.length) {
    return (
      `I read the rooming list (Prod Tour ID: ${prodIds.join(' / ')}), but I couldn't match it to any group in the system. ` +
      `Which group is this rooming list for?`
    )
  }
  return (
    "I read the rooming list, but I couldn't find a Prod Tour ID in the PDF and couldn't match it to any group. " +
    'Which group is this rooming list for?'
  )
}

module.exports = {
  resolveGroupFromQuestion,
  prodIdsFromExtraction,
  findGroupPortalByProdId,
  resolveGroupForRooming,
  buildUnmatchedGroupReply
}
