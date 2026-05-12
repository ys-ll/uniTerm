<template>
  <div ref="terminalRef" class="terminal-tab" @contextmenu="onContextMenu"></div>
  <div
    v-show="menuVisible"
    ref="menuRef"
    class="context-menu"
    :style="menuStyle"
    @click.stop
  >
    <div class="menu-item" :class="{ disabled: !hasSelection }" @click="askAI">
      {{ t('terminal.askAI') }}
    </div>
    <div class="menu-item" :class="{ disabled: !hasSelection }" @click="copySelection">
      {{ t('terminal.copy') }}
    </div>
    <div class="menu-item" :class="{ disabled: !hasSelection }" @click="copyAndPaste">
      {{ t('terminal.copyAndPaste') }}
    </div>
    <div class="menu-item" @click="pasteFromClipboard">{{ t('terminal.paste') }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { SessionWrite, SessionResize, CreateSession } from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime'
import { useTabStore } from '../stores/tabStore'
import { useSessionStore } from '../stores/sessionStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useI18n } from '../i18n'
import type { Tab } from '../types/session'

function debounce(fn: () => void, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn()
    }, delay)
  }
}


const props = defineProps<{
  tab: Tab
}>()

const tabStore = useTabStore()
const sessionStore = useSessionStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()

const terminalRef = ref<HTMLDivElement>()
const menuRef = ref<HTMLDivElement>()
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let intersectionObserver: IntersectionObserver | null = null
let unsubscribe: (() => void) | null = null
let statusUnsubscribe: (() => void) | null = null

const menuVisible = ref(false)
const menuStyle = ref({ left: '0px', top: '0px' })
const hasSelection = ref(false)

let resizeTimer: ReturnType<typeof setTimeout> | null = null
let isResizing = false
let retryOnEnter = false

function getTerminalOptions() {
  const ts = settingsStore.settings.terminal
  const themeName = ts.theme || 'dark'
  return {
    fontSize: ts.fontSize || 13,
    fontFamily: ts.fontFamily || 'var(--font-mono)',
    theme: getXtermTheme(themeName),
    cursorBlink: true,
    rightClickSelectsWord: false,
    scrollback: ts.maxHistoryLines || 5000,
    allowProposedApi: true
  }
}

function getXtermTheme(name: string): any {
  const base = {
    background: 'var(--bg-base)',
    foreground: 'var(--text-primary)',
    cursor: 'var(--accent)',
    selectionBackground: 'rgba(34, 211, 238, 0.2)',
    black: '#1e1e22',
    red: '#f87171',
    green: '#34d399',
    yellow: '#fbbf24',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#e8e8ec',
    brightBlack: '#3f3f46',
    brightRed: '#fca5a5',
    brightGreen: '#6ee7b7',
    brightYellow: '#fde68a',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#fafafa'
  }
  switch (name) {
    case 'light':
      return {
        background: '#fafafa',
        foreground: '#1f1f1f',
        cursor: '#007acc',
        selectionBackground: 'rgba(0, 122, 204, 0.2)',
        black: '#1e1e22',
        red: '#d32f2f',
        green: '#388e3c',
        yellow: '#f9a825',
        blue: '#1976d2',
        magenta: '#7b1fa2',
        cyan: '#00838f',
        white: '#e0e0e0',
        brightBlack: '#616161',
        brightRed: '#e57373',
        brightGreen: '#81c784',
        brightYellow: '#fff176',
        brightBlue: '#64b5f6',
        brightMagenta: '#ba68c8',
        brightCyan: '#4dd0e1',
        brightWhite: '#ffffff'
      }
    case 'solarized-dark':
      return {
        background: '#002b36',
        foreground: '#839496',
        cursor: '#93a1a1',
        selectionBackground: 'rgba(147, 161, 161, 0.3)',
        black: '#073642',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#eee8d5',
        brightBlack: '#002b36',
        brightRed: '#cb4b16',
        brightGreen: '#586e75',
        brightYellow: '#657b83',
        brightBlue: '#839496',
        brightMagenta: '#6c71c4',
        brightCyan: '#93a1a1',
        brightWhite: '#fdf6e3'
      }
    case 'solarized-light':
      return {
        background: '#fdf6e3',
        foreground: '#657b83',
        cursor: '#586e75',
        selectionBackground: 'rgba(88, 110, 117, 0.3)',
        black: '#002b36',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#073642',
        brightBlack: '#eee8d5',
        brightRed: '#cb4b16',
        brightGreen: '#93a1a1',
        brightYellow: '#839496',
        brightBlue: '#657b83',
        brightMagenta: '#6c71c4',
        brightCyan: '#586e75',
        brightWhite: '#1e1e1e'
      }
    case 'monokai':
      return {
        background: '#272822',
        foreground: '#f8f8f2',
        cursor: '#f8f8f0',
        selectionBackground: 'rgba(248, 248, 240, 0.2)',
        black: '#272822',
        red: '#f92672',
        green: '#a6e22e',
        yellow: '#f4bf75',
        blue: '#66d9ef',
        magenta: '#ae81ff',
        cyan: '#a1efe4',
        white: '#f8f8f2',
        brightBlack: '#75715e',
        brightRed: '#f92672',
        brightGreen: '#a6e22e',
        brightYellow: '#f4bf75',
        brightBlue: '#66d9ef',
        brightMagenta: '#ae81ff',
        brightCyan: '#a1efe4',
        brightWhite: '#f9f8f5'
      }
    default:
      return base
  }
}

