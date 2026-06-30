/**
 * Генерирует стабильный внутренний номер бронирования RitaOps,
 * например LCBR-2026-0042. Выдаётся КАЖДОЙ группе при создании,
 * независимо от того, попадёт ли она потом в PMS — в отличие от
 * номера PMS (pmsBookingNumber), который существует только если
 * менеджер вручную решил провести бронь через Exely.
 *
 * Атомарность обеспечивается счётчиком в отдельном документе
 * `counter.{propertyCode}.{year}` через Sanity .inc() — эта операция
 * выполняется на сервере Sanity и безопасна при одновременном
 * создании двух групп (в отличие от чтения значения и записи +1
 * на стороне клиента, что создавало бы race condition).
 */

const PAD_LENGTH = 4

function counterDocId(propertyCode, year) {
  return `counter.${propertyCode}.${year}`
}

/**
 * @param {import('@sanity/client').SanityClient} client — должен быть с write-токеном
 * @param {string} propertyCode — например 'LCBR'. Должен совпадать с полем `code` документа property.
 * @param {Date} [now] — для тестируемости, по умолчанию текущая дата
 * @returns {Promise<string>} например 'LCBR-2026-0042'
 */
async function generateRitaRef(client, propertyCode, now = new Date()) {
  const code = String(propertyCode || '').trim().toUpperCase()
  if (!code) {
    throw new Error('generateRitaRef: propertyCode is required')
  }

  const year = now.getFullYear()
  const docId = counterDocId(code, year)

  const tx = client.transaction()
  tx.createIfNotExists({_id: docId, _type: 'bookingCounter', propertyCode: code, year, value: 0})
  tx.patch(docId, (p) => p.inc({value: 1}))

  const results = await tx.commit({returnDocuments: true})
  const patched = results.find((doc) => doc._id === docId)
  const sequence = patched.value
  const padded = String(sequence).padStart(PAD_LENGTH, '0')

  return `${code}-${year}-${padded}`
}

module.exports = {generateRitaRef, counterDocId}
