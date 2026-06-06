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

function isJwtShape(token) {
  if (!token || typeof token !== 'string') return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const b64url = /^[A-Za-z0-9_-]+$/
  return parts.every((part) => part.length > 0 && b64url.test(part))
}

function bearerJwtAuthorized(event, context) {
  if (identityFromContext(context)) return true
  const token = getBearerToken(event)
  return isJwtShape(token)
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
  if (bearerJwtAuthorized(event, context)) return true
  return staffKeyAuthorized(event, body)
}

function resolveStaffAuth(event, body, context) {
  const secret = dashboardSecret()
  if (!secret) {
    return {authorized: true, method: 'open'}
  }

  if (bearerJwtAuthorized(event, context)) {
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
  isJwtShape,
  bearerJwtAuthorized,
  staffKeyAuthorized,
  staffAuthorized,
  resolveStaffAuth
}
