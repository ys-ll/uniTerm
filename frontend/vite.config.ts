import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const version = process.env.VITE_VERSION || 'dev'

export default defineConfig({
  plugins: [vue()],
  define: {
    'import.meta.env.VITE_VERSION': JSON.stringify(version)
  },
  server: {
    port: 34115,
    strictPort: true
  }
})
