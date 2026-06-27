import { useEffect, useRef } from 'react'
import { useStore, actions } from '../hooks/useStore.js'
import { apiGet, fmtDate, todayIso } from '../utils/api.js'

const NP = 80 // particles per bubble

const STAGE_LABELS = {
  concern: 'Разрыв',
  'concern-new': 'Новая задача',
  question: 'Рита наблюдает',
  event: 'Заезд',
  turnover: 'Смена групп',
  shortage: 'Дефицит склада'
}

const STAGE_TT_COLORS = {
  concern: '#b83c0d',
  'concern-new': '#a06b0a',
  question: '#d98a2b',
  event: '#3a7a55',
  turnover: '#6b3fa0',
  shortage: '#8a5a2b'
}

const STAGE_COLORS = [
  { r: 184, g: 60, b: 13 },
  { r: 160, g: 107, b: 10 },
  { r: 29, g: 158, b: 117 }
]
const TURNOVER_COLOR = { r: 107, g: 63, b: 160 }

function getBubbleStage(data) {
  if (data.status === 'resolved') return 2
  if (data.openedAt) {
    const hours = (Date.now() - new Date(data.openedAt).getTime()) / 3600000
    if (hours > 4) return 1
  }
  return 0
}

function nextBubblePos(index) {
  const col = index % 4, row = Math.floor(index / 4)
  return {
    ax: 0.14 + col * 0.16 + Math.random() * 0.04,
    ay: 0.18 + row * 0.14 + Math.random() * 0.04
  }
}

