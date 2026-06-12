const {createClient} = require('@sanity/client')
const {resolveStaffAuth} = require('./lib/staffAuth')
const {extractPdfRoomingList, buildAnswerFromParts} = require('./lib/extractPdfRoomingList')
const {
  processRoomingPdf
} = require('./lib/roomingPdfFlow')
const {resolveGroupFromQuestion} = require('./lib/resolveGroupForRooming')

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

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors}
  }

  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}
  }

  try {
    const body = JSON.parse(event.body || '{}')

    const auth = resolveStaffAuth(event, body, context)
    if (!auth.authorized) {
      return {statusCode: 401, headers: cors, body: JSON.stringify({error: 'Staff auth required'})}
    }

    if (!writeToken) {
      return {statusCode: 500, headers: cors, body: JSON.stringify({error: 'SANITY_TOKEN not configured'})}
    }

    const questionId = String(body.questionId || '').trim()
    const typedAnswer = String(body.answer || '').trim()
    const pdf = body.pdf || null
    const pdfData = pdf?.base64Data ? String(pdf.base64Data).trim() : ''
    const pdfFileName = pdf?.fileName ? String(pdf.fileName).trim() : 'attachment.pdf'

    if (!questionId) {
      return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'questionId is required'})}
    }
    if (!typedAnswer && !pdfData) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({error: 'answer or pdf is required'})
      }
    }

    const question = await client.fetch(
      `*[_type == "ritaQuestion" && _id == $questionId][0]{
        _id,
        "events": relatedEvents[]->{
          _id,
          "group": relatedGroup->{
            _id,
            groupName,
            groupId,
            checkIn,
            checkOut
          }
        }
      }`,
      {questionId}
    )

    if (!question?._id) {
      return {statusCode: 404, headers: cors, body: JSON.stringify({error: 'Question not found'})}
    }

    let extraction = null
    let group = null
    let roomingPersist = null
    let groupSource = null

    if (pdfData) {
      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
      if (!apiKey) {
        return {
          statusCode: 500,
          headers: cors,
          body: JSON.stringify({error: 'ANTHROPIC_API_KEY not configured'})
        }
      }

      const result = await extractPdfRoomingList({
        base64Data: pdfData,
        fileName: pdfFileName,
        apiKey
      })
      extraction = result.extraction

      const processed = await processRoomingPdf(client, {
        extraction,
        pdfFileName,
        question
      })
      group = processed.group
      roomingPersist = processed.roomingPersist
      groupSource = processed.source
    } else {
      group = resolveGroupFromQuestion(question)
      groupSource = group?._id ? 'question' : null
    }

    const answer = buildAnswerFromParts({
      typedAnswer,
      extraction,
      group,
      pdfFileName: pdfData ? pdfFileName : null
    })

    await client.patch(questionId).set({answer, status: 'answered'}).commit()

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        ok: true,
        questionId,
        group: group
          ? {
              _id: group._id,
              groupName: group.groupName,
              groupId: group.groupId,
              checkIn: group.checkIn,
              checkOut: group.checkOut
            }
          : null,
        groupSource,
        extraction,
        roomingListId: roomingPersist?.roomingListId || null,
        groupIdUpdated: roomingPersist?.groupIdUpdated || false,
        answerPreview: answer.slice(0, 500)
      })
    }
  } catch (err) {
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
