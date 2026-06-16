import { useStore, actions } from '../hooks/useStore.js'

export default function Tray() {
  const chips = useStore(s => s.trayChips)

  if (!chips.length) return <div className="tray" id="tray" />

  return (
    <div className="tray" id="tray">
      {chips.map(({ key, title }) => (
        <button
          key={key}
          className="tray-chip"
          type="button"
          onClick={() => actions.restoreCard(key)}
        >
          <span className="d" />
          {title}
        </button>
      ))}
    </div>
  )
}