// Pure: Sanity live cache -> list of bubble definitions. Each gets a stable `id`
// derived from its source so re-renders don't respawn bubbles that are already open.
function buildBubbleDataFromLive(cache) {
  if (!cache) return []
  const items = []
  let idx = 0

  ;(cache.groupTurnovers || []).forEach(t => {
    const pos = nextBubblePos(idx++)
    items.push({
      id: 'turnover-' + t.date,
      type: 'turnover',
      size: 58,
      text: 'Смена групп ' + fmtDate(t.date) + ' — нужен доп. персонал для уборки. Позвони Мириан.',
      dept: 'Выезд: ' + t.checkingOut.join(', ') + ' · Заезд: ' + t.checkingIn.join(', '),
      cardKey: 'arrivals',
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
      id: 'question-' + q._id,
      type: 'question',
      size: Math.max(54, 46 + Math.min(24, String(q.question || '').length * 0.4)),
      text: q.question || 'Open question',
      dept: 'Рита наблюдает',
      cardKey: 'risks',
      status: 'open',
      openedAt: q.openedAt || null,
      ax: pos.ax,
      ay: pos.ay
    }
    qData.stage = getBubbleStage(qData)
    items.push(qData)
  })

  ;(cache.openConcerns || []).slice(0, 6).forEach(c => {
    const hours = c.openedAt ? (Date.now() - new Date(c.openedAt).getTime()) / 3600000 : 0
    const isGroupInfo = /\bEF\s?\d{3,}\b|\b368297\b|\b371\b|\bgrupo?s?\b|\bgroups?\b|\bpax\b|habitaci/i.test(c.summary || '')
    if (isGroupInfo) return
    const place = c.place?.name || c.place?.unitCode || 'Place'
    const pos = nextBubblePos(idx++)
    const isUnit = /bar/i.test(place) || /bar/i.test(c.summary || '')
    const cData = {
      id: 'concern-' + c._id,
      type: hours >= 6 ? 'concern' : 'concern-new',
      bubbleType: hours >= 6 ? 'concern' : 'concern-new',
      urgent: hours >= 6,
      size: hours >= 6 ? 64 : 54,
      text: place + ': ' + (c.summary || 'open issue'),
      dept: (hours >= 6 ? 'Maintenance · ' : 'New · ') + Math.max(1, Math.round(hours)) + 'ч',
      cardKey: isUnit ? 'bar' : 'risks',
      status: c.status || 'open',
      openedAt: c.openedAt || null,
      ax: pos.ax,
      ay: pos.ay
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
    const groupKey = p._id || p.groupId || p.groupName
    items.push({
      id: 'event-' + groupKey,
      type: 'event',
      size: 48,
      text: (p.groupName || p.title || 'Group') + ' (' + (p.totalGuests || '?') + ' guests) · ' + fmtDate(p.checkIn),
      dept: 'Groups',
      cardKey: 'arrivals-' + groupKey,
      status: 'open',
      openedAt: null,
      stage: 0,
      ax: pos.ax,
      ay: pos.ay
    })
  })

  ;(cache.posterInventory?.needsReorder || []).slice(0, 8).forEach(item => {
    const pos = nextBubblePos(idx++)
    const outOfStock = item.inStock <= 0
    items.push({
      id: 'shortage-' + item.id,
      type: 'shortage',
      size: outOfStock ? 56 : 48,
      text: item.name + ': ' + item.inStock + ' ' + item.unit +
        (item.minStock > 0 ? ' (мин: ' + item.minStock + ')' : ''),
      dept: outOfStock ? 'Склад · нет в наличии' : 'Склад · нужен заказ',
      cardKey: 'purchase',
      status: 'open',
      openedAt: null,
      stage: outOfStock ? 0 : 1,
      ax: pos.ax,
      ay: pos.ay
    })
  })

  return items
}

// Merge freshly-computed live bubbles into the existing list, preserving
// open/stage for anything the manager is currently looking at — a fresh
// pulse fetch should never snap an open card's bubble shut.
function mergeBubbles(prevList, freshList) {
  const prevById = new Map(prevList.map(b => [b.id, b]))
  return freshList.map(fresh => {
    const prev = prevById.get(fresh.id)
    if (!prev) return fresh
    return {
      ...fresh,
      open: prev.open,
      openedCardKey: prev.openedCardKey,
      stage: Math.max(prev.stage || 0, fresh.stage || 0)
    }
  })
}

function initParticles(size) {
  const particles = []
  const R_f = size * 0.38
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
    const r = Math.random() * size * 0.9
    const sa = (i / NP) * Math.PI * 6
    const sr = size * 0.1 + (i / NP) * size * 0.7
    particles.push({
      px: Math.cos(angle) * r,
      py: Math.sin(angle) * r,
      vx: 0, vy: 0,
      chaosX: (Math.random() - 0.5) * size * 1.6,
      chaosY: (Math.random() - 0.5) * size * 1.6,
      spiralX: sr * Math.cos(sa),
      spiralY: sr * Math.sin(sa),
      flowerX: flowerPts[i].x,
      flowerY: flowerPts[i].y,
      size: 1.0 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.5
    })
  }
  return particles
}

// Creates the per-bubble physics state. Lives entirely in a ref map — this
// updates every frame and must never go through React state/re-render.
function createSim(def, vw, vh) {
  const px = (def.ax || 0.2) * vw
  const py = (def.ay || 0.3) * vh
  return {
    px, py, homeX: px, homeY: py, vx: 0, vy: 0,
    phase: Math.random() * Math.PI * 2,
    speed: 0.4 + Math.random() * 0.3,
    bSpeed: 1 + Math.random(),
    amp: 4 + Math.random() * 6,
    particles: initParticles(def.size),
    stage: def.stage,
    stageProgress: 0,
    resolveProgress: 0,
    isDragging: false,
    didMove: false
  }
}

function drawBubble(canvas, sim, def, t, dim) {
  if (!canvas || !sim.particles) return
  const half = def.size * 1.5
  const ctx = canvas.getContext('2d')
  canvas.width = def.size * 3
  canvas.height = def.size * 3
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const isTurnover = def.type === 'turnover'
  const col = isTurnover ? TURNOVER_COLOR : (STAGE_COLORS[sim.stage] || STAGE_COLORS[0])

  sim.stageProgress = Math.min(1, sim.stageProgress + 0.006)
  const ease = sim.stageProgress < 0.5
    ? 2 * sim.stageProgress * sim.stageProgress
    : 1 - Math.pow(-2 * sim.stageProgress + 2, 2) / 2

  let shouldRemove = false
  if (sim.stage === 2 && sim.stageProgress > 0.85) {
    sim.resolveProgress = Math.min(1, sim.resolveProgress + 0.004)
    if (sim.resolveProgress >= 1) shouldRemove = true
  }

  const globalAlpha = dim ? 0.15 : (sim.stage === 2 ? (1 - sim.resolveProgress * 0.9) : 1)
  ctx.save()
  ctx.globalAlpha = globalAlpha

  if (sim.stage === 2 && ease > 0.3) {
    const R_f = def.size * 0.38
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

  for (const p of sim.particles) {
    const br = 0.5 + 0.5 * Math.sin(t * p.speed + p.phase)
    let tx, ty
    if (sim.stage === 0) {
      tx = p.chaosX + Math.sin(t * p.speed * 1.3 + p.phase) * (1 - ease) * def.size * 0.3
      ty = p.chaosY + Math.cos(t * p.speed + p.phase) * (1 - ease) * def.size * 0.3
    } else if (sim.stage === 1) {
      tx = p.spiralX * ease + p.chaosX * (1 - ease)
      ty = p.spiralY * ease + p.chaosY * (1 - ease)
      tx += Math.sin(t * p.speed + p.phase) * (1 - ease) * def.size * 0.15
      ty += Math.cos(t * p.speed + p.phase) * (1 - ease) * def.size * 0.15
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
    const alpha = dim ? 0.12 : (sim.stage === 2 ? 0.2 + 0.7 * ease + 0.1 * br : 0.3 + 0.3 * br)
    const size = p.size * (sim.stage === 2 ? (0.7 + 0.5 * ease) : 1)
    ctx.beginPath()
    ctx.arc(half + p.px, half + p.py, size, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + alpha + ')'
    ctx.fill()
  }
  ctx.restore()
  return shouldRemove
}

export default function BubblesLayer() {
  const bubbles = useStore(s => s.bubbles)
  const pulseCache = useStore(s => s.pulseCache)

  // Latest bubble list, readable inside the RAF loop without re-subscribing it.
  const bubblesRef = useRef(bubbles)
  bubblesRef.current = bubbles

  const simsRef = useRef(new Map())     // id -> physics state (positions, particles)
  const elRefs = useRef(new Map())      // id -> wrapper div
  const canvasRefs = useRef(new Map())  // id -> live canvas
  const ghostRefs = useRef(new Map())   // id -> ghost div
  const ghostCanvasRefs = useRef(new Map())
  const zonesRef = useRef([])
  const animTRef = useRef(0)
  const dragRef = useRef({ id: null, ox: 0, oy: 0 })
  const ttRef = useRef(null)
  const ttTypeRef = useRef(null)
  const ttTextRef = useRef(null)
  const ttDeptRef = useRef(null)

  // Fetch pulse data once on mount if nothing has loaded it yet (mirrors the
  // old standalone fetch, but now flows through the shared store instead of
  // window.__pulseCache).
  useEffect(() => {
    if (pulseCache) return
    apiGet('/api/ops-pulse').then(data => {
      actions.setPulseCache(data)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recompute bubbles whenever live data changes, preserving open/stage state.
  useEffect(() => {
    if (!pulseCache) return
    const fresh = buildBubbleDataFromLive(pulseCache)
    if (!fresh.length) return
    actions.setBubbles(mergeBubbles(bubblesRef.current, fresh))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseCache])

  // Ensure every bubble in the store has matching physics state.
  useEffect(() => {
    const vw = window.innerWidth, vh = window.innerHeight
    const sims = simsRef.current
    const ids = new Set(bubbles.map(b => b.id))
    bubbles.forEach(b => {
      if (!sims.has(b.id)) sims.set(b.id, createSim(b, vw, vh))
      sims.get(b.id).stage = Math.max(sims.get(b.id).stage, b.stage || 0)
    })
    // Drop sim state for bubbles that no longer exist.
    for (const id of Array.from(sims.keys())) {
      if (!ids.has(id)) sims.delete(id)
    }
  }, [bubbles])

  function updateZones() {
    const zones = []
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
    // Open bubbles claim a zone at the viewport center so roaming bubbles
    // don't drift across the card that just woke up there.
    bubblesRef.current.forEach(b => {
      if (b.open) {
        zones.push({ id: b.id, cx: window.innerWidth / 2, cy: window.innerHeight / 2, r: 180 })
      }
    })
    zonesRef.current = zones
  }

  function showTooltip(b, x, y) {
    if (!ttRef.current) return
    const drawType = b.bubbleType || b.type
    ttTypeRef.current.textContent = STAGE_LABELS[drawType] || ''
    ttTypeRef.current.style.color = STAGE_TT_COLORS[drawType] || '#d98a2b'
    ttTextRef.current.textContent = b.text
    ttDeptRef.current.textContent = b.dept || ''
    ttRef.current.style.opacity = '1'
    positionTooltip(x, y)
  }

  function hideTooltip() {
    if (ttRef.current) ttRef.current.style.opacity = '0'
  }

  function positionTooltip(x, y) {
    if (!ttRef.current) return
    const vw = window.innerWidth
    let lx = x + 14, ly = y + 14
    if (lx + 210 > vw) lx = x - 220
    if (ly + 90 > window.innerHeight - 20) ly = y - 100
    ttRef.current.style.left = lx + 'px'
    ttRef.current.style.top = ly + 'px'
  }

  function openBubble(b) {
    const half = b.size * 1.5
    const sim = simsRef.current.get(b.id)
    if (!sim) return
    sim.stage = Math.max(sim.stage, 1)
    sim.stageProgress = 0
    const ghostCanvas = ghostCanvasRefs.current.get(b.id)
    const ghost = ghostRefs.current.get(b.id)
    const el = elRefs.current.get(b.id)
    drawBubble(ghostCanvas, sim, b, animTRef.current, true)
    if (ghost) {
      ghost.style.left = (sim.px - half) + 'px'
      ghost.style.top = (sim.py - half) + 'px'
      ghost.style.display = 'block'
    }
    if (el) el.style.visibility = 'hidden'
    hideTooltip()
    const cardKey = b.cardKey || b.type
    if (document.body.getAttribute('data-panel') === 'open') {
      actions.closePanel()
    }
    actions.wakeCard(cardKey, b.text)
    actions.openBubble(b.id, cardKey)
    setTimeout(() => {
      const ca = document.getElementById('cardsArea')
      if (ca) ca.scrollTop = 0
    }, 50)
  }

  // Drag + click handling, attached once at the layer level (matches the
  // previous document-level listener approach but scoped to React's effect
  // lifecycle instead of leaking onto `document` forever).
  useEffect(() => {
    function onMouseMove(e) {
      const drag = dragRef.current
      if (drag.id == null) {
        // Tooltip follow, handled per-element via onMouseMove below.
        return
      }
      const sim = simsRef.current.get(drag.id)
      const def = bubblesRef.current.find(b => b.id === drag.id)
      if (!sim || !def) return
      sim.didMove = true
      sim.px = e.clientX - drag.ox
      sim.py = e.clientY - drag.oy
      sim.homeX = sim.px
      sim.homeY = sim.py
      const half = def.size * 1.5, mg = half + 4
      sim.px = Math.max(mg, Math.min(sim.px, window.innerWidth - mg))
      sim.py = Math.max(mg, Math.min(sim.py, window.innerHeight - mg - 40))
      const el = elRefs.current.get(drag.id)
      if (el) {
        el.style.left = (sim.px - half) + 'px'
        el.style.top = (sim.py - half) + 'px'
      }
    }
    function onMouseUp() {
      const drag = dragRef.current
      if (drag.id != null) {
        const sim = simsRef.current.get(drag.id)
        if (sim) sim.isDragging = false
      }
      dragRef.current = { id: null, ox: 0, oy: 0 }
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // Main animation loop.
  useEffect(() => {
    let raf
    function tick() {
      animTRef.current += 0.011
      updateZones()
      const vw = window.innerWidth, vh = window.innerHeight
      const toRemove = []

      bubblesRef.current.forEach(b => {
        const sim = simsRef.current.get(b.id)
        if (!sim) return
        const half = b.size * 1.5, mg = half + 4
        const el = elRefs.current.get(b.id)
        const canvas = canvasRefs.current.get(b.id)

        if (b.open) {
          const ghostCanvas = ghostCanvasRefs.current.get(b.id)
          const shouldRemove = drawBubble(ghostCanvas, sim, b, animTRef.current, true)
          if (shouldRemove) toRemove.push(b.id)
          return
        }

        if (sim.isDragging) {
          if (el) { el.style.left = (sim.px - half) + 'px'; el.style.top = (sim.py - half) + 'px' }
          drawBubble(canvas, sim, b, animTRef.current, false)
          return
        }

        const fdx = Math.cos(animTRef.current * sim.speed * 0.55 + sim.phase) * sim.amp * 0.3
        const fdy = Math.sin(animTRef.current * sim.speed + sim.phase) * sim.amp
        let fx = 0, fy = 0
        zonesRef.current.forEach(z => {
          const ddx = sim.px - z.cx, ddy = sim.py - z.cy
          const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1
          const repR = z.r + half + 16
          if (dist < repR) {
            const ov = repR - dist
            fx += (ddx / dist) * ov * 1.4
            fy += (ddy / dist) * ov * 1.4
          }
        })
        const dhx = sim.homeX - sim.px, dhy = sim.homeY - sim.py
        if (Math.sqrt(dhx * dhx + dhy * dhy) > 2) { fx += dhx * 0.04; fy += dhy * 0.04 }
        sim.vx = (sim.vx + fx) * 0.78
        sim.vy = (sim.vy + fy) * 0.78
        sim.px += sim.vx
        sim.py += sim.vy
        sim.px = Math.max(mg, Math.min(sim.px, vw - mg))
        sim.py = Math.max(mg, Math.min(sim.py, vh - mg - 40))
        if (el) {
          el.style.left = (sim.px + fdx - half) + 'px'
          el.style.top = (sim.py + fdy - half) + 'px'
        }
        const shouldRemove = drawBubble(canvas, sim, b, animTRef.current, false)
        if (shouldRemove) toRemove.push(b.id)
      })

      if (toRemove.length) {
        toRemove.forEach(id => actions.removeBubble(id))
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <>
      <style>{`
        .lf-bubble{position:fixed;border-radius:50%;cursor:grab;z-index:8;touch-action:none;}
        .lf-bubble:active{cursor:grabbing;}
        .lf-ghost{position:fixed;border-radius:50%;pointer-events:none;z-index:7;opacity:.18;display:none;}
        .lf-tt{position:fixed;background:rgba(255,253,247,.97);border:1px solid rgba(40,30,18,.13);border-radius:12px;padding:10px 13px;font-size:12px;line-height:1.5;max-width:200px;pointer-events:none;opacity:0;transition:opacity .15s;z-index:50;box-shadow:0 4px 18px rgba(40,30,18,.10);}
        .lf-tt-type{font-size:10px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;margin-bottom:4px;}
        .lf-tt-text{color:#3d3730;}
        .lf-tt-dept{font-size:11px;color:#9a8c7c;margin-top:4px;}
      `}</style>

      {bubbles.map(b => {
        const sim = simsRef.current.get(b.id)
        const canvasSize = b.size * 3
        const px = sim ? sim.px : (b.ax || 0.2) * window.innerWidth
        const py = sim ? sim.py : (b.ay || 0.3) * window.innerHeight
        const half = b.size * 1.5
        return (
          <div key={b.id}>
            <div
              ref={el => { if (el) elRefs.current.set(b.id, el); else elRefs.current.delete(b.id) }}
              className="lf-bubble"
              style={{
                width: canvasSize, height: canvasSize,
                left: px - half, top: py - half,
                visibility: b.open ? 'hidden' : 'visible'
              }}
              onMouseDown={e => {
                if (b.open) return
                const s = simsRef.current.get(b.id)
                if (!s) return
                s.isDragging = true
                s.didMove = false
                dragRef.current = { id: b.id, ox: e.clientX - s.px, oy: e.clientY - s.py }
                s.vx = 0; s.vy = 0
                hideTooltip()
                e.preventDefault()
              }}
              onMouseEnter={e => {
                const s = simsRef.current.get(b.id)
                if (!b.open && s && !s.isDragging) showTooltip(b, e.clientX, e.clientY)
              }}
              onMouseMove={e => {
                const s = simsRef.current.get(b.id)
                if (s && !s.isDragging) positionTooltip(e.clientX, e.clientY)
              }}
              onMouseLeave={hideTooltip}
              onClick={() => {
                const s = simsRef.current.get(b.id)
                if (!s || s.didMove || b.open) return
                openBubble(b)
              }}
            >
              <canvas
                ref={el => { if (el) canvasRefs.current.set(b.id, el); else canvasRefs.current.delete(b.id) }}
                width={canvasSize}
                height={canvasSize}
              />
            </div>
            <div
              ref={el => { if (el) ghostRefs.current.set(b.id, el); else ghostRefs.current.delete(b.id) }}
              className="lf-ghost"
              style={{ width: canvasSize, height: canvasSize }}
            >
              <canvas
                ref={el => { if (el) ghostCanvasRefs.current.set(b.id, el); else ghostCanvasRefs.current.delete(b.id) }}
                width={canvasSize}
                height={canvasSize}
              />
            </div>
          </div>
        )
      })}

      <div className="lf-tt" ref={ttRef}>
        <div className="lf-tt-type" ref={ttTypeRef} />
        <div className="lf-tt-text" ref={ttTextRef} />
        <div className="lf-tt-dept" ref={ttDeptRef} />
      </div>
    </>
  )
}
