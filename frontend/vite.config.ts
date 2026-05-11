import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const buildTime = new Date().toLocaleString('zh-CN')

export default defineConfig({
  plugins: [vue()],
  define: {
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime)
  },
  server: {
    port: 34115,
    strictPort: true
  }
})
