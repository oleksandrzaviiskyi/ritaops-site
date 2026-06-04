const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december'
]

function slugifyName(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

/** yoga-retreat-july-2026 */
function slugFromGroupNameAndDate(groupName, checkIn) {
  const base = slugifyName(groupName) || 'group'
  if (!checkIn) return base

  const d = new Date(checkIn)
  if (Number.isNaN(d.getTime())) return base

  const month = MONTHS[d.getUTCMonth()] || 'month'
  const year = d.getUTCFullYear()
  return `${base}-${month}-${year}`.replace(/--+/g, '-').slice(0, 64)
}

async function uniqueSlug(client, groupName, checkIn) {
  let slug = slugFromGroupNameAndDate(groupName, checkIn)
  const existing = await client.fetch(
    `*[_type == "groupPortal" && portalSlug.current == $slug][0]._id`,
    {slug}
  )
  if (!existing) return slug

  for (let n = 2; n < 100; n++) {
    const candidate = `${slug}-${n}`
    const clash = await client.fetch(
      `*[_type == "groupPortal" && portalSlug.current == $slug][0]._id`,
      {slug: candidate}
    )
    if (!clash) return candidate
  }
  return `${slug}-${Date.now()}`
}

module.exports = {slugFromGroupNameAndDate, uniqueSlug}
