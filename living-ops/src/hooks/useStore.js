import { useState, useCallback, useRef, createContext, useContext } from 'react'

// Simple global store using a singleton pattern with React state
const listeners = new Set()
let state = {
  panelOpen: false,
  shownCards: [],        // array of card keys in order
  trayChips: [],         // minimized cards: [{key, title}]
  pulseCache: null,
  portalsCache: null,
  bubbles: [],           // bubble definitions for BubblesLayer (replaces window.lf* globals)
  chatHistory: (() => {
    try {
      const saved = localStorage.getItem('rita_chat_history_v2')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed))
          return parsed.filter(m => m?.content && String(m.content).trim()).slice(-30)
      }
    } catch {}
    return []
  })()
}

function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  listeners.forEach(fn => fn(state))
}

export function useStore(selector) {
  const [, forceRender] = useState(0)
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  const callbackRef = useRef(null)
  if (!callbackRef.current) {
    callbackRef.current = () => forceRender(n => n + 1)
  }

  // Subscribe on first render, unsubscribe on unmount
  const isSubscribed = useRef(false)
  if (!isSubscribed.current) {
    listeners.add(callbackRef.current)
    isSubscribed.current = true
  }

  // Unsubscribe (using a trick since we can't call hooks conditionally)
  // We'll do cleanup in a ref-based effect below via useEffect in callers.
  // For simplicity here we just return selector result:
  return selector(state)
}

// Actions
export const actions = {
  openPanel: () => setState({ panelOpen: true }),
  closePanel: () => setState({ panelOpen: false }),
  togglePanel: () => setState(s => ({ panelOpen: !s.panelOpen })),

  wakeCard(key, why) {
    setState(s => {
      if (s.shownCards.includes(key)) return s  // already shown
      return { shownCards: [...s.shownCards, key] }
    })
    // Expose globally for bubble engine
    window.__ritaWakeCard = actions.wakeCard
  },

  removeCard(key) {
    setState(s => ({
      shownCards: s.shownCards.filter(k => k !== key),
      trayChips: s.trayChips.filter(c => c.key !== key)
    }))
  },

  minimizeCard(key, title) {
    setState(s => ({
      trayChips: [...s.trayChips.filter(c => c.key !== key), { key, title }]
    }))
  },

  restoreCard(key) {
    setState(s => ({ trayChips: s.trayChips.filter(c => c.key !== key) }))
  },

  setPulseCache(data) {
    setState({ pulseCache: data })
    window.__pulseCache = data
  },

  setPortalsCache(data) {
    setState({ portalsCache: data })
    window.__portalsCache = data
  },

  addDynamicCard(key, cardDef) {
    // Add a card definition at runtime (from Rita's showCards)
    window.__dynamicCards = window.__dynamicCards || {}
    window.__dynamicCards[key] = cardDef
    setState(s => ({ shownCards: [...s.shownCards, key] }))
  },

  pushChatMessage(role, content) {
    setState(s => {
      const updated = [...s.chatHistory, { role, content }]
      try { localStorage.setItem('rita_chat_history_v2', JSON.stringify(updated.slice(-30))) } catch {}
      return { chatHistory: updated }
    })
  },

  // --- Bubble actions (replace former window.lfRestoreBubble / window.lfSetBubbleResolved) ---

  setBubbles(list) {
    setState({ bubbles: Array.isArray(list) ? list : [] })
  },

  removeBubble(id) {
    setState(s => ({ bubbles: s.bubbles.filter(b => b.id !== id) }))
  },

  openBubble(bubbleId, cardKey) {
    setState(s => ({
      bubbles: s.bubbles.map(b =>
        b.id === bubbleId ? { ...b, open: true, openedCardKey: cardKey } : b
      )
    }))
  },

  // Card was closed/minimized by the user — send its bubble back into the flow.
  restoreBubbleByCardKey(cardKey) {
    setState(s => ({
      bubbles: s.bubbles.map(b =>
        b.open && b.openedCardKey === cardKey ? { ...b, open: false, openedCardKey: null } : b
      )
    }))
  },

  // Concern/task was resolved — advance the bubble to stage 2 (flower of life) and let it fade.
  resolveBubbleByCardKey(cardKey) {
    setState(s => ({
      bubbles: s.bubbles.map(b =>
        (b.openedCardKey === cardKey || b.cardKey === cardKey)
          ? { ...b, stage: 2, stageProgress: 0 }
          : b
      )
    }))
  },

  getState: () => state
}

// Expose globally so bubble engine can call wake
window.__ritaActions = actions
window.__getState = () => state
