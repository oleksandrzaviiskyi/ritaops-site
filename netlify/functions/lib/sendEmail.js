/**
 * Тонкая обёртка над Resend API для транзакционных писем RitaOps.
 * RESEND_API_KEY уже был заведён в Netlify env, но ни разу не
 * использовался в коде — этот файл закрывает тот пробел.
 *
 * Домен отправителя должен быть верифицирован в Resend
 * (resend.com/domains) для ritaops.com, иначе письма будут либо
 * отклонены, либо попадать в спам у получателя.
 */

const RESEND_API_URL = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'RitaOps <noreply@ritaops.com>'

/**
 * @param {Object} params
 * @param {string} params.to
 * @param {string} params.subject
 * @param {string} params.html
 * @param {string} [params.from]
 * @returns {Promise<{ok: boolean, id?: string, error?: string}>}
 */
async function sendEmail({to, subject, html, from = DEFAULT_FROM}) {
  const apiKey = (process.env.RESEND_API_KEY || '').trim()
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not configured, skipping send to', to)
    return {ok: false, error: 'RESEND_API_KEY not configured'}
  }
  if (!to) {
    return {ok: false, error: 'recipient email missing'}
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({from, to, subject, html})
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[email] Resend error', res.status, json)
      return {ok: false, error: json.message || `Resend HTTP ${res.status}`}
    }
    return {ok: true, id: json.id}
  } catch (err) {
    console.error('[email] send failed', err.message)
    return {ok: false, error: err.message}
  }
}

function organizerWelcomeHtml({groupName, ritaRef, checkIn, checkOut, organizerLink, guestLink, organizerName}) {
  const greeting = organizerName ? `Hi ${escapeHtml(organizerName)},` : 'Hi,'
  const dates = checkIn && checkOut ? `${escapeHtml(checkIn)} → ${escapeHtml(checkOut)}` : 'Dates to be confirmed'
  return `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#2d2a26">
      <p style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#9a8c7c;margin:0 0 8px">
        Las Canas Beach Retreat
      </p>
      <h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(groupName)}</h1>
      <p style="margin:0 0 16px">${greeting} thank you for starting your group request with us.</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px">
        <tr><td style="padding:6px 0;color:#9a8c7c;font-size:13px">Booking reference</td><td style="padding:6px 0;font-weight:600">${escapeHtml(ritaRef)}</td></tr>
        <tr><td style="padding:6px 0;color:#9a8c7c;font-size:13px">Dates</td><td style="padding:6px 0">${dates}</td></tr>
      </table>
      <p style="margin:0 0 12px">Use the link below to fill in flights, menu, and activities for your group:</p>
      <p style="margin:0 0 24px">
        <a href="${escapeHtml(organizerLink)}" style="display:inline-block;background:#1d3a3a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">
          Open your group portal
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#9a8c7c">Share this with your guests so they can submit their own flight/dietary details:</p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${escapeHtml(guestLink)}" style="color:#1d3a3a">${escapeHtml(guestLink)}</a></p>
      <p style="margin:0;font-size:13px;color:#9a8c7c">— Las Canas Beach Retreat</p>
    </div>
  `
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

module.exports = {sendEmail, organizerWelcomeHtml}
