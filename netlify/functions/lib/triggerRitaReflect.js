async function triggerRitaReflect() {
  const baseUrl = (process.env.URL || '').replace(/\/$/, '')
  const dashboardSecret = (process.env.DASHBOARD_SECRET || '').trim()
  if (!baseUrl || !dashboardSecret) {
    console.warn('[ritaops] reflect trigger skipped — URL or DASHBOARD_SECRET missing')
    return false
  }

  try {
    const res = await fetch(`${baseUrl}/api/rita-reflect`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({staffKey: dashboardSecret})
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      console.warn('[ritaops] reflect trigger failed', json.error || res.statusText)
      return false
    }
    return true
  } catch (err) {
    console.warn('[ritaops] reflect trigger error', err.message)
    return false
  }
}

module.exports = {triggerRitaReflect}
