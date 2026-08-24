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
      borderRadius: {
        xl: '0.5rem',
        '2xl': '0.75rem',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(13, 13, 26, 0.06), 0 1px 4px rgba(13, 13, 26, 0.04)',
        md: '0 8px 24px rgba(13, 13, 26, 0.10)',
        xl: '0 18px 48px rgba(13, 13, 26, 0.18)',
      },
    },
  },
  plugins: [],
}
