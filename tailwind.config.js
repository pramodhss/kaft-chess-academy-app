/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'Manrope Variable', 'ui-sans-serif', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
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
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(13, 13, 26, 0.06), 0 1px 4px rgba(13, 13, 26, 0.04)',
        md: '0 10px 28px rgba(13, 13, 26, 0.12)',
        xl: '0 22px 54px rgba(13, 13, 26, 0.20)',
      },
    },
  },
  plugins: [],
}