function onWindowResize() {
  const el = terminalRef.value
  if (!el) return
  if (!isResizing) {
    isResizing = true
    el.classList.add('resizing')
  }
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    isResizing = false
    el.classList.remove('resizing')
    notifyResize()
  }, 400)
}

function onContextMenu(e: MouseEvent) {
  const rightClickAction = settingsStore.settings.terminal.rightClickAction
  if (rightClickAction === 'paste') {
    e.preventDefault()
    e.stopPropagation()
    pasteFromClipboard()
    return
  }
  e.preventDefault()
  e.stopPropagation()
  window.dispatchEvent(new CustomEvent('global:close-context-menus'))
  hasSelection.value = !!terminal?.getSelection()
  menuStyle.value = fitMenuPosition(e.clientX, e.clientY, 120, 140)
  menuVisible.value = true
}

function fitMenuPosition(x: number, y: number, menuW: number, menuH: number) {
  let left = x
  let top = y
  if (x + menuW > window.innerWidth) left = x - menuW
  if (y + menuH > window.innerHeight) top = y - menuH
  return { left: left + 'px', top: top + 'px' }
}

function closeMenu() {
  menuVisible.value = false
}

function copySelection() {
  const text = terminal?.getSelection()
  if (text) {
    navigator.clipboard.writeText(text)
  }
  closeMenu()
}

async function copyAndPaste() {
  const text = terminal?.getSelection()
  if (text) {
    await navigator.clipboard.writeText(text)
    if (props.tab.sessionId) {
      SessionWrite(props.tab.sessionId, text)
    }
  }
  closeMenu()
}

async function askAI() {
  const text = terminal?.getSelection()
  if (text) {
    window.dispatchEvent(new CustomEvent('ai:ask', { detail: text }))
  }
  closeMenu()
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    if (text && props.tab.sessionId) {
      SessionWrite(props.tab.sessionId, text)
    }
  } catch {
    // clipboard read failed
  }
  closeMenu()
}

function notifyResize() {
  if (!terminal || !fitAddon || !props.tab.sessionId) return
  fitAddon.fit()
  if (terminal.cols <= 0 || terminal.rows <= 0) return
  // Force full refresh so xterm re-renders all visible lines at once
  // instead of incrementally wrapping characters.
  ;(terminal as any).refresh?.(0, terminal.rows - 1)
  console.log('[resize]', props.tab.sessionId, 'cols=', terminal.cols, 'rows=', terminal.rows)
  SessionResize(props.tab.sessionId, terminal.cols, terminal.rows).catch((err) => {
    console.log('[resize] error:', err)
  })
}

