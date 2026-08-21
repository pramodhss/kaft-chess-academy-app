/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark like the KAFT logo background
        navy:          '#0D0D1A',
        // Deep professional gold for interactive elements and buttons
        'chess-blue':  '#C9970A',
        // Light gold for soft backgrounds and subtitle text
        'chess-light': '#FFF3CC',
        // Bright gold for accent decorations
        gold:          '#FFD700',
      },
    },
  },
  plugins: [],
}
