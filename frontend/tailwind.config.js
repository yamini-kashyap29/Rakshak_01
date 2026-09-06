/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        grid: {
          bg: '#0b0f14',
          panel: '#111820',
          panel2: '#161f2a',
          line: '#233041',
          text: '#dbe4ee',
          dim: '#7c8ba1',
          accent: '#2dd4bf',
          critical: '#ef4444',
          high: '#f97316',
          warn: '#eab308',
          safe: '#22c55e',
        },
      },
      fontFamily: {
        display: ['"Barlow Semi Condensed"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
