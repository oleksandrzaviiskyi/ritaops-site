const Anthropic = require('@anthropic-ai/sdk')

const FILE_MODEL = 'claude-sonnet-4-6'

const IMAGE_MEDIA_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

const EXTRACTION_INSTRUCTION = `You are reading a hotel or tour group rooming list from a PDF or screenshot/image.
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

Use empty strings or empty arrays for fields not found in the document.`

function fileExtension(fileName) {
  const match = String(fileName || '')
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/)
  return match ? `.${match[1]}` : ''
}

function detectFileKind(fileName) {
  const ext = fileExtension(fileName)
  if (ext === '.pdf') return 'pdf'
  if (IMAGE_MEDIA_TYPES[ext]) return 'image'
  throw new Error(`Unsupported attachment type: ${ext || 'unknown'}`)
}

function imageMediaTypeFromFileName(fileName) {
  const ext = fileExtension(fileName)
  const mediaType = IMAGE_MEDIA_TYPES[ext]
  if (!mediaType) {
    throw new Error(`Unsupported image type: ${ext || 'unknown'}`)
  }
  return mediaType
}

function defaultFileName(fileName, kind) {
  if (fileName) return fileName
  return kind === 'pdf' ? 'attachment.pdf' : 'attachment.png'
}

function parseJsonFromText(text) {
  const cleaned = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()
  return JSON.parse(cleaned)
}

function normalizeBase64Attachment(base64Data) {
  let data = String(base64Data || '').trim()
  if (data.startsWith('data:') && data.includes(',')) {
    data = data.slice(data.indexOf(',') + 1)
  }
  return data.trim()
}

/** @deprecated use normalizeBase64Attachment */
function normalizeBase64Pdf(base64Data) {
  return normalizeBase64Attachment(base64Data)
}

function buildAnthropicContent({kind, data, fileName}) {
  const prompt = `${EXTRACTION_INSTRUCTION}\n\nFile name: ${fileName}`

  if (kind === 'pdf') {
    return [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data
        }
      },
      {type: 'text', text: prompt}
    ]
  }

  return [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageMediaTypeFromFileName(fileName),
        data
      }
    },
    {type: 'text', text: prompt}
  ]
}

async function extractRoomingFromAttachment({base64Data, fileName, apiKey}) {
  const kind = detectFileKind(fileName)
  const data = normalizeBase64Attachment(base64Data)
  if (!data) {
    throw new Error('Attachment data is empty')
  }

  const key = (apiKey || process.env.ANTHROPIC_API_KEY || '').trim()
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const resolvedName = defaultFileName(fileName, kind)
  const anthropic = new Anthropic({apiKey: key})
  const response = await anthropic.messages.create({
    model: FILE_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: buildAnthropicContent({kind, data, fileName: resolvedName})
      }
    ]
  })

  const text = response.content?.find((block) => block.type === 'text')?.text || ''
  const extraction = parseJsonFromText(text)

  return {
    extraction,
    fileName: resolvedName,
    fileKind: kind,
    model: FILE_MODEL
  }
}

/** @deprecated use extractRoomingFromAttachment */
async function extractPdfRoomingList(args) {
  return extractRoomingFromAttachment(args)
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

function buildAnswerFromParts({typedAnswer, extraction, group, pdfFileName, attachmentFileName}) {
  const fileName = attachmentFileName || pdfFileName
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

  if (extraction?.groupId) parts.push(`GROUP ID (from attachment): ${extraction.groupId}`)
  if (extraction?.prodTourId) parts.push(`Prod Tour ID (from attachment): ${extraction.prodTourId}`)

  if (typedAnswer) {
    parts.push('')
    parts.push(typedAnswer)
  }

  if (extraction) {
    parts.push('')
    parts.push(`--- Rooming list from ${fileName || 'attached file'} ---`)
    parts.push(formatExtractionAsText(extraction))
  }

  return parts.join('\n').trim()
}

module.exports = {
  FILE_MODEL,
  PDF_MODEL: FILE_MODEL,
  IMAGE_MEDIA_TYPES,
  detectFileKind,
  imageMediaTypeFromFileName,
  parseJsonFromText,
  normalizeBase64Attachment,
  normalizeBase64Pdf,
  extractRoomingFromAttachment,
  extractPdfRoomingList,
  formatExtractionAsText,
  buildAnswerFromParts
}
