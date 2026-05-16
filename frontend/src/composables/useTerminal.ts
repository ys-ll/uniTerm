import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { Ref } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { SessionWrite, SessionResize } from '../../wailsjs/go/main/App'
import { EventsOn, BrowserOpenURL } from '../../wailsjs/runtime'
import { useSettingsStore } from '../stores/settingsStore'
import { useSessionStore } from '../stores/sessionStore'

export interface UseTerminalOptions {
  onSessionData?: (data: string) => void
  onSessionStatus?: (status: string) => void
}

export interface UseTerminalReturn {
  terminalRef: Ref<HTMLDivElement | undefined>
  terminal: Terminal | null
  fitAddon: FitAddon | null
  write: (data: string) => void
  resize: () => void
  getSelection: () => string
  clear: () => void
  focus: () => void
  setRetryOnEnter: (value: boolean) => void
}

export function getXtermTheme(name: string): any {
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

export function useTerminal(
  getSessionId: () => string | null | undefined,
  options?: UseTerminalOptions
): UseTerminalReturn {
  const settingsStore = useSettingsStore()
  const sessionStore = useSessionStore()

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

  function resize() {
    const sessionId = getSessionId()
    if (!terminal || !fitAddon || !sessionId) return
    const el = terminalRef.value
    if (!el) return

    // Use getBoundingClientRect to get actual rendered size (bypasses
    // getComputedStyle caching issues during flex shrink).
    const rect = el.getBoundingClientRect()

    // Read xterm's internally-measured character dimensions.
    // Use try/catch because these are internal APIs that may change between versions.
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
      // Fallback to FitAddon if char dims aren't ready yet.
      fitAddon.fit()
      if (terminal.cols <= 0 || terminal.rows <= 0) return
      SessionResize(sessionId, terminal.cols, terminal.rows).catch(() => {})
      return
    }

    // Use the container's actual rendered size (rect) to compute cols/rows.
    // terminal.element's clientWidth may not shrink when the container shrinks
    // because xterm's internal screen/canvas width can hold it at the old size.
    const cols = Math.floor(rect.width / cellWidth)
    const rows = Math.floor(rect.height / cellHeight)
    const newCols = Math.max(2, cols)
    const newRows = Math.max(1, rows)

    if (terminal.cols !== newCols || terminal.rows !== newRows) {
      terminal.resize(newCols, newRows)
      SessionResize(sessionId, newCols, newRows).catch(() => {})
    }
  }

  function write(data: string) {
    terminal?.write(data)
  }

  function getSelection(): string {
    return terminal?.getSelection() || ''
  }

  function clear() {
    terminal?.clear()
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
        // Force layout so getComputedStyle returns up-to-date dimensions
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
    // Register web links addon: underline http/https links, Ctrl+Click to open
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
    // Force synchronous layout so grid rows are sized before xterm measures
    void terminalRef.value.offsetHeight
    fitAddon.fit()

    // Restore terminal content from session buffer after tab move/merge
    const sessionId = getSessionId()
    if (sessionId) {
      const history = sessionStore.getData(sessionId)
      if (history) {
        terminal.write(history)
      }
    }

    // Retry resize: after a tab move/merge the layout may not be stable yet,
    // so fitAddon.fit() can compute 0 cols/rows and skip SessionResize.
    ;[100, 300, 600, 1000, 1500].forEach(d => setTimeout(() => resize(), d))

    terminal.onData((data) => {
      if (retryOnEnter && (data === '\r' || data === '\n')) {
        retryOnEnter = false
        if (options?.onSessionStatus) {
          options.onSessionStatus('retry')
        }
        return
      }
      const sid = getSessionId()
      if (sid) {
        SessionWrite(sid, data)
      }
    })

    // Selection action: copy on mouse up (document-level so it works
    // even when the mouse is released outside the terminal element)
    onDocumentMouseUp = () => {
      if (settingsStore.settings.terminal.selectionAction === 'copy') {
        const text = terminal?.getSelection()
        if (text) {
          navigator.clipboard.writeText(text)
        }
      }
    }
    document.addEventListener('mouseup', onDocumentMouseUp)

    unsubscribe = EventsOn('session:data', (payload: { id: string; data: string }) => {
      const sid = getSessionId()
      if (payload.id === sid && terminal) {
        terminal.write(payload.data)
        if (options?.onSessionData) {
          options.onSessionData(payload.data)
        }
      }
    })

    retryOnEnter = false
    statusUnsubscribe = EventsOn('session:status', (payload: { id: string; status: string }) => {
      const sid = getSessionId()
      if (payload.id !== sid) return
      if (payload.status === 'connected') {
        retryOnEnter = false
        if (options?.onSessionStatus) {
          options.onSessionStatus(payload.status)
        }
        resize()
      } else if (payload.status === 'error') {
        retryOnEnter = true
        if (options?.onSessionStatus) {
          options.onSessionStatus(payload.status)
        }
        terminal?.write('\r\n\x1b[31mConnection failed. Press Enter to retry.\x1b[0m\r\n')
      } else {
        if (options?.onSessionStatus) {
          options.onSessionStatus(payload.status)
        }
      }
    })

    window.addEventListener('resize', onWindowResize)
    window.addEventListener('split:resize-start', onSplitResizeStart)
    window.addEventListener('split:resize-end', onSplitResizeEnd)

    // Also handle container-only resize (AI sidebar drag, etc.)
    resizeObserver = new ResizeObserver(() => {
      if (isResizing || splitResizing || Date.now() < suppressResizeUntil) return
      const el = terminalRef.value
      if (!el) return
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => resize(), 150)
    })
    resizeObserver.observe(terminalRef.value)

    intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          resize()
        }
      })
    })
    intersectionObserver.observe(terminalRef.value)
  })

  // Watch sessionId changes to rebind session data
  watch(() => getSessionId(), (newId) => {
    if (newId && terminal) {
      // Restore buffered session data that arrived before bindSession
      const history = sessionStore.getData(newId)
      if (history) {
        terminal.write(history)
      }
      // Retry resize multiple times with longer delays to ensure backend Connect is ready
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

  return {
    terminalRef,
    terminal,
    fitAddon,
    write,
    resize,
    getSelection,
    clear,
    focus,
    setRetryOnEnter
  }
}
