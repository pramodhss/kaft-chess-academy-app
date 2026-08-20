import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // update base to '/your-repo-name/' when deploying to GitHub Pages
  base: '/chess-academy-app/',
})
