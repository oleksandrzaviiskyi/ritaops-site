const {formatExtractionAsText} = require('./extractPdfRoomingList')

function fileSlug(fileName) {
  const base = String(fileName || 'attachment')
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return base.slice(0, 48) || 'attachment'
}

function safeIdPart(value) {
  return String(value || 'unknown')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'unknown'
}

function parseDateOnly(value) {
  if (!value) return undefined
  const match = String(value).trim().match(/\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : undefined
}

function resolveProdId(extraction, group) {
  return String(extraction?.prodTourId || extraction?.groupId || group?.groupId || '').trim()
}

function resolveTourCode(extraction) {
  if (extraction?.tourCode) return String(extraction.tourCode).trim()
  const other = String(extraction?.dates?.other || '').trim()
  if (/^[A-Z]{2,4}-\d/.test(other)) return other
  return ''
}

function mapRoomsToSchema(extraction) {
  const guestList = Array.isArray(extraction?.guests) ? extraction.guests : []
  const rooms = Array.isArray(extraction?.rooms) ? extraction.rooms : []

  return rooms.map((room, idx) => {
    const roomNumber = String(room?.number || '').trim()
    const occupantsFromGuests = guestList
      .filter((guest) => !roomNumber || String(guest.room || '').trim() === roomNumber)
      .map((guest, guestIdx) => ({
        _key: `occ-${idx}-${guestIdx}`,
        name: guest.name || '',
        gender: guest.gender || '',
        age: guest.age ? String(guest.age) : '',
        notes: guest.dietary || ''
      }))

    const occupantsFromRoomGuests = (Array.isArray(room?.guests) ? room.guests : [])
      .filter(Boolean)
      .map((name, guestIdx) => ({
        _key: `occ-${idx}-n-${guestIdx}`,
        name: typeof name === 'string' ? name : String(name?.name || ''),
        gender: '',
        age: '',
        notes: ''
      }))

    const occupants = occupantsFromGuests.length ? occupantsFromGuests : occupantsFromRoomGuests

    return {
      _key: `room-${idx}`,
      roomNumber,
      roomType: room?.type || '',
      occupants,
      notes: ''
    }
  })
}

function countOccupants(extraction, rooms) {
  const guestCount = Array.isArray(extraction?.guests) ? extraction.guests.length : 0
  if (guestCount) return guestCount

  return rooms.reduce((sum, room) => sum + (room.occupants?.length || 0), 0)
}

function aggregateDietary(extraction) {
  const lines = (extraction?.guests || [])
    .map((guest) => {
      if (!guest?.dietary) return ''
      return guest.name ? `${guest.name}: ${guest.dietary}` : guest.dietary
    })
    .filter(Boolean)
  return lines.join('\n')
}

function buildRoomingListDoc({group, extraction, pdfFileName}) {
  const prodId = resolveProdId(extraction, group)
  const slug = fileSlug(pdfFileName)
  const docId = `rooming-${safeIdPart(prodId)}-${slug}`
  const rooms = mapRoomsToSchema(extraction)
  const dates = extraction?.dates || {}

  const doc = {
    _id: docId,
    _type: 'groupRoomingList',
    relatedGroup: {_type: 'reference', _ref: group._id},
    groupId: prodId,
    sourceFileName: pdfFileName,
    receivedAt: new Date().toISOString(),
    rooms,
    rawExtraction: formatExtractionAsText(extraction) || JSON.stringify(extraction, null, 2)
  }

  const tourCode = resolveTourCode(extraction)
  if (tourCode) doc.tourCode = tourCode

  const tourDateStart = parseDateOnly(dates.checkIn)
  const tourDateEnd = parseDateOnly(dates.checkOut)
  if (tourDateStart) doc.tourDateStart = tourDateStart
  if (tourDateEnd) doc.tourDateEnd = tourDateEnd

  if (group.checkIn) doc.stayDateStart = group.checkIn
  if (group.checkOut) doc.stayDateEnd = group.checkOut

  const totalOccupants = countOccupants(extraction, rooms)
  if (totalOccupants > 0) doc.totalOccupants = totalOccupants

  const dietary = aggregateDietary(extraction)
  if (dietary) doc.dietary = dietary

  return {docId, doc, prodId}
}

async function persistGroupRoomingList(client, {group, extraction, pdfFileName}) {
  if (!group?._id || !extraction) {
    return {roomingListId: null, prodId: null, groupIdUpdated: false}
  }

  const {docId, doc, prodId} = buildRoomingListDoc({group, extraction, pdfFileName})

  await client.createIfNotExists(doc)

  let groupIdUpdated = false
  if (prodId && !group.groupId) {
    await client.patch(group._id).set({groupId: prodId}).commit()
    groupIdUpdated = true
  }

  return {roomingListId: docId, prodId, groupIdUpdated}
}

module.exports = {
  fileSlug,
  safeIdPart,
  resolveProdId,
  mapRoomsToSchema,
  buildRoomingListDoc,
  persistGroupRoomingList
}
