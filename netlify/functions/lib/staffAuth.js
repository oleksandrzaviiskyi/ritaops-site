/** Staff key check against DASHBOARD_SECRET (Netlify env). */

function dashboardSecret() {
  return (process.env.DASHBOARD_SECRET || '').trim()
}

function normalizeStaffKey(key) {
  return (key || '').trim()
}

function extractStaffKey(event, body) {
  const query = event.queryStringParameters || {}
  return normalizeStaffKey(body?.staffKey || query.staffKey || query.key)
}

function getBearerToken(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

function identityFromContext(context) {
  return Boolean(context?.clientContext?.user)
}

async function verifyIdentityToken(event, context) {
  if (identityFromContext(context)) return true

  const token = getBearerToken(event)
  if (!token) return false

  const host = event.headers?.host || event.headers?.Host
  if (!host) return false
  const proto = event.headers?.['x-forwarded-proto'] || 'https'

  try {
    const res = await fetch(`${proto}://${host}/.netlify/identity/user`, {
      headers: {Authorization: `Bearer ${token}`}
    })
    console.log('[ritaops] identity verify', {ok: res.ok, status: res.status, host})
    return res.ok
  } catch (err) {
    console.log('[ritaops] identity verify failed', err.message)
    return false
  }
}

function staffKeyAuthorized(event, body) {
  const secret = dashboardSecret()
  if (!secret) return true
  const key = extractStaffKey(event, body)
  return key === secret
}

function staffAuthorized(event, body, context) {
  const secret = dashboardSecret()
  if (!secret) return true
  if (identityFromContext(context)) return true
  return staffKeyAuthorized(event, body)
}

async function resolveStaffAuth(event, body, context) {
  const secret = dashboardSecret()
  if (!secret) {
    return {authorized: true, method: 'open'}
  }

  if (await verifyIdentityToken(event, context)) {
    return {authorized: true, method: 'identity'}
  }

  if (staffKeyAuthorized(event, body)) {
    return {authorized: true, method: 'staffKey'}
  }

  return {authorized: false, method: null}
}

module.exports = {
  dashboardSecret,
  normalizeStaffKey,
  extractStaffKey,
  getBearerToken,
  identityFromContext,
  verifyIdentityToken,
  staffKeyAuthorized,
  staffAuthorized,
  resolveStaffAuth
}
