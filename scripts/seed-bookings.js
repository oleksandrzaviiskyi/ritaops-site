/**
 * Import LCBR bookings from Excel into Sanity.
 * Run from repo root (xlsx file in cwd):
 *   SANITY_TOKEN=... node scripts/seed-bookings.js
 * Optional: node scripts/seed-bookings.js path/to/report.xlsx
 */

const {createClient} = require('@sanity/client')
const XLSX = require('xlsx')
const path = require('path')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: 'skSdMdvZxq4KcYcGIBhuApKQLAKVytxA8uZ0pkhoWWHiuJQp6CN46wKpNcXbPhNR8dqrs7FtbqNAl4XBNiCzDN4fUBDrBtIx6oikqduJH01oVFkCoxYaLhuA5Lpz5HEJU8Up30mcKjJK7AS6V74j7dBbNq6rMtFgJ5ela20CgTHWqZ9JiD5L',
  useCdn: false
})

const INTERNAL = [
  'cleaning susio',
  'susio cleaning',
  'maintenence block',
  'maintenance block',
  'block maintenence',
  'block maintenance',
  'repair repair',
  'yasper yasper',
  'yasper family',
  'family yasper',
  'ceiling fan project',
  'fan project ceiling',
  'mantenimiento mantenimiento'
]

function isInternal(name) {
  if (!name) return true
  const lower = name.toLowerCase()
  return INTERNAL.some(i => lower.includes(i.split(' ')[0]) && lower.includes(i.split(' ')[1] || ''))
}

function excelDateToISO(serial) {
  if (!serial) return null
  if (typeof serial === 'string' && serial.includes('-')) return serial.slice(0, 10)
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000))
  return date.toISOString().slice(0, 10)
}

function parseSource(pos) {
  if (!pos) return 'Front Desk'
  const p = pos.toLowerCase()
  if (p.includes('booking.com')) return 'Booking.com'
  if (p.includes('expedia')) return 'Expedia'
  if (p.includes('airbnb')) return 'Airbnb'
  return 'Front Desk'
}

function parseRoomTypes(roomType) {
  if (!roomType) return []
  if (roomType.includes('1.')) {
    return roomType.split(/\d+\./).filter(Boolean).map(s => s.trim())
  }
  return [roomType.trim()]
}

function detectIsGroup(row) {
  const name = String(row['Guest'] || '').toLowerCase()
  const rooms = Number(row['Rooms'] || 0)
  const guests = Number(row['Guests'] || 0)
  const keywords = ['ef cultural', 'tours', 'travel', 'group', 'consulting', 'school', 'international']
  return rooms > 3 || guests > 10 || keywords.some(k => name.includes(k))
}

async function run() {
  const filePath = process.argv[2] || 'Report_2024-12-15-2026-06-17.xlsx'
  const resolved = path.resolve(process.cwd(), filePath)
  const wb = XLSX.readFile(resolved)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws)

  console.log('Reading:', resolved)
  console.log('Total rows:', rows.length)

  const mutations = []
  let skipped = 0

  for (const row of rows) {
    const guestName = String(row['Guest'] || '').trim()

    if (isInternal(guestName)) {
      skipped++
      continue
    }

    const bookingNo = String(row['Booking No.'] || '').trim()
    if (!bookingNo) {
      skipped++
      continue
    }

    const doc = {
      _type: 'lcbrBooking',
      _id: 'booking-' + bookingNo.replace(/[^a-zA-Z0-9]/g, '-'),
      bookingNo,
      externalNo: String(row['External number'] || '').trim() || null,
      guestName,
      checkIn: excelDateToISO(row['Check-in date']),
      checkOut: excelDateToISO(row['Departure date']),
      nights: Number(row['Nights'] || 0),
      roomCount: Number(row['Rooms'] || 0),
      roomTypes: parseRoomTypes(String(row['Room type'] || '')),
      totalAmount: Number(row['Total amount'] || 0),
      prepaidAmount: Number(row['Prepaid amount'] || 0),
      paymentMethod: String(row['Payment method'] || '').trim(),
      source: parseSource(String(row['Point of sale'] || '')),
      ratePlan: String(row['Special offer'] || '').trim() || null,
      extraServices: String(row['Extra services'] || '').trim() || null,
      guestComment: String(row['Guest comment'] || '').trim() || null,
      phone: String(row['Phone'] || '').trim() || null,
      email: String(row['Email'] || '').trim() || null,
      country: String(row['Country'] || '').trim() || null,
      guestCount: Number(row['Guests'] || 0),
      isGroup: detectIsGroup(row),
      bookedAt: row['Booking date']
        ? new Date(Math.round((row['Booking date'] - 25569) * 86400 * 1000)).toISOString()
        : null
    }

    mutations.push({createOrReplace: doc})
  }

  console.log('To import:', mutations.length, '| Skipped:', skipped)

  for (let i = 0; i < mutations.length; i += 100) {
    const batch = mutations.slice(i, i + 100)
    await client.mutate(batch)
    console.log(`Imported ${Math.min(i + 100, mutations.length)}/${mutations.length}`)
  }

  console.log('Done!')
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
