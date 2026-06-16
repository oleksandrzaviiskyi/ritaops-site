# RITA Living Operations — React + Vite

This is the React + Vite rewrite of `living-ops.html`.

## Structure

```
living-ops/
  src/
    main.jsx              # Entry point
    App.jsx               # Root component
    hooks/
      useStore.js         # Global state (no Redux, lightweight singleton)
      useApi.js           # API calls + live data builders
      useChat.js          # Rita chat + PDF upload logic
    components/
      BubblesLayer.jsx    # Vanilla JS bubble engine (canvas), mounted via useEffect
      CardsArea.jsx       # Cards field
      Card.jsx            # Individual card with drag, log, composer
      cardUpdaters.js     # Pure functions: applyPulseToCard, applyArrivalsToCard, applyRisksToCard
      RitaPanel.jsx       # Rita slide-in panel with chat
      Tray.jsx            # Minimized card chips
      CornerLogo.jsx      # Logo top-left
      SummonButton.jsx    # Draggable RITA button
    data/
      cards.js            # Static card definitions
    utils/
      api.js              # apiGet, apiPost, helpers
    styles/
      living-ops.css      # All CSS (identical to original)
  index.html
  vite.config.js
  package.json
```

## What’s preserved

- **Bubble engine** — entire canvas/particle system is vanilla JS in `BubblesLayer.jsx`, unchanged from original
- **Card drag** — mousedown/move/up drag on card-head, same logic
- **Rita panel** — slide-in chat, PDF upload, history in localStorage
- **Live data** — `ops-pulse` + `portals` API calls, same transformations
- **Netlify functions** — not touched, all redirects kept

## Dev

```bash
cd living-ops
npm install
npm run dev
```

For API calls to work locally: run `netlify dev` from root instead.

## Build

```bash
cd living-ops
npm run build
# outputs to ../dist-living-ops
```

Netlify builds automatically via `netlify.toml`.
