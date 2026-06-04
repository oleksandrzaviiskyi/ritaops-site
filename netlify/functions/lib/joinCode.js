/** Воспроизводимый короткий код: btoa(slug:token).slice(0, 12) — как в браузере. */

function portalJoinCode(slug, token) {
  if (!slug || !token) return ''
  return Buffer.from(`${slug}:${token}`, 'utf8').toString('base64').slice(0, 12)
}

module.exports = {portalJoinCode}
