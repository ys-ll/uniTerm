<template>
  <div class="base-terminal">
    <div ref="terminalRef" class="terminal-area" @contextmenu="menu.onContextMenu"></div>

    <!-- Terminal context menu -->
    <div
      v-show="menu.menuVisible.value"
      class="context-menu"
      :style="menu.menuStyle.value"
      @click.stop
    >
      <div class="menu-item" :class="{ disabled: !menu.hasSelection.value }" @click="menu.askAI">
        {{ t('terminal.askAI') }}
      </div>
      <div class="menu-item" :class="{ disabled: !menu.hasSelection.value }" @click="menu.copySelection">
        {{ t('terminal.copy') }}
      </div>
      <div class="menu-item" :class="{ disabled: !menu.hasSelection.value }" @click="menu.copyAndPaste">
        {{ t('terminal.copyAndPaste') }}
      </div>
      <div class="menu-item" @click="menu.pasteFromClipboard">{{ t('terminal.paste') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { SessionWrite, SessionResize } from '../../wailsjs/go/main/App'
import { EventsOn, BrowserOpenURL } from '../../wailsjs/runtime'
import { useSettingsStore } from '../stores/settingsStore'
import { useSessionStore } from '../stores/sessionStore'
import { useTerminalMenu } from '../composables/useTerminalMenu'
import { useI18n } from '../i18n'
import { getXtermTheme } from '../composables/useTerminal'

const props = defineProps<{
  mode: 'ssh' | 'sftp'
  sessionId: string | null | undefined
  onSessionStatus?: (status: string) => void
}>()

const settingsStore = useSettingsStore()
const sessionStore = useSessionStore()
const { t } = useI18n()

const terminalRef = ref<HTMLDivElement>()
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let intersectionObserver: IntersectionObserver | null = null
let unsubscribe: (() => void) | null = null
let statusUnsubscribe: (() => void) | null = null
let onDocumentMouseUp: (() => void) | null = null

let resizeTimer: ReturnType<typeof setTimeout> | null = null
let isResizing = false
let splitResizing = false
let suppressResizeUntil = 0
let retryOnEnter = false

// SFTP line buffer
let inputBuffer = ''

function getTerminalOptions() {
  const ts = settingsStore.settings.terminal
  const themeName = ts.theme || 'dark'
  return {
    fontSize: ts.fontSize || 13,
    fontFamily: ts.fontFamily || 'Consolas, "Courier New", monospace',
    theme: getXtermTheme(themeName),
    cursorBlink: true,
    rightClickSelectsWord: false,
    scrollback: ts.maxHistoryLines || 2500,
    allowProposedApi: true
  }
}

function getSelection(): string {
  return terminal?.getSelection() || ''
}

function resize() {
  if (props.mode === 'ssh') {
    const sid = props.sessionId
    if (!terminal || !fitAddon || !sid) return
    const el = terminalRef.value
    if (!el) return

    const rect = el.getBoundingClientRect()
    let cellWidth = 0
    let cellHeight = 0
    try {
      const core = (terminal as any)._core
      const dims = core?._renderService?.dimensions
      if (dims) {
        cellWidth = dims.css?.cell?.width || 0
        cellHeight = dims.css?.cell?.height || 0
      }
    } catch {
      cellWidth = 0
      cellHeight = 0
    }

    if (cellWidth === 0 || cellHeight === 0) {
      fitAddon.fit()
      if (terminal.cols <= 0 || terminal.rows <= 0) return
      SessionResize(sid, terminal.cols, terminal.rows).catch(() => {})
      return
    }

    const cols = Math.floor(rect.width / cellWidth)
    const rows = Math.floor(rect.height / cellHeight)
    const newCols = Math.max(2, cols)
    const newRows = Math.max(1, rows)

    if (terminal.cols !== newCols || terminal.rows !== newRows) {
      terminal.resize(newCols, newRows)
      SessionResize(sid, newCols, newRows).catch(() => {})
    }
  } else {
    fitAddon?.fit()
  }
}

function write(data: string) {
  terminal?.write(data)
}

function focus() {
  terminal?.focus()
}

function setRetryOnEnter(value: boolean) {
  retryOnEnter = value
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
    resize()
  }, 400)
}

