/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg:      '#0F1419',
          surface: '#1B232D',
          border:  '#2A3340',
          muted:   '#5B6472',
          subtle:  '#8AA4C8',
          text:    '#EAF0F6',
          gold:    '#E8A33D',
          teal:    '#4FD1C5',
          red:     '#E5484D',
          // Nuevos
          'surface-2': '#232D38',
          'border-2':  '#374151',
          'teal-dim':  'rgba(79,209,197,0.12)',
          'gold-dim':  'rgba(232,163,61,0.12)',
        }
      },
      fontFamily: {
        sans:  ['Plus Jakarta Sans', 'sans-serif'],
        title: ['Plus Jakarta Sans', 'sans-serif'],
        mono:  ['Geist Mono', 'monospace'],
      },
      boxShadow: {
        'glow-teal': '0 0 20px rgba(79,209,197,0.15), 0 0 60px rgba(79,209,197,0.05)',
        'glow-gold': '0 0 20px rgba(232,163,61,0.15), 0 0 60px rgba(232,163,61,0.05)',
        'card':      '0 4px 20px rgba(0,0,0,0.4)',
        'card-hover':'0 8px 32px rgba(0,0,0,0.5)',
        'inset-top': 'inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      backgroundImage: {
        'gradient-surface': 'linear-gradient(145deg, #1B232D 0%, #141B24 100%)',
        'gradient-sidebar': 'linear-gradient(180deg, #0F1A24 0%, #0A1118 100%)',
        'gradient-teal':    'linear-gradient(135deg, rgba(79,209,197,0.15) 0%, transparent 100%)',
        'gradient-gold':    'linear-gradient(135deg, rgba(232,163,61,0.15) 0%, transparent 100%)',
      },
      animation: {
        'fade-up':    'fadeInUp 0.4s ease both',
        'count-up':   'countUp 0.6s ease both',
        'pulse-teal': 'pulse-teal 2s infinite',
        'shimmer':    'shimmer 1.5s linear infinite',
      },
      backdropBlur: {
        'xs': '4px',
      }
    }
  },
  plugins: [],
}
