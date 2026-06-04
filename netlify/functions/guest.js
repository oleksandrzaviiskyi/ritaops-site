const {createClient} = require('@sanity/client')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false
})

const GROUP_QUERY = `*[_type == "groupPortal" && portalSlug.current == $groupSlug][0]{
  _id,
  groupName,
  checkIn,
  checkOut,
  "groupSlug": portalSlug.current
}`

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
}

function readGroupSlug(event) {
  const fromQuery = event.queryStringParameters?.groupSlug
  const fromPath = event.path?.split('/guest/')?.[1]
  const fromParams = event.pathParameters?.groupSlug
  const raw = fromQuery || fromPath || fromParams || ''
  return decodeURIComponent(raw.split('?')[0].split('/')[0]).trim()
}

function randomKey() {
  return Math.random().toString(36).slice(2, 12)
}

function withKeys(items) {
  if (!Array.isArray(items)) return []
  return items.map((item) => ({
    ...item,
    _key: item._key || randomKey()
  }))
}

function siteBaseUrl(event) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '')
  const host = event.headers.host || 'ritaops.com'
  const proto = event.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${host}`
}

function formatStayDates(checkIn, checkOut) {
  const a = checkIn || '—'
  const b = checkOut || '—'
  return `${a} — ${b}`
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatSubmittedAt(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Santo_Domingo'
    })
  } catch {
    return iso
  }
}

async function sendResendEmail({to, subject, html, text}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('guest.js: RESEND_API_KEY not set, skipping email')
    return false
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Las Canas <noreply@ritaops.com>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text
    })
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Resend error: ${errBody}`)
  }
  return true
}

async function sendGuestConfirmationEmail(event, portal, guest, submittedAt) {
  const base = siteBaseUrl(event)
  const guestFormUrl = `${base}/guest/${encodeURIComponent(portal.groupSlug)}`
  const groupName = portal.groupName || 'your group'
  const stayDates = formatStayDates(portal.checkIn, portal.checkOut)

  const text = `Hi ${guest.firstName},

Thank you for submitting your information for ${groupName}!

We have received your details and our team will be in touch closer to your arrival.

Your stay: ${stayDates}
Las Canas Beach Retreat

Need to make changes? Visit:
${guestFormUrl} → "Request edit link"

See you soon! 🌴
The Las Canas Team`

  const html = `
    <p>Hi ${escapeHtml(guest.firstName)},</p>
    <p>Thank you for submitting your information for <strong>${escapeHtml(groupName)}</strong>!</p>
    <p>We have received your details and our team will be in touch closer to your arrival.</p>
    <p><strong>Your stay:</strong> ${stayDates}<br>Las Canas Beach Retreat</p>
    <p>Need to make changes? Visit:<br>
    <a href="${guestFormUrl}">${guestFormUrl}</a> → &quot;Request edit link&quot;</p>
    <p>See you soon! 🌴<br>The Las Canas Team</p>
  `

  await sendResendEmail({
    to: guest.email,
    subject: 'Your Las Canas Beach Retreat submission received ✓',
    html,
    text
  })
}

async function sendStaffNotificationEmail(event, portal, guest, submittedAt) {
  const staffEmail = process.env.STAFF_EMAIL || 'alex@ritaops.com'
  const groupName = portal.groupName || 'Group'
  const stayDates = formatStayDates(portal.checkIn, portal.checkOut)
  const submittedLabel = formatSubmittedAt(submittedAt)

  const text = `New guest submission — ${groupName}

Guest: ${guest.firstName} ${guest.lastName}
Email: ${guest.email}
Phone: ${guest.phone}
Group: ${groupName} (${stayDates})
Submitted: ${submittedLabel}`

  const html = `
    <p><strong>New guest submission — ${escapeHtml(groupName)}</strong></p>
    <ul>
      <li><strong>Guest:</strong> ${escapeHtml(guest.firstName)} ${escapeHtml(guest.lastName)}</li>
      <li><strong>Email:</strong> ${escapeHtml(guest.email)}</li>
      <li><strong>Phone:</strong> ${escapeHtml(guest.phone)}</li>
      <li><strong>Group:</strong> ${escapeHtml(groupName)} (${escapeHtml(stayDates)})</li>
      <li><strong>Submitted:</strong> ${escapeHtml(submittedLabel)}</li>
    </ul>
  `

  await sendResendEmail({
    to: staffEmail,
    subject: `New guest submission — ${groupName}`,
    html,
    text
  })
}

async function sendSubmissionEmails(event, portal, guest, submittedAt) {
  try {
    await sendGuestConfirmationEmail(event, portal, guest, submittedAt)
    await sendStaffNotificationEmail(event, portal, guest, submittedAt)
  } catch (err) {
    console.error('guest.js: confirmation email failed:', err.message)
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors}
  }

  const groupSlug = readGroupSlug(event)

  if (event.httpMethod === 'GET') {
    if (!groupSlug) {
      return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'groupSlug required'})}
    }
    try {
      const group = await client.fetch(GROUP_QUERY, {groupSlug})
      if (!group) {
        return {statusCode: 404, headers: cors, body: JSON.stringify({error: 'Group not found'})}
      }
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          group: {
            groupName: group.groupName,
            checkIn: group.checkIn,
            checkOut: group.checkOut,
            groupSlug: group.groupSlug,
            property: 'Las Canas Beach Retreat'
          }
        })
      }
    } catch (err) {
      return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}')
      const slug = body.groupSlug || groupSlug
      if (!slug) {
        return {statusCode: 400, headers: cors, body: JSON.stringify({error: 'groupSlug required'})}
      }
      const firstName = String(body.firstName || '').trim()
      const lastName = String(body.lastName || '').trim()
      const email = String(body.email || '').trim()
      const phone = String(body.phone || '').trim()
      const guestName =
        [firstName, lastName].filter(Boolean).join(' ') ||
        String(body.guestName || '').trim()

      if (!firstName || !lastName || !email || !phone) {
        return {
          statusCode: 400,
          headers: cors,
          body: JSON.stringify({error: 'firstName, lastName, email, and phone are required'})
        }
      }

      const portal = await client.fetch(GROUP_QUERY, {groupSlug: slug})
      if (!portal) {
        return {statusCode: 404, headers: cors, body: JSON.stringify({error: 'Group not found'})}
      }

      const doc = {
        _type: 'guestSubmission',
        groupPortal: {_type: 'reference', _ref: portal._id},
        submittedAt: new Date().toISOString(),
        firstName,
        lastName,
        email,
        phone,
        guestName,
        adults: body.adults != null ? Number(body.adults) : undefined,
        children: body.children != null ? Number(body.children) : 0,
        flights: withKeys(body.flights),
        dietaryRestrictions: withKeys(body.dietaryRestrictions),
        activities: withKeys(body.activities),
        massageRequested: Boolean(body.massageRequested),
        specialRequests: body.specialRequests || undefined
      }

      const created = await client.create(doc)

      await sendSubmissionEmails(
        event,
        portal,
        {firstName, lastName, email, phone},
        doc.submittedAt
      )

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ok: true, id: created._id})
      }
    } catch (err) {
      return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
    }
  }

  return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}
}
