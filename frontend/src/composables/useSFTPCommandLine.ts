import { ref, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { SessionWrite } from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime'

export interface UseSFTPCommandLineReturn {
  terminalRef: Ref<HTMLDivElement | undefined>
  terminal: Terminal | null
  write: (data: string) => void
  resize: () => void
  focus: () => void
}

export function useSFTPCommandLine(
  getSessionId: () => string | null | undefined
): UseSFTPCommandLineReturn {
  const terminalRef = ref<HTMLDivElement>()
  let terminal: Terminal | null = null
  let fitAddon: FitAddon | null = null
  let resizeObserver: ResizeObserver | null = null
  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    if (!terminalRef.value) return

    terminal = new Terminal({
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: 'var(--bg-base)',
        foreground: 'var(--text-primary)',
        cursor: 'var(--accent)',
        selectionBackground: 'rgba(34, 211, 238, 0.2)',
      },
      cursorBlink: true,
      scrollback: 2500,
    })

    fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(terminalRef.value)
    fitAddon.fit()

    terminal.onData((data) => {
      const sid = getSessionId()
      if (sid) {
        SessionWrite(sid, data)
      }
    })

    unsubscribe = EventsOn('session:data', (payload: { id: string; data: string }) => {
      const sid = getSessionId()
      if (payload.id === sid && terminal) {
        // Filter out OSC 633 sequences (SFTP structured data)
        const cleaned = payload.data.replace(/\x1b\]633;S[^\x07]*\x07/g, '')
        if (cleaned) {
          terminal.write(cleaned)
        }
      }
    })

    resizeObserver = new ResizeObserver(() => {
      fitAddon?.fit()
    })
    resizeObserver.observe(terminalRef.value)
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
    terminal?.dispose()
    unsubscribe?.()
  })

  return {
    terminalRef,
    terminal,
    write: (data: string) => terminal?.write(data),
    resize: () => fitAddon?.fit(),
    focus: () => terminal?.focus(),
  }
}
