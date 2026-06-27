import { useEffect, useRef } from 'react'
import { useStore } from './hooks/useStore.js'
import CornerLogo from './components/CornerLogo.jsx'
import Tray from './components/Tray.jsx'
import CardsArea from './components/CardsArea.jsx'
import RitaPanel from './components/RitaPanel.jsx'
import SummonButton from './components/SummonButton.jsx'
import BubblesLayer from './components/BubblesLayer.jsx'

export default function App() {
  const panelOpen = useStore(s => s.panelOpen)

  return (
    <div
      data-state="rest"
      data-panel={panelOpen ? 'open' : 'closed'}
      style={{ height: '100%' }}
    >
      <Tray />

      <CornerLogo />

      <div className="layout">
        <CardsArea />
        <RitaPanel />
      </div>

      <SummonButton />

      {/* BubblesLayer renders its own bubbles + tooltip as real React elements */}
      <BubblesLayer />
    </div>
  )
}
