import { useEffect, useRef } from 'react'
import { useStore } from '../hooks/useStore.js'
import { useApi } from '../hooks/useApi.js'
import Card from './Card.jsx'

export default function CardsArea() {
  const shownCards = useStore(s => s.shownCards)
  const minimized = useStore(s => s.trayChips.map(c => c.key))
  const { loadPulseData, loadPortalsData } = useApi()
  const fieldRef = useRef(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    loadPortalsData().catch(() => {})
  }, [])

  // Expose field ref globally for bubble engine (zone detection)
  useEffect(() => {
    window.__cardsFieldEl = fieldRef.current
  }, [])

  return (
    <div className="cards-area" id="cardsArea">
      <div className="field" id="field" ref={fieldRef}>
        {shownCards.map(key => (
          <Card
            key={key}
            cardKey={key}
            hidden={minimized.includes(key)}
          />
        ))}
      </div>
    </div>
  )
}
