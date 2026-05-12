import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { WindowSetTitle } from '../wailsjs/runtime'
import App from './App.vue'
import './style.css'

const version = import.meta.env.VITE_VERSION || 'dev'
WindowSetTitle(`uniTerm ${version}`)

const app = createApp(App)
app.use(createPinia())
app.use(ElementPlus)
app.mount('#app')

// Global context menu closer: broadcast to all menu components via window event
document.addEventListener('contextmenu', () => {
  window.dispatchEvent(new CustomEvent('global:close-context-menus'))
}, true)

document.addEventListener('contextmenu', (e) => {
  const target = e.target as HTMLElement
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent('input:contextmenu', {
      detail: { x: e.clientX, y: e.clientY, target }
    }))
    return
  }
  e.preventDefault()
})
