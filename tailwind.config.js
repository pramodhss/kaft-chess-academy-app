/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#17365D',
        'chess-blue': '#2F75B5',
        'chess-light': '#D9EAF7',
      },
    },
  },
  plugins: [],
}