function onSplitResizeStart() {
  splitResizing = true
}

function onSplitResizeEnd() {
  splitResizing = false
  if (resizeTimer) {
    clearTimeout(resizeTimer)
    resizeTimer = null
  }
  suppressResizeUntil = Date.now() + 200
  nextTick(() => {
    setTimeout(() => {
      void terminalRef.value?.offsetWidth
      resize()
    }, 0)
  })
}

onMounted(() => {
  if (!terminalRef.value) return

  terminal = new Terminal(getTerminalOptions())
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  // Web links addon
  let hoverEl: HTMLDivElement | null = null
  const webLinksAddon = new WebLinksAddon(
    (event, uri) => {
      if (event.ctrlKey || event.metaKey) {
        BrowserOpenURL(uri)
      }
    },
    {
      hover(event, _text, _location) {
        if (!hoverEl) {
          hoverEl = document.createElement('div')
          hoverEl.className = 'xterm-link-tooltip'
          terminal!.element!.appendChild(hoverEl)
        }
        const rect = terminal!.element!.getBoundingClientRect()
        hoverEl.textContent = 'Ctrl + Click to open'
        hoverEl.style.left = (event.clientX - rect.left + 12) + 'px'
        hoverEl.style.top = (event.clientY - rect.top - 28) + 'px'
        hoverEl.style.display = 'block'
      },
      leave() {
        if (hoverEl) {
          hoverEl.style.display = 'none'
        }
      }
    }
  )
  terminal.loadAddon(webLinksAddon)

  terminal.open(terminalRef.value)
  void terminalRef.value.offsetHeight
  fitAddon.fit()

  if (props.mode === 'ssh') {
    // Restore terminal content from session buffer
    const sid = props.sessionId
    if (sid) {
      const history = sessionStore.getData(sid)
      if (history) {
        terminal.write(history)
      }
    }
    // Retry resize multiple times
    ;[100, 300, 600, 1000, 1500].forEach(d => setTimeout(() => resize(), d))
  }

  // Input handling
  terminal.onData((data) => {
    if (props.mode === 'ssh') {
      if (retryOnEnter && (data === '\r' || data === '\n')) {
        retryOnEnter = false
        if (props.onSessionStatus) {
          props.onSessionStatus('retry')
        }
        return
      }
      const sid = props.sessionId
      if (sid) {
        SessionWrite(sid, data)
      }
    } else {
      // SFTP line buffering
      for (let i = 0; i < data.length; i++) {
        const char = data[i]
        const code = data.charCodeAt(i)
        if (char === '\r' || char === '\n') {
          if (inputBuffer) {
            const sid = props.sessionId
            if (sid) {
              for (let j = 0; j < inputBuffer.length; j++) {
                terminal!.write('\b \b')
              }
              SessionWrite(sid, inputBuffer)
            }
            inputBuffer = ''
          }
        } else if (code === 127 || char === '\b') {
          if (inputBuffer.length > 0) {
            inputBuffer = inputBuffer.slice(0, -1)
            terminal!.write('\b \b')
          }
        } else if (code >= 32 && code <= 126) {
          inputBuffer += char
          terminal!.write(char)
        }
      }
    }
  })

  // Selection action: copy on mouse up
  onDocumentMouseUp = () => {
    if (settingsStore.settings.terminal.selectionAction === 'copy') {
      const text = terminal?.getSelection()
      if (text) {
        navigator.clipboard.writeText(text)
      }
    }
  }
  document.addEventListener('mouseup', onDocumentMouseUp)

  // Session data
  unsubscribe = EventsOn('session:data', (payload: { id: string; data: string }) => {
    if (payload.id !== props.sessionId || !terminal) return
    if (props.mode === 'sftp') {
      const cleaned = payload.data.replace(/\x1b\]633;S[^\x07]*\x07/g, '')
      if (cleaned) {
        terminal.write(cleaned)
      }
    } else {
      terminal.write(payload.data)
      if (props.mode === 'ssh' && props.onSessionStatus) {
        // onSessionData is handled by the consumer via EventsOn if needed
      }
    }
  })

  // SSH: session status events
  if (props.mode === 'ssh') {
    retryOnEnter = false
    statusUnsubscribe = EventsOn('session:status', (payload: { id: string; status: string }) => {
      if (payload.id !== props.sessionId) return
      if (payload.status === 'connected') {
        retryOnEnter = false
        if (props.onSessionStatus) {
          props.onSessionStatus(payload.status)
        }
        resize()
      } else if (payload.status === 'error') {
        retryOnEnter = true
        if (props.onSessionStatus) {
          props.onSessionStatus(payload.status)
        }
        terminal?.write('\r\n\x1b[31mConnection failed. Press Enter to retry.\x1b[0m\r\n')
      } else {
        if (props.onSessionStatus) {
          props.onSessionStatus(payload.status)
        }
      }
    })
  }

  window.addEventListener('resize', onWindowResize)
  window.addEventListener('split:resize-start', onSplitResizeStart)
  window.addEventListener('split:resize-end', onSplitResizeEnd)

  resizeObserver = new ResizeObserver(() => {
    if (isResizing || splitResizing || Date.now() < suppressResizeUntil) return
    const el = terminalRef.value
    if (!el) return
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => resize(), 150)
  })
  resizeObserver.observe(terminalRef.value)

  if (props.mode === 'ssh') {
    intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          resize()
        }
      })
    })
    intersectionObserver.observe(terminalRef.value)
  }
})

