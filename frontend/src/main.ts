import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { WindowSetTitle } from '../wailsjs/runtime'
import App from './App.vue'
import './style.css'

const buildTime = import.meta.env.VITE_BUILD_TIME || ''
WindowSetTitle(`uniTerm (buildTime: ${buildTime})`)

const app = createApp(App)
app.use(createPinia())
app.use(ElementPlus)
app.mount('#app')

// Global context menu closer: broadcast to all menu components via window event
document.addEventListener('contextmenu', () => {
  window.dispatchEvent(new CustomEvent('global:close-context-menus'))
}, true)

document.addEventListener('contextmenu', (e) => e.preventDefault())
