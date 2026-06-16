import { tag } from '../utils/api.js'

export const R = 'Рите'

export function getInitialCards() {
  return {
    arrivals: {
      eyebrow: 'Arrivals',
      title: 'Groups today',
      live: true,
      recipients: [R, 'Groups'],
      rows: [['Loading', '…', '']],
      note: ''
    },
    kitchen: {
      eyebrow: 'Readiness',
      title: 'Restaurant & Bar',
      recipients: [R, 'Kitchen · Charina', 'Restaurant · Suleimi'],
      rows: [
        ['Kitchen', 'Charina', 'owns domain'],
        ['Restaurant', 'Suleimi', 'owns domain'],
        ['Menu', tag('attention', 'draft'), 'no group menu yet'],
        ['Bar stock', tag('faint', 'no data'), 'awaiting Poster POS']
      ],
      note: 'Live data coming soon.'
    },
    purchase: {
      eyebrow: 'Purchases · Diomedes',
      title: 'Purchase list · this week',
      task: true,
      recipients: [R, 'Purchases · Diomedes'],
      rows: [
        ['Coffee beans', '5 kg', tag('attention', 'low')],
        ['Plantains', '20 kg', 'for groups'],
        ['Bar tonic', '48 u', tag('attention', 'low')],
        ['Cleaning', '—', tag('ok', 'ok')]
      ],
      note: 'Live data coming soon.'
    },
    responsibility: {
      eyebrow: 'Who carries what',
      title: 'Responsibility',
      recipients: [R],
      rows: [
        ['Operations', 'Yasper · Alex', 'Steward'],
        ['Kitchen', 'Charina', 'Own'],
        ['Restaurant', 'Suleimi', 'Own'],
        ['Finance', 'Renate', 'Own'],
        ['Inventory', 'Diomedes', 'Own']
      ],
      note: 'Live data coming soon. Shift coverage not tracked yet.'
    },
    risks: {
      eyebrow: 'Needs watching',
      title: 'Risks',
      task: true,
      live: true,
      recipients: [R],
      rows: [['Open concerns', '…', '']],
      note: ''
    },
    pulse: {
      eyebrow: 'Today',
      title: 'Las Canas',
      live: true,
      recipients: [R],
      rows: [['Balance', '…', ''], ['Field', '…', '']],
      note: ''
    },
    bar: {
      eyebrow: 'Maintenance',
      title: 'Bar · кран',
      task: true,
      live: true,
      recipients: [R, 'Maintenance'],
      rows: [['Место', 'Bar', ''], ['Проблема', tag('attention', 'течёт кран'), 'обслуживание не начато']],
      note: ''
    }
  }
}
