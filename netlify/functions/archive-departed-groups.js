const {createClient} = require('@sanity/client')
const {triggerRitaReflect} = require('./lib/triggerRitaReflect')

const writeToken = process.env.SANITY_TOKEN || process.env.SANITY_API_WRITE_TOKEN

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: writeToken,
  useCdn: false
})

/** YYYY-MM-DD in Las Canas local time, comparable lexicographically with Sanity `date` fields. */
function santoDomingoDateStr() {
  return new Date().toLocaleDateString('en-CA', {timeZone: 'America/Santo_Domingo'})
}

// Scheduled function — see netlify.toml for the cron (runs once a day).
// Archives any group whose checkOut date has already passed. This is
// separate from manual cancellation (cancel-group.js): a group that simply
// completed its stay isn't "cancelled", it's just done — so it gets its own
// status and stays out of operations/portal-list views without implying
// anything went wrong.
exports.handler = async () => {
  if (!writeToken) {
    console.error('[archive-departed-groups] SANITY_TOKEN not configured')
    return {statusCode: 500}
  }

  const today = santoDomingoDateStr()

  try {
    const departed = await client.fetch(
      `*[_type == "groupPortal" && defined(checkOut) && checkOut < $today && status != "cancelled" && status != "archived"]{
        _id, groupName, checkIn, checkOut, totalGuests
      }`,
      {today}
    )

    if (!departed.length) {
      console.log('[archive-departed-groups] nothing to archive, today =', today)
      return {statusCode: 200}
    }

    const archivedAt = new Date().toISOString()
    const tx = client.transaction()
    departed.forEach((p) => {
      tx.patch(p._id, (patch) => patch.set({status: 'archived', archivedAt}))
    })
    await tx.commit()

    console.log(
      `[archive-departed-groups] archived ${departed.length} group(s): ` +
        departed.map((p) => `${p.groupName || p._id} (checkOut ${p.checkOut})`).join(', ')
    )

    await triggerRitaReflect().catch((err) => {
      console.warn('[archive-departed-groups] triggerRitaReflect failed', err.message)
    })

    return {statusCode: 200}
  } catch (err) {
    console.error('[archive-departed-groups] error', err.message)
    return {statusCode: 500}
  }
}