onMounted(() => {
  if (!terminalRef.value) return

  terminal = new Terminal(getTerminalOptions())

  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(terminalRef.value)
  fitAddon.fit()

  async function retryConnection() {
    if (!props.tab.config) return
    terminal?.write('\r\n\x1b[33mReconnecting...\x1b[0m\r\n')
    try {
      const info = await CreateSession(props.tab.type, props.tab.config)
      const t = tabStore.tabs.find(x => x.id === props.tab.id)
      if (t) {
        t.sessionId = info.id
      }
      sessionStore.initSession(info.id)
    } catch (e: any) {
      terminal?.write(`\r\n\x1b[31mReconnect failed: ${e}\x1b[0m\r\n`)
      retryOnEnter = true
    }
  }

  terminal.onData((data) => {
    if (retryOnEnter && (data === '\r' || data === '\n')) {
      retryOnEnter = false
      retryConnection()
      return
    }
    if (props.tab.sessionId) {
      SessionWrite(props.tab.sessionId, data)
    }
  })

  // Selection action: copy on mouse up
  terminal.element?.addEventListener('mouseup', () => {
    if (settingsStore.settings.terminal.selectionAction === 'copy') {
      const text = terminal?.getSelection()
      if (text) {
        navigator.clipboard.writeText(text)
      }
    }
  })

  unsubscribe = EventsOn('session:data', (payload: { id: string; data: string }) => {
    if (payload.id === props.tab.sessionId && terminal) {
      terminal.write(payload.data)
    }
  })

  retryOnEnter = false
  statusUnsubscribe = EventsOn('session:status', (payload: { id: string; status: string }) => {
    if (payload.id !== props.tab.sessionId) return
    if (payload.status === 'connected') {
      retryOnEnter = false
      notifyResize()
    } else if (payload.status === 'error') {
      retryOnEnter = true
      terminal?.write('\r\n\x1b[31mConnection failed. Press Enter to retry.\x1b[0m\r\n')
    }
  })

  window.addEventListener('resize', onWindowResize)

  // Also handle container-only resize (AI sidebar drag, etc.)
  resizeObserver = new ResizeObserver(() => {
    if (isResizing) return
    const el = terminalRef.value
    if (!el) return
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => notifyResize(), 150)
  })
  resizeObserver.observe(terminalRef.value)

  intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        notifyResize()
      }
    })
  })
  intersectionObserver.observe(terminalRef.value)

  window.addEventListener('global:close-context-menus', closeMenu)
  document.addEventListener('click', closeMenu)
})

watch(() => props.tab.sessionId, (newId) => {
  if (newId) {
    // Retry resize multiple times with longer delays to ensure backend Connect is ready
    const delays = [200, 400, 600, 800, 1000, 1500, 2000]
    delays.forEach((delay, i) => {
      setTimeout(() => notifyResize(), delay)
    })
  }
})

// Watch terminal settings changes
watch(() => settingsStore.settings.terminal, (ts) => {
  if (!terminal) return
  if (ts.fontSize) terminal.options.fontSize = ts.fontSize
  if (ts.fontFamily) terminal.options.fontFamily = ts.fontFamily
  if (ts.maxHistoryLines) terminal.options.scrollback = ts.maxHistoryLines
  if (ts.theme) terminal.options.theme = getXtermTheme(ts.theme)
  notifyResize()
}, { deep: true })

onUnmounted(() => {
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
  terminal?.dispose()
  unsubscribe?.()
  statusUnsubscribe?.()
  window.removeEventListener('global:close-context-menus', closeMenu)
  document.removeEventListener('click', closeMenu)
  window.removeEventListener('resize', onWindowResize)
})
</script>

<style scoped>
.terminal-tab {
  width: 100%;
  height: 100%;
  padding: 6px 8px;
  contain: strict;
  overflow: hidden;
  user-select: text;
  -webkit-user-select: text;
}

/* Hide terminal content during window resize */
.terminal-tab.resizing :deep(.xterm-screen) {
  opacity: 0 !important;
}

/* Minimal scrollbar matching app style */
.terminal-tab :deep(.xterm-viewport) {
  overflow-y: scroll !important;
}
.terminal-tab :deep(.xterm-viewport::-webkit-scrollbar) {
  width: 5px;
}
.terminal-tab :deep(.xterm-viewport::-webkit-scrollbar-track) {
  background: transparent;
}
.terminal-tab :deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
}
.terminal-tab :deep(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
  background: rgba(255, 255, 255, 0.12);
}

.context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  min-width: 120px;
  padding: 4px;
  backdrop-filter: blur(8px);
}

.menu-item {
  padding: 7px 14px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  border-radius: var(--radius-sm);
  transition: all 0.1s ease;
}

.menu-item:hover:not(.disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.menu-item.disabled {
  color: var(--text-disabled);
  cursor: default;
}
</style>
