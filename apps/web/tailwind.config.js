/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
    "../../packages/graph-engine/src/**/*.{js,ts,jsx,tsx}"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        darkBg: '#0b0f19',
        darkCard: 'rgba(17, 24, 39, 0.7)',
        neonBlue: '#00f0ff',
        neonPink: '#ff007f',
        neonGreen: '#39ff14',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glow-blue': '0 0 15px rgba(0, 240, 255, 0.4)',
        'glow-pink': '0 0 15px rgba(255, 0, 127, 0.4)',
        'glow-green': '0 0 15px rgba(57, 255, 20, 0.4)',
      },
      backdropBlur: {
        'glass': '12px',
      }
    },
  },
  plugins: [],
}
