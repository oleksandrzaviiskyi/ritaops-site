const {createClient} = require('@sanity/client')
const {extractPdfRoomingList, formatExtractionAsText} = require('./extractPdfRoomingList')
const {persistGroupRoomingList} = require('./persistGroupRoomingList')
const {resolveGroupForRooming, buildUnmatchedGroupReply} = require('./resolveGroupForRooming')

async function processRoomingPdf(client, {extraction, pdfFileName, question}) {
  const resolved = await resolveGroupForRooming(client, {question, extraction})

  if (!resolved.group?._id) {
    return {
      group: null,
      source: null,
      roomingPersist: null,
      unmatched: true,
      unmatchedReply: buildUnmatchedGroupReply(extraction)
    }
  }

  const roomingPersist = await persistGroupRoomingList(client, {
    group: resolved.group,
    extraction,
    pdfFileName
  })

  return {
    group: resolved.group,
    source: resolved.source,
    prodId: resolved.prodId,
    roomingPersist,
    unmatched: false,
    unmatchedReply: null
  }
}

async function extractAndProcessRoomingPdf(client, {pdfData, pdfFileName, apiKey, question}) {
  const result = await extractPdfRoomingList({
    base64Data: pdfData,
    fileName: pdfFileName,
    apiKey
  })

  const processed = await processRoomingPdf(client, {
    extraction: result.extraction,
    pdfFileName: pdfFileName || result.fileName,
    question
  })

  return {
    extraction: result.extraction,
    fileName: result.fileName,
    ...processed
  }
}

function buildSavedRoomingContext({group, roomingPersist, extraction, fileName}) {
  const lines = []
  if (group?.groupName) {
    lines.push(`Rooming list linked to group: ${group.groupName}`)
  }
  if (roomingPersist?.prodId || group?.groupId) {
    lines.push(`Prod Tour ID: ${roomingPersist?.prodId || group.groupId}`)
  }
  if (roomingPersist?.roomingListId) {
    lines.push(`Saved as placement history record ${roomingPersist.roomingListId}`)
  }
  lines.push('')
  lines.push(`ATTACHED PDF (${fileName}) — extracted rooming list:`)
  lines.push(formatExtractionAsText(extraction))
  return lines.join('\n')
}

function createProductionClient(token) {
  return createClient({
    projectId: '0po0panc',
    dataset: 'production',
    useCdn: false,
    token,
    apiVersion: '2024-01-01'
  })
}

module.exports = {
  processRoomingPdf,
  extractAndProcessRoomingPdf,
  buildSavedRoomingContext,
  createProductionClient
}
