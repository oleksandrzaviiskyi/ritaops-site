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

function identityAuthorized(context) {
  return Boolean(context?.clientContext?.user)
}

function staffAuthorized(event, body, context) {
  const secret = dashboardSecret()
  if (!secret) return true
  if (identityAuthorized(context)) return true
  const key = extractStaffKey(event, body)
  const ok = key === secret
  if (!ok) {
    console.log('[ritaops] staff auth failed', {
      hasKey: Boolean(key),
      keyLength: key.length,
      secretSet: true,
      secretLength: secret.length,
      identityUser: Boolean(context?.clientContext?.user)
    })
  }
  return ok
}

module.exports = {
  dashboardSecret,
  normalizeStaffKey,
  extractStaffKey,
  identityAuthorized,
  staffAuthorized
}
