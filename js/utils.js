'use strict'

const STAFF_KEY = 'rita2026'
const AUTH_HEADERS = {'Content-Type': 'application/json', Authorization: 'Bearer ' + STAFF_KEY}
const R = 'Рите'

'use strict'

  const STAFF_KEY = 'rita2026'
  const AUTH_HEADERS = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + STAFF_KEY
  }
  const R = 'Рите'
  const QUESTIONS_POLL_MS = 60000

  // Load chat history from localStorage
  let chatHistory = []
  try {
    const saved = localStorage.getItem('rita_chat_history_v2')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        // filter out empty messages
        chatHistory = parsed
          .filter(function(m) { return m && m.content && String(m.content).trim().length > 0 })
          .slice(-30)
      }
    }
  } catch(e) {}

  function saveChatHistory() {
    try { localStorage.setItem('rita_chat_history_v2', JSON.stringify(chatHistory.slice(-30))) } catch(e) {}
  }
  let questionsTimer = null
  let pulseCache = null
  let portalsCache = null

  const field = document.getElementById('field')
  const tray = document.getElementById('tray')
  const fieldTop = {style: {display: ''}}

  const chatArea = document.getElementById('chatArea')
  const shown = []

  function esc(s) {
    return String(s ?? '').replace(/[&<>]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]))
  }

  function tag(cls, text) {
    return '<span class="tag ' + cls + '">' + esc(text) + '</span>'
  }

  function isTag(s) {
    return typeof s === 'string' && s.indexOf('class="tag') > -1
  }

  function formatBalance(status) {
    if (!status) return '—'
    return String(status)
      .split('-')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ')
  }

  function fmtDate(iso) {
    if (!iso) return '—'
    const d = new Date(iso + 'T12:00:00')
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'})
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10)
  }

  function apiUrl(path) {
    const sep = path.includes('?') ? '&' : '?'
    return path + sep + 'key=' + encodeURIComponent(STAFF_KEY)
  }

  async function apiGet(path) {
    const res = await fetch(apiUrl(path), {headers: AUTH_HEADERS})
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (json.error || json.message || res.statusText || 'Request failed'))
    return json
  }

  async function apiPost(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({...body, staffKey: STAFF_KEY})
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (json.error || json.message || res.statusText || 'Request failed'))
    return json
  }