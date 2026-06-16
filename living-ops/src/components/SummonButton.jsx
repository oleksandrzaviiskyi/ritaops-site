import { useEffect, useRef } from 'react'
import { actions, useStore } from '../hooks/useStore.js'

export default function SummonButton() {
  const panelOpen = useStore(s => s.panelOpen)
  const btnRef = useRef(null)

  useEffect(() => {
    const el = btnRef.current
    if (!el) return

    let ox = 0, oy = 0, on = false, moved = false

    function onDown(e) {
      moved = false
      on = true
      ox = e.clientX - el.getBoundingClientRect().left
      oy = e.clientY - el.getBoundingClientRect().top
      el.classList.add('lf-dragging')
      e.preventDefault()
    }

    function onMove(e) {
      if (!on) return
      moved = true
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = el.offsetWidth
      const h = el.offsetHeight
      let nx = Math.max(8, Math.min(e.clientX - ox, vw - w - 8))
      let ny = Math.max(8, Math.min(e.clientY - oy, vh - h - 8))
      el.style.position = 'fixed'
      el.style.right = 'auto'
      el.style.bottom = 'auto'
      el.style.left = nx + 'px'
      el.style.top = ny + 'px'
    }

    function onUp() {
      if (on && !moved) actions.togglePanel()
      on = false
      el.classList.remove('lf-dragging')
    }

    el.addEventListener('mousedown', onDown)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <button className="summon" ref={btnRef} type="button" style={{ zIndex: 110 }}>
      <span className="dot" />
      <span className="lbl">RITA</span>
    </button>
  )
}
