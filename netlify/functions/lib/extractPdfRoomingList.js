const Anthropic = require('@anthropic-ai/sdk')

const PDF_MODEL = 'claude-sonnet-4-20250514'

const EXTRACTION_INSTRUCTION = `You are reading a hotel or tour group rooming list PDF.
Extract all available structured data from the document.

Return JSON ONLY — no markdown fences, no commentary:
{
  "groupId": "GROUP ID from the document, if present",
  "prodTourId": "Prod Tour ID from the document, if present",
  "dates": {
    "checkIn": "",
    "checkOut": "",
    "other": ""
  },
  "rooms": [
    { "number": "", "type": "", "guests": [""] }
  ],
  "guests": [
    { "name": "", "room": "", "gender": "", "age": "", "dietary": "" }
  ],
  "summary": "Plain-language summary of the rooming list in 2-4 sentences"
}

Use empty strings or empty arrays for fields not found in the PDF.`

function parseJsonFromText(text) {
  const cleaned = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()
  return JSON.parse(cleaned)
}

function normalizeBase64Pdf(base64Data) {
  return String(base64Data || '')
    .replace(/^data:application\/pdf;base64,/, '')
    .trim()
}

async function extractPdfRoomingList({base64Data, fileName, apiKey}) {
  const data = normalizeBase64Pdf(base64Data)
  if (!data) {
    throw new Error('PDF data is empty')
  }

  const key = (apiKey || process.env.ANTHROPIC_API_KEY || '').trim()
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const anthropic = new Anthropic({apiKey: key})
  const response = await anthropic.messages.create({
    model: PDF_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data
            }
          },
          {
            type: 'text',
            text: `${EXTRACTION_INSTRUCTION}\n\nFile name: ${fileName || 'attachment.pdf'}`
          }
        ]
      }
    ]
  })

  const text = response.content?.find((block) => block.type === 'text')?.text || ''
  const extraction = parseJsonFromText(text)

  return {
    extraction,
    fileName: fileName || 'attachment.pdf',
    model: PDF_MODEL
  }
}

function formatExtractionAsText(extraction) {
  if (!extraction) return ''
  const lines = []

  if (extraction.summary) lines.push(extraction.summary)

  if (extraction.groupId) lines.push(`GROUP ID: ${extraction.groupId}`)
  if (extraction.prodTourId) lines.push(`Prod Tour ID: ${extraction.prodTourId}`)

  const dates = extraction.dates || {}
  const dateParts = [dates.checkIn, dates.checkOut, dates.other].filter(Boolean)
  if (dateParts.length) lines.push(`Dates: ${dateParts.join(' · ')}`)

  if (Array.isArray(extraction.rooms) && extraction.rooms.length) {
    lines.push(`Rooms (${extraction.rooms.length}):`)
    extraction.rooms.forEach((room) => {
      const guests = Array.isArray(room.guests) ? room.guests.join(', ') : ''
      lines.push(
        `- ${room.number || '?'} (${room.type || 'type unknown'})${guests ? `: ${guests}` : ''}`
      )
    })
  }

  if (Array.isArray(extraction.guests) && extraction.guests.length) {
    lines.push(`Guests (${extraction.guests.length}):`)
    extraction.guests.forEach((guest) => {
      const details = [guest.gender, guest.age, guest.dietary].filter(Boolean).join(', ')
      lines.push(
        `- ${guest.name || 'Unknown'}${guest.room ? ` · room ${guest.room}` : ''}${details ? ` · ${details}` : ''}`
      )
    })
  }

  return lines.join('\n')
}

function buildAnswerFromParts({typedAnswer, extraction, group, pdfFileName}) {
  const parts = []

  if (group?.groupName || group?._id) {
    const groupLine = [
      group.groupName ? `Group: ${group.groupName}` : null,
      group._id ? `Portal ID: ${group._id}` : null
    ]
      .filter(Boolean)
      .join(' · ')
    if (groupLine) parts.push(groupLine)
  }

  if (extraction?.groupId) parts.push(`GROUP ID (from PDF): ${extraction.groupId}`)
  if (extraction?.prodTourId) parts.push(`Prod Tour ID (from PDF): ${extraction.prodTourId}`)

  if (typedAnswer) {
    parts.push('')
    parts.push(typedAnswer)
  }

  if (extraction) {
    parts.push('')
    parts.push(`--- Rooming list from ${pdfFileName || 'attached PDF'} ---`)
    parts.push(formatExtractionAsText(extraction))
  }

  return parts.join('\n').trim()
}

module.exports = {
  PDF_MODEL,
  parseJsonFromText,
  normalizeBase64Pdf,
  extractPdfRoomingList,
  formatExtractionAsText,
  buildAnswerFromParts
}
