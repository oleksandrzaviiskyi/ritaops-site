import { useEffect } from 'react'
import { actions } from '../hooks/useStore.js'
import { fmtDate, todayIso } from '../utils/api.js'

export default function BubblesLayer() {
  useEffect(() => {
    initBubbleEngine()
  }, [])

  return null
}

function initBubbleEngine() {
  const lfStyle = document.createElement('style')
  lfStyle.textContent = `
.lf-bubble{position:fixed;border-radius:50%;cursor:grab;z-index:8;touch-action:none;}
.lf-bubble:active{cursor:grabbing;}
.lf-ghost{position:fixed;border-radius:50%;pointer-events:none;z-index:7;opacity:.18;display:none;}
.lf-tt{position:fixed;background:rgba(255,253,247,.97);border:1px solid rgba(40,30,18,.13);border-radius:12px;padding:10px 13px;font-size:12px;line-height:1.5;max-width:200px;pointer-events:none;opacity:0;transition:opacity .15s;z-index:50;box-shadow:0 4px 18px rgba(40,30,18,.10);}
.lf-tt-type{font-size:10px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;margin-bottom:4px;}
.lf-tt-text{color:#3d3730;}
.lf-tt-dept{font-size:11px;color:#9a8c7c;margin-top:4px;}
.summon.lf-dragging{transition:none;}
`
  document.head.appendChild(lfStyle)

  const zones = []
  let animT = 0
  let bubbles = []
  let bubbleIdCounter = 0

  const ttEl = document.createElement('div')
  ttEl.className = 'lf-tt'
  document.body.appendChild(ttEl)
  let ttBubble = null

  const NP = 80

  function esc(s) {
    return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  }

  function getBubbleStage(data) {
    if (data.status === 'resolved') return 2
    if (data.openedAt) {
      const hours = (Date.now() - new Date(data.openedAt).getTime()) / 3600000
      if (hours > 4) return 1
    }
    return 0
  }

  function initParticles(b) {
    b.particles = []
    const R_f = b.size * 0.38
    const flowerCenters = [{ x: 0, y: 0 }]
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 - Math.PI / 2
      flowerCenters.push({ x: R_f * Math.cos(a), y: R_f * Math.sin(a) })
    }
    const ppp = Math.floor(NP / 7)
    const flowerPts = []
    for (const c of flowerCenters) {
      for (let j = 0; j < ppp; j++) {
        const a = j / ppp * Math.PI * 2
        flowerPts.push({ x: c.x + R_f * Math.cos(a), y: c.y + R_f * Math.sin(a) })
      }
    }
    while (flowerPts.length < NP) flowerPts.push({ x: 0, y: 0 })

    for (let i = 0; i < NP; i++) {
      const angle = Math.random() * Math.PI * 2
      const r = Math.random() * b.size * 0.9
      const sa = (i / NP) * Math.PI * 6
      const sr = b.size * 0.1 + (i / NP) * b.size * 0.7
      b.particles.push({
        px: Math.cos(angle) * r,
        py: Math.sin(angle) * r,
        vx: 0, vy: 0,
        chaosX: (Math.random() - 0.5) * b.size * 1.6,
        chaosY: (Math.random() - 0.5) * b.size * 1.6,
        spiralX: sr * Math.cos(sa),
        spiralY: sr * Math.sin(sa),
        flowerX: flowerPts[i].x,
        flowerY: flowerPts[i].y,
        size: 1.0 + Math.random() * 1.8,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.5
      })
    }
    b.stageProgress = 0
    b.resolveProgress = 0
  }

  function drawBubble(cv, b, t, dim) {
    if (!b.particles) return
    const half = b.size * 1.5
    const ctx = cv.getContext('2d')
    cv.width = b.size * 3
    cv.height = b.size * 3
    ctx.clearRect(0, 0, cv.width, cv.height)
    const STAGE_COLORS = [
      { r: 184, g: 60, b: 13 },
      { r: 160, g: 107, b: 10 },
      { r: 29, g: 158, b: 117 }
    ]
    // turnover bubble — purple
    const isTurnover = b.type === 'turnover'
    const col = isTurnover
      ? { r: 107, g: 63, b: 160 }
      : (STAGE_COLORS[b.stage] || STAGE_COLORS[0])
    b.stageProgress = Math.min(1, b.stageProgress + 0.006)
    const ease = b.stageProgress < 0.5
      ? 2 * b.stageProgress * b.stageProgress
      : 1 - Math.pow(-2 * b.stageProgress + 2, 2) / 2
    if (b.stage === 2 && b.stageProgress > 0.85) {
      b.resolveProgress = Math.min(1, b.resolveProgress + 0.004)
      if (b.resolveProgress >= 1) { b.shouldRemove = true; return }
    }
    const globalAlpha = dim ? 0.15 : (b.stage === 2 ? (1 - b.resolveProgress * 0.9) : 1)
    ctx.save()
    ctx.globalAlpha = globalAlpha
    if (b.stage === 2 && ease > 0.3) {
      const R_f = b.size * 0.38
      const centers = [{ x: 0, y: 0 }]
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 - Math.PI / 2
        centers.push({ x: R_f * Math.cos(a), y: R_f * Math.sin(a) })
      }
      ctx.strokeStyle = 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + (ease * 0.25) + ')'
      ctx.lineWidth = 0.6
      for (const c of centers) {
        ctx.beginPath()
        ctx.arc(half + c.x, half + c.y, R_f, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    for (const p of b.particles) {
      const br = 0.5 + 0.5 * Math.sin(t * p.speed + p.phase)
      let tx, ty
      if (b.stage === 0) {
        tx = p.chaosX + Math.sin(t * p.speed * 1.3 + p.phase) * (1 - ease) * b.size * 0.3
        ty = p.chaosY + Math.cos(t * p.speed + p.phase) * (1 - ease) * b.size * 0.3
      } else if (b.stage === 1) {
        tx = p.spiralX * ease + p.chaosX * (1 - ease)
        ty = p.spiralY * ease + p.chaosY * (1 - ease)
        tx += Math.sin(t * p.speed + p.phase) * (1 - ease) * b.size * 0.15
        ty += Math.cos(t * p.speed + p.phase) * (1 - ease) * b.size * 0.15
      } else {
        tx = p.flowerX * ease + p.spiralX * (1 - ease)
        ty = p.flowerY * ease + p.spiralY * (1 - ease)
      }
      p.vx += (tx - p.px) * 0.07
      p.vy += (ty - p.py) * 0.07
      p.vx *= 0.82
      p.vy *= 0.82
      p.px += p.vx
      p.py += p.vy
      const alpha = dim ? 0.12 : (b.stage === 2 ? 0.2 + 0.7 * ease + 0.1 * br : 0.3 + 0.3 * br)
      const size = p.size * (b.stage === 2 ? (0.7 + 0.5 * ease) : 1)
      ctx.beginPath()
      ctx.arc(half + p.px, half + p.py, size, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + alpha + ')'
      ctx.fill()
    }
    ctx.restore()
  }

  function updateZones() {
    const bubbleZones = zones.filter(z => z.id && String(z.id).startsWith('bubble-'))
    zones.length = 0
    bubbleZones.forEach(z => zones.push(z))
    document.querySelectorAll('.card').forEach(card => {
      if (card.style.display === 'none') return
      const rect = card.getBoundingClientRect()
      if (!rect.width) return
      zones.push({
        id: card.dataset.key,
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        r: Math.max(rect.width, rect.height) * 0.55
      })
    })
    if (document.body.getAttribute('data-panel') === 'open') {
      const panel = document.getElementById('ritaPanel')
      if (panel) {
        const rect = panel.getBoundingClientRect()
        zones.push({
          id: 'rita-panel',
          cx: rect.left + rect.width / 2,
          cy: rect.top + rect.height / 2,
          r: Math.max(rect.width, rect.height) * 0.45
        })
      }
    }
  }

  function showTT(b, x, y) {
    const LABELS = {
      concern: 'Разрыв',
      'concern-new': 'Новая задача',
      question: 'Рита наблюдает',
      event: 'Заезд',
      turnover: 'Смена групп'
    }
    const COLORS = {
      concern: '#b83c0d',
      'concern-new': '#a06b0a',
      question: '#d98a2b',
      event: '#3a7a55',
      turnover: '#6b3fa0'
    }
    const drawType = b.bubbleType || b.type
    const c = COLORS[drawType] || '#d98a2b'
    ttEl.innerHTML =
      '<div class="lf-tt-type" style="color:' + c + '">' + esc(LABELS[drawType] || '') + '</div>' +
      '<div class="lf-tt-text">' + esc(b.text) + '</div>' +
      '<div class="lf-tt-dept">' + esc(b.dept || '') + '</div>'
    ttEl.style.opacity = '1'
    posTT(x, y)
    ttBubble = b
  }

  function hideTT() { ttEl.style.opacity = '0'; ttBubble = null }

  function posTT(x, y) {
    const vw = window.innerWidth
    let lx = x + 14, ly = y + 14
    if (lx + 210 > vw) lx = x - 220
    if (ly + 90 > window.innerHeight - 20) ly = y - 100
    ttEl.style.left = lx + 'px'
    ttEl.style.top = ly + 'px'
  }

  function restoreBubble(b) {
    b.open = false
    b.ghost.style.display = 'none'
    b.el.style.visibility = 'visible'
    b.vx = 0
    b.vy = 0
    const zi = zones.findIndex(z => z.id === b.id)
    if (zi > -1) zones.splice(zi, 1)
  }

  function hookCardClose(b, cardKey) {
    setTimeout(() => {
      const card = document.getElementById('card-' + cardKey)
      if (!card) return
      const rect = card.getBoundingClientRect()
      const zi = zones.findIndex(z => z.id === b.id)
      const zone = {
        id: b.id,
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        r: Math.max(rect.width, rect.height) * 0.72
      }
      if (zi > -1) zones[zi] = zone
      else zones.push(zone)
      card.querySelectorAll('[data-act="close"], [data-act="min"], .resolve').forEach(btn => {
        btn.addEventListener('click', () => restoreBubble(b), { once: true })
      })
    }, 100)
  }

  window.lfRestoreBubble = cardKey => {
    bubbles.forEach(b => { if (b.open && b._openedCardKey === cardKey) restoreBubble(b) })
  }

  window.lfSetBubbleResolved = cardKey => {
    bubbles.forEach(b => {
      if (b._openedCardKey === cardKey || b.cardKey === cardKey) {
        b.stage = 2; b.stageProgress = 0
      }
    })
  }

  window.lfRestoreAllBubbles = () => {
    bubbles.forEach(b => { if (b.open) restoreBubble(b) })
  }

  function clearBubbles() {
    bubbles.forEach(b => {
      b.el?.parentNode?.removeChild(b.el)
      b.ghost?.parentNode?.removeChild(b.ghost)
    })
    bubbles = []
  }

  function nextBubblePos(index) {
    const col = index % 4, row = Math.floor(index / 4)
    return {
      ax: 0.14 + col * 0.16 + Math.random() * 0.04,
      ay: 0.18 + row * 0.14 + Math.random() * 0.04
    }
  }

  function buildBubbleDataFromLive(cache) {
    if (!cache) return null
    const items = []
    let idx = 0

    // Смена групп — фиолетовый пузырь
    ;(cache.groupTurnovers || []).forEach(t => {
      const pos = nextBubblePos(idx++)
      items.push({
        type: 'turnover',
        size: 58,
        text: 'Смена групп ' + fmtDate(t.date) + ' — нужен доп. персонал для уборки. Позвони Мириан.',
        dept: 'Выезд: ' + t.checkingOut.join(', ') + ' · Заезд: ' + t.checkingIn.join(', '),
        cardKey: 'arrivals',
        sourceId: 'turnover-' + t.date,
        status: 'open',
        openedAt: null,
        stage: 1,
        ax: pos.ax,
        ay: pos.ay
      })
    })

    ;(cache.openQuestions || []).slice(0, 5).forEach(q => {
      const pos = nextBubblePos(idx++)
      const qData = {
        type: 'question', size: Math.max(54, 46 + Math.min(24, String(q.question || '').length * 0.4)),
        text: q.question || 'Open question', dept: 'Рита наблюдает', cardKey: 'risks',
        sourceId: q._id, status: 'open', openedAt: q.openedAt || null, ax: pos.ax, ay: pos.ay
      }
      qData.stage = getBubbleStage(qData)
      items.push(qData)
    })

    ;(cache.openConcerns || []).slice(0, 6).forEach(c => {
      const hours = c.openedAt ? (Date.now() - new Date(c.openedAt).getTime()) / 3600000 : 0
      const bubbleType = hours >= 6 ? 'concern' : 'concern-new'
      const place = c.place?.name || c.place?.unitCode || 'Place'
      const pos = nextBubblePos(idx++)
      const isGroupInfo = /EF|368297|371|grup|group|pax|habitaci/i.test(c.summary || '')
      if (isGroupInfo) return
      const isUnit = /bar/i.test(place) || /bar/i.test(c.summary || '')
      const cData = {
        type: bubbleType === 'concern-new' ? 'concern-new' : 'concern',
        bubbleType, urgent: hours >= 6, size: hours >= 6 ? 64 : 54,
        text: place + ': ' + (c.summary || 'open issue'),
        dept: (hours >= 6 ? 'Maintenance · ' : 'New · ') + Math.max(1, Math.round(hours)) + 'ч',
        cardKey: isUnit ? 'bar' : 'risks', sourceId: c._id, status: c.status || 'open',
        openedAt: c.openedAt || null, ax: pos.ax, ay: pos.ay
      }
      cData.stage = getBubbleStage(cData)
      items.push(cData)
    })

    const today = todayIso()
    ;(cache.portals || []).filter(p => {
      if (!p.checkIn || p.status === 'cancelled') return false
      const d = (new Date(p.checkIn) - new Date(today)) / 86400000
      return d >= 0 && d <= 3
    }).slice(0, 6).forEach(p => {
      const pos = nextBubblePos(idx++)
      items.push({
        type: 'event', size: 48,
        text: (p.groupName || p.title || 'Group') + ' (' + (p.totalGuests || '?') + ' guests) · ' + fmtDate(p.checkIn),
        dept: 'Groups', cardKey: 'arrivals-' + (p._id || p.groupId || p.groupName), sourceId: p._id, status: 'open',
        openedAt: null, stage: 0, ax: pos.ax, ay: pos.ay
      })
    })

    return items.length ? items : null
  }

  function spawnBubble(data) {
    const vw = window.innerWidth, vh = window.innerHeight
    const canvasSize = data.size * 3
    const el = document.createElement('div')
    el.className = 'lf-bubble'
    el.style.width = canvasSize + 'px'
    el.style.height = canvasSize + 'px'
    const cv = document.createElement('canvas')
    cv.width = canvasSize; cv.height = canvasSize
    el.appendChild(cv)
    const ghost = document.createElement('div')
    ghost.className = 'lf-ghost'
    ghost.style.width = canvasSize + 'px'
    ghost.style.height = canvasSize + 'px'
    const gcv = document.createElement('canvas')
    ghost.appendChild(gcv)
    document.body.appendChild(ghost)
    document.body.appendChild(el)
    const px = (data.ax || 0.2) * vw
    const py = (data.ay || 0.3) * vh
    const half = data.size * 1.5
    const b = Object.assign({}, data, {
      id: 'bubble-' + (++bubbleIdCounter), el, cv, gcv, ghost,
      px, py, homeX: px, homeY: py, vx: 0, vy: 0,
      phase: Math.random() * Math.PI * 2, speed: 0.4 + Math.random() * 0.3,
      bSpeed: 1 + Math.random(), amp: 4 + Math.random() * 6,
      stage: data.stage !== undefined ? data.stage : getBubbleStage(data),
      open: false, isDragging: false, didMove: false, shouldRemove: false
    })
    initParticles(b)
    let dragOx = 0, dragOy = 0
    el.addEventListener('mousedown', e => {
      if (b.open) return
      b.isDragging = true; b.didMove = false
      dragOx = e.clientX - b.px; dragOy = e.clientY - b.py
      b.vx = 0; b.vy = 0; hideTT(); e.preventDefault()
    })
    el.addEventListener('mouseenter', e => { if (!b.open && !b.isDragging) showTT(b, e.clientX, e.clientY) })
    el.addEventListener('mousemove', e => { if (ttBubble === b && !b.isDragging) posTT(e.clientX, e.clientY) })
    el.addEventListener('mouseleave', hideTT)
    el.addEventListener('click', () => {
      if (b.didMove || b.open) return
      b.open = true
      b.stage = Math.max(b.stage, 1)
      b.stageProgress = 0
      drawBubble(b.gcv, b, animT, true)
      b.ghost.style.left = (b.px - half) + 'px'
      b.ghost.style.top = (b.py - half) + 'px'
      b.ghost.style.display = 'block'
      b.el.style.visibility = 'hidden'
      hideTT()
      const cardKey = b.cardKey || b.type
      b._openedCardKey = cardKey
      if (document.body.getAttribute('data-panel') === 'open') {
        window.__ritaActions?.closePanel()
      }
      window.__ritaActions?.wakeCard(cardKey, b.text)
      setTimeout(() => {
        const ca = document.getElementById('cardsArea')
        if (ca) ca.scrollTop = 0
      }, 50)
      zones.push({ id: b.id, cx: vw / 2, cy: vh / 2, r: 180 })
      hookCardClose(b, cardKey)
    })
    document.addEventListener('mousemove', e => {
      if (!b.isDragging) return
      b.didMove = true
      b.px = e.clientX - dragOx; b.py = e.clientY - dragOy
      b.homeX = b.px; b.homeY = b.py
      const mg = half + 4, vw2 = window.innerWidth, vh2 = window.innerHeight
      b.px = Math.max(mg, Math.min(b.px, vw2 - mg))
      b.py = Math.max(mg, Math.min(b.py, vh2 - mg - 40))
    })
    document.addEventListener('mouseup', () => { if (b.isDragging) b.isDragging = false })
    el.style.left = (px - half) + 'px'
    el.style.top = (py - half) + 'px'
    bubbles.push(b)
    return b
  }

  function initBubbles(dataList) {
    clearBubbles()
    dataList.forEach(d => spawnBubble(d))
  }

  window.lfRefreshBubblesFromLive = () => {
    const live = buildBubbleDataFromLive(window.__pulseCache)
    if (live?.length > 0) initBubbles(live)
  }

  function tick() {
    animT += 0.011
    updateZones()
    const vw = window.innerWidth, vh = window.innerHeight
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]
      const half = b.size * 1.5, mg = half + 4
      if (b.shouldRemove) { b.el.remove(); b.ghost?.remove(); bubbles.splice(i, 1); continue }
      if (b.open) { drawBubble(b.gcv, b, animT, true); continue }
      if (b.isDragging) {
        b.el.style.left = (b.px - half) + 'px'; b.el.style.top = (b.py - half) + 'px'
        drawBubble(b.cv, b, animT, false); continue
      }
      const fdx = Math.cos(animT * b.speed * 0.55 + b.phase) * b.amp * 0.3
      const fdy = Math.sin(animT * b.speed + b.phase) * b.amp
      let fx = 0, fy = 0
      zones.forEach(z => {
        const ddx = b.px - z.cx, ddy = b.py - z.cy
        const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1
        const repR = z.r + half + 16
        if (dist < repR) { const ov = repR - dist; fx += (ddx / dist) * ov * 1.4; fy += (ddy / dist) * ov * 1.4 }
      })
      const dhx = b.homeX - b.px, dhy = b.homeY - b.py
      if (Math.sqrt(dhx * dhx + dhy * dhy) > 2) { fx += dhx * 0.04; fy += dhy * 0.04 }
      b.vx = (b.vx + fx) * 0.78; b.vy = (b.vy + fy) * 0.78
      b.px += b.vx; b.py += b.vy
      b.px = Math.max(mg, Math.min(b.px, vw - mg))
      b.py = Math.max(mg, Math.min(b.py, vh - mg - 40))
      b.el.style.left = (b.px + fdx - half) + 'px'
      b.el.style.top = (b.py + fdy - half) + 'px'
      drawBubble(b.cv, b, animT, false)
    }
    requestAnimationFrame(tick)
  }

  initBubbles([])
  requestAnimationFrame(tick)

  import('../utils/api.js').then(({ apiGet }) => {
    apiGet('/api/ops-pulse').then(data => {
      window.__pulseCache = data
      window.__ritaActions?.setPulseCache(data)
      window.lfRefreshBubblesFromLive()
    }).catch(() => {})
  })
}
