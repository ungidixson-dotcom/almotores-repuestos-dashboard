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
        }
      },
      fontFamily: {
        sans:  ['IBM Plex Sans', 'sans-serif'],
        mono:  ['IBM Plex Mono', 'monospace'],
        title: ['Space Grotesk', 'sans-serif'],
      }
    }
  },
  plugins: [],
}
