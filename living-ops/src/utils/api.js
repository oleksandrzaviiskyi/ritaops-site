export const STAFF_KEY = 'rita2026'
export const AUTH_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + STAFF_KEY
}

function apiUrl(path) {
  const sep = path.includes('?') ? '&' : '?'
  return path + sep + 'key=' + encodeURIComponent(STAFF_KEY)
}

export async function apiGet(path) {
  const res = await fetch(apiUrl(path), { headers: AUTH_HEADERS })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (json.error || json.message || res.statusText || 'Request failed'))
  return json
}

export async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ ...body, staffKey: STAFF_KEY })
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (json.error || json.message || res.statusText || 'Request failed'))
  return json
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
}

export function tag(cls, text) {
  return { __tag: true, cls, text }
}

export function isTag(v) {
  return v && typeof v === 'object' && v.__tag
}

export function formatBalance(status) {
  if (!status) return '—'
  return String(status).split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

export function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}
