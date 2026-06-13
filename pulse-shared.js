/** Shared live Pulse data — used by /pulse (canonical). */

const PULSE_POLL_MS = 25000
let pulsePollTimer = null

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatBalanceStatus(status) {
  if (!status) return '—'
  return String(status)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function staffKey() {
  const fromUrl = new URLSearchParams(location.search).get('key')
  if (fromUrl) {
    sessionStorage.setItem('ritaops_staff_key', fromUrl)
    return fromUrl
  }
  return sessionStorage.getItem('ritaops_staff_key') || ''
}

function staffAuthHeaders() {
  const user = window.netlifyIdentity?.currentUser?.()
  if (user?.token?.access_token) {
    return {Authorization: `Bearer ${user.token.access_token}`}
  }
  return {}
}

async function staffFetch(url, options = {}) {
  const headers = {...staffAuthHeaders(), ...(options.headers || {})}
  const opts = {...options, headers}
  if (!headers.Authorization) {
    const key = staffKey()
    if (key) {
      if (!options.method || options.method === 'GET') {
        const u = new URL(url, location.origin)
        if (!u.searchParams.has('key')) u.searchParams.set('key', key)
        url = `${u.pathname}${u.search}`
      } else if (options.body) {
        const body = JSON.parse(options.body)
        if (!body.staffKey) body.staffKey = key
        opts.body = JSON.stringify(body)
      }
    }
  }
  return fetch(url, opts)
}

function formatHeaderDate(d = new Date()) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ]
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function formatPulseTitleDate(d = new Date()) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  return `Today, ${months[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`
}

function formatDeptList(deptDetails) {
  const seen = new Set()
  const list = []
  for (const dept of Array.isArray(deptDetails) ? deptDetails : []) {
    if (!dept) continue
    const key = dept.code || dept.titleEn || dept.title
    if (!key || seen.has(key)) continue
    seen.add(key)
    list.push(dept.titleEn || dept.title || dept.code)
  }
  return list.join(', ')
}

function formatPlaceLabel(place) {
  if (!place) return 'Place not set'
  const name = String(place.name || '').trim()
  const unitCode = String(place.unitCode || '').trim()
  if (name) {
    if (unitCode && name !== unitCode && !name.includes(unitCode)) {
      return `${name} · ${unitCode}`
    }
    return name
  }
  return unitCode || 'Place'
}

function formatOpenDuration(openedAt) {
  if (!openedAt) return ''
  const opened = new Date(openedAt)
  if (Number.isNaN(opened.getTime())) return ''
  const hours = (Date.now() - opened.getTime()) / (1000 * 60 * 60)
  if (hours < 1) return 'under 1h'
  if (hours < 24) return `${Math.round(hours)}h`
  const days = Math.round(hours / 24)
  return `${days}d`
}

function concernOpenHours(openedAt) {
  if (!openedAt) return 0
  const opened = new Date(openedAt)
  if (Number.isNaN(opened.getTime())) return 0
  return (Date.now() - opened.getTime()) / (1000 * 60 * 60)
}

function renderConcernLine(concern) {
  const place = formatPlaceLabel(concern.relatedPlace)
  const duration = formatOpenDuration(concern.openedAt)
  const depts = formatDeptList(concern.deptDetails || concern.depts)
  const parts = [escapeHtml(place), 'in progress']
  if (duration) parts.push(escapeHtml(duration))
  if (depts) parts.push(escapeHtml(depts))
  return `<div class="live-field-line">${parts.join(' · ')}</div>`
}

function renderPulseRegisters(concerns) {
  const needsYou = concerns.filter((c) => concernOpenHours(c.openedAt) > 12)
  const fieldHtml = concerns.length
    ? concerns.map(renderConcernLine).join('')
    : '<p class="live-field-empty">All places are in order.</p>'
  const needsHtml = needsYou.length
    ? needsYou.map(renderConcernLine).join('')
    : '<p class="live-field-empty">Nothing needs you.</p>'

  return {fieldHtml, needsHtml, concernCount: concerns.length}
}

function applyPulseLiveData(data, targets = {}) {
  const pulse = data?.pulse || {}
  const concerns = Array.isArray(data?.concerns) ? data.concerns : []
  const statement =
    pulse.coherenceStatement?.trim() ||
    'The space is in balance — a detailed summary will appear after the next load sync.'
  const balance = formatBalanceStatus(pulse.balanceStatus)
  const {fieldHtml, needsHtml, concernCount} = renderPulseRegisters(concerns)

  if (targets.pageMeta) {
    targets.pageMeta.textContent = `${formatHeaderDate()} · Las Canas Beach Retreat`
  }
  if (targets.pulseTitle) {
    targets.pulseTitle.textContent = formatPulseTitleDate()
  }
  if (targets.pulseStatement) {
    targets.pulseStatement.textContent = statement
  }
  if (targets.pulseBalance) {
    targets.pulseBalance.textContent = balance
  }
  if (targets.pulseField) {
    targets.pulseField.innerHTML = fieldHtml
  }
  if (targets.pulseNeedsYou) {
    targets.pulseNeedsYou.innerHTML = needsHtml
  }

  return {concernCount, balance, statement}
}

async function fetchOpsPulse() {
  const cacheBust = `_=${Date.now()}`
  const res = await staffFetch(`/api/ops-pulse?${cacheBust}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || res.statusText)
  return json
}

function stopPulsePolling() {
  if (pulsePollTimer) {
    clearInterval(pulsePollTimer)
    pulsePollTimer = null
  }
}

function startPulsePolling(onTick) {
  stopPulsePolling()
  pulsePollTimer = setInterval(onTick, PULSE_POLL_MS)
}

window.RitaPulse = {
  PULSE_POLL_MS,
  escapeHtml,
  formatBalanceStatus,
  staffKey,
  staffFetch,
  formatHeaderDate,
  formatPulseTitleDate,
  formatPlaceLabel,
  formatDeptList,
  formatOpenDuration,
  concernOpenHours,
  renderConcernLine,
  renderPulseRegisters,
  applyPulseLiveData,
  fetchOpsPulse,
  startPulsePolling,
  stopPulsePolling
}
