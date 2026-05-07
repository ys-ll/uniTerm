<template>
  <div ref="terminalRef" class="terminal-tab"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { SessionWrite } from '../../wailsjs/go/main/App'
import { useSessionStore } from '../stores/sessionStore'
import type { Tab } from '../types/session'

const props = defineProps<{
  tab: Tab
}>()

const terminalRef = ref<HTMLDivElement>()
const sessionStore = useSessionStore()
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null

onMounted(() => {
  if (!terminalRef.value) return

  terminal = new Terminal({
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    theme: {
      background: '#1e1e1e',
      foreground: '#e0e0e0'
    },
    cursorBlink: true
  })

  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(terminalRef.value)
  fitAddon.fit()

  // Send input to backend
  terminal.onData((data) => {
    SessionWrite(props.tab.sessionId, data)
  })

  // Watch for backend data
  watch(
    () => sessionStore.sessions.get(props.tab.sessionId)?.data,
    () => {
      const data = sessionStore.getData(props.tab.sessionId)
      if (data && terminal) {
        terminal.write(data)
      }
    },
    { deep: true }
  )

  // Handle resize
  const resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit()
  })
  resizeObserver.observe(terminalRef.value)

  onUnmounted(() => {
    resizeObserver.disconnect()
    terminal?.dispose()
  })
})
</script>

<style scoped>
.terminal-tab {
  width: 100%;
  height: 100%;
  padding: 4px;
}
</style>
