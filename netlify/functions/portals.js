const {createClient} = require('@sanity/client')
const {enrichPortal, isValidPortal} = require('./lib/progress')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false
})

const LIST_QUERY = `*[_type == "groupPortal"] | order(checkIn asc) {
  _id, groupName, checkIn, checkOut, totalGuests, adults, children, eventType,
  status, progressPercent, lastPortalSaveAt,
  "slug": portalSlug.current,
  portalAccessToken,
  flights, menuPlan, activities, specialRequests, dietaryRestrictions, transferNeeded
}`

function staffAuthorized(event) {
  const secret = process.env.DASHBOARD_SECRET
  if (!secret) return true
  const key = (event.queryStringParameters || {}).key
  return key === secret
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  }

  try {
    const raw = await client.fetch(LIST_QUERY)
    const staff = staffAuthorized(event)

    const portals = raw
      .filter(isValidPortal)
      .map((doc) => {
        const enriched = enrichPortal(doc)
        const base = {
          _id: enriched._id,
          groupName: enriched.groupName,
          checkIn: enriched.checkIn,
          checkOut: enriched.checkOut,
          totalGuests: enriched.totalGuests,
          adults: enriched.adults,
          children: enriched.children,
          eventType: enriched.eventType,
          status: enriched.status,
          progressPercent: enriched.progressPercent,
          progressSections: enriched.progressSections,
          slug: enriched.slug,
          property: 'Las Canas Beach Retreat',
          lastPortalSaveAt: enriched.lastPortalSaveAt,
          reminderCount: (enriched.reminders || []).length
        }
        if (staff && doc.portalAccessToken) {
          base.organizerPortalUrl = `https://ritaops.com/portal/${doc.slug}?token=${doc.portalAccessToken}`
        }
        return base
      })

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({portals, property: 'Las Canas Beach Retreat'})
    }
  } catch (err) {
    return {statusCode: 500, headers, body: JSON.stringify({error: err.message})}
  }
}