// Watch sessionId changes to rebind session data
watch(() => props.sessionId, (newId) => {
  if (newId && terminal && props.mode === 'ssh') {
    const history = sessionStore.getData(newId)
    if (history) {
      terminal.write(history)
    }
    const delays = [200, 400, 600, 800, 1000, 1500, 2000]
    delays.forEach((delay) => {
      setTimeout(() => resize(), delay)
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
  resize()
}, { deep: true })

onUnmounted(() => {
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
  terminal?.dispose()
  unsubscribe?.()
  statusUnsubscribe?.()
  if (onDocumentMouseUp) {
    document.removeEventListener('mouseup', onDocumentMouseUp)
    onDocumentMouseUp = null
  }
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('split:resize-start', onSplitResizeStart)
  window.removeEventListener('split:resize-end', onSplitResizeEnd)
})

// Paste handling
function pasteToTerminal(text: string) {
  if (props.mode === 'sftp' && terminal) {
    for (const char of text) {
      const code = char.charCodeAt(0)
      if (code >= 32 && code <= 126) {
        inputBuffer += char
        terminal.write(char)
      }
    }
  }
}

async function pasteToSession(text: string) {
  if (props.mode === 'ssh') {
    const sid = props.sessionId
    if (sid) {
      SessionWrite(sid, text)
    }
  }
}

const menu = useTerminalMenu({
  getSelection,
  onPaste: async (text) => {
    if (props.mode === 'ssh') {
      await pasteToSession(text)
    } else {
      pasteToTerminal(text)
    }
  },
  onAskAI: (text) => {
    window.dispatchEvent(new CustomEvent('ai:ask', { detail: text }))
  },
})

defineExpose({
  getSelection,
  resize,
  focus,
  write,
  setRetryOnEnter,
})
</script>

<style scoped>
.base-terminal {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.terminal-area {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.terminal-area :deep(.xterm) {
  width: 100%;
  height: 100%;
  display: block;
}
.terminal-area :deep(.xterm),
.terminal-area :deep(.xterm-viewport) {
  background: var(--bg-base);
}
.terminal-area :deep(.xterm-viewport) {
  overflow-y: scroll !important;
}
.terminal-area :deep(.xterm-viewport::-webkit-scrollbar) {
  width: 5px;
}
.terminal-area :deep(.xterm-viewport::-webkit-scrollbar-track) {
  background: transparent;
}
.terminal-area :deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
}
.terminal-area :deep(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
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
