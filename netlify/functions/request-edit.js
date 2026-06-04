const crypto = require('node:crypto')
const {createClient} = require('@sanity/client')

const client = createClient({
  projectId: '0po0panc',
  dataset: 'production',
  apiVersion: '2025-05-20',
  token: process.env.SANITY_API_READ_TOKEN,
  useCdn: false
})

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
}

const GENERIC_OK = {
  message:
    'If we found a submission for this email, we sent an edit link. The link is valid for 48 hours.'
}

function siteBaseUrl(event) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '')
  const host = event.headers.host || 'ritaops.com'
  const proto = event.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${host}`
}

async function sendEditEmail(to, editUrl) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured')
  }

  const html = `
    <p>Hello,</p>
    <p>Click here to edit your submission:</p>
    <p><a href="${editUrl}">${editUrl}</a></p>
    <p>This link is valid for 48 hours.</p>
    <p>Las Canas Beach Retreat · RitaOps</p>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Las Canas <noreply@ritaops.com>',
      to: [to],
      subject: 'Edit your Las Canas group submission',
      html,
      text: `Click here to edit your submission: ${editUrl}\n\nThis link is valid for 48 hours.`
    })
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Resend error: ${errBody}`)
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors}
  }

  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, headers: cors, body: JSON.stringify({error: 'Method not allowed'})}
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const email = String(body.email || '')
      .trim()
      .toLowerCase()
    const groupSlug = String(body.groupSlug || '').trim()

    if (!email || !groupSlug) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({error: 'email and groupSlug required'})
      }
    }

    const submission = await client.fetch(
      `*[_type == "guestSubmission" && lower(email) == $email && groupPortal->portalSlug.current == $slug][0]{
        _id, email
      }`,
      {email, slug: groupSlug}
    )

    if (submission?._id) {
      const editToken = crypto.randomBytes(32).toString('hex')
      const expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

      await client
        .patch(submission._id)
        .set({editToken, editTokenExpiresAt: expires})
        .commit()

      const editUrl = `${siteBaseUrl(event)}/edit/${editToken}`
      await sendEditEmail(submission.email || email, editUrl)
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ok: true, ...GENERIC_OK})
    }
  } catch (err) {
    console.error('request-edit:', err)
    return {statusCode: 500, headers: cors, body: JSON.stringify({error: err.message})}
  }
}
