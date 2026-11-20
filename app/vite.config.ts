import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 47101,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3380' },
    fs: { allow: ['..'] },
  },
})
