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
        darkBg: '#050811',
        darkCard: 'rgba(11, 18, 30, 0.6)',
        neonBlue: '#0ea5e9', // maps to auroraCyan
        neonPink: '#8b5cf6', // maps to auroraPurple
        neonGreen: '#00e5a3', // maps to auroraMint
        auroraSpruce: '#050811',
        auroraCard: '#0b121e',
        auroraMint: '#00e5a3',
        auroraPurple: '#8b5cf6',
        auroraCyan: '#0ea5e9',
        auroraIndigo: '#6366f1',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glow-blue': '0 0 15px rgba(14, 165, 233, 0.4)',
        'glow-pink': '0 0 15px rgba(139, 92, 246, 0.4)',
        'glow-green': '0 0 15px rgba(0, 229, 163, 0.4)',
      },
      backdropBlur: {
        'glass': '12px',
      }
    },
  },
  plugins: [],
}
