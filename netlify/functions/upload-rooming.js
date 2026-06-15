const {
  extractAndProcessRoomingPdf,
  buildSavedRoomingContext,
  createProductionClient
} = require('./lib/roomingPdfFlow')

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {statusCode: 204, headers: cors}
  if (event.httpMethod !== 'POST') return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}

  const staffKey = event.headers.authorization?.replace('Bearer ', '') || ''
  if (staffKey !== (process.env.DASHBOARD_SECRET || 'rita2026')) {
    return {statusCode: 401, headers: cors, body: JSON.stringify({error: 'Unauthorized'})}
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const {pdfData, fileName, groupHint} = body

    if (!pdfData) return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'pdfData required'})}

    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
    const writeToken = process.env.SANITY_TOKEN || process.env.SANITY_API_WRITE_TOKEN
    if (!apiKey) return {statusCode: 500, headers: cors, body: JSON.stringify({error: 'ANTHROPIC_API_KEY not set'})}
    if (!writeToken) return {statusCode: 500, headers: cors, body: JSON.stringify({error: 'SANITY_TOKEN not set'})}

    const client = createProductionClient(writeToken)
    const processed = await extractAndProcessRoomingPdf(client, {
      pdfData,
      pdfFileName: fileName || 'rooming.pdf',
      apiKey,
      question: groupHint || ''
    })

    if (processed.unmatched) {
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          ok: false,
          unmatched: true,
          message: processed.unmatchedReply,
          extraction: processed.extraction
        })
      }
    }

    const ctx = buildSavedRoomingContext({
      group: processed.group,
      roomingPersist: processed.roomingPersist,
      extraction: processed.extraction,
      fileName: processed.fileName
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        ok: true,
        groupName: processed.group?.groupName,
        roomingListId: processed.roomingPersist?.roomingListId,
        totalRooms: processed.extraction?.rooms?.length || 0,
        totalGuests: processed.extraction?.totalOccupants || 0,
        summary: ctx
      })
    }
  } catch (err) {
    console.error('upload-rooming error:', err)
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
