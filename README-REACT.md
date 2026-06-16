# RITA Living Operations — React + Vite

## Build

Netlify builds from `living-ops/` directory:

```
base = "living-ops"
command = "npm install && npm run build"
publish = "dist"
functions = "../netlify/functions"
```

## Local dev

```bash
cd living-ops
npm install
npm run dev
# API: run netlify dev from root
```

## Source

```
living-ops/
  src/
    main.jsx
    App.jsx
    hooks/         # useStore, useApi, useChat
    components/    # BubblesLayer, Card, RitaPanel, Tray, etc
    data/cards.js
    utils/api.js
    styles/living-ops.css
  index.html
  vite.config.js
  package.json
```

Netlify functions are in `/netlify/functions/` — not touched.
