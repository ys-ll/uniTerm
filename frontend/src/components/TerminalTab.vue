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
import { SessionWrite, CreateSession } from '../../wailsjs/go/main/App'
import { useTabStore } from '../stores/tabStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useI18n } from '../i18n'
import { useTerminal } from '../composables/useTerminal'
import type { Tab } from '../types/session'

const props = defineProps<{
  tab: Tab
}>()

const tabStore = useTabStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()

const menuRef = ref<HTMLDivElement>()
const menuVisible = ref(false)
const menuStyle = ref({ left: '0px', top: '0px' })
const hasSelection = ref(false)

const { terminalRef, terminal, resize, getSelection } = useTerminal(
  () => props.tab.sessionId,
  {
    onSessionStatus: (status) => {
      if (status === 'retry') {
        retryConnection()
      }
    }
  }
)

async function retryConnection() {
  if (!props.tab.config) return
  terminal?.write('\r\n\x1b[33mReconnecting...\x1b[0m\r\n')
  try {
    const info = await CreateSession(props.tab.type, props.tab.config)
    const t = tabStore.tabs.find(x => x.id === props.tab.id)
    if (t) {
      t.sessionId = info.id
    }
    // sessionStore.initSession is handled by the caller or event listeners
  } catch (e: any) {
    terminal?.write(`\r\n\x1b[31mReconnect failed: ${e}\x1b[0m\r\n`)
  }
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
  hasSelection.value = !!getSelection()
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
  const text = getSelection()
  if (text) {
    navigator.clipboard.writeText(text)
  }
  closeMenu()
}

async function copyAndPaste() {
  const text = getSelection()
  if (text) {
    await navigator.clipboard.writeText(text)
    if (props.tab.sessionId) {
      SessionWrite(props.tab.sessionId, text)
    }
  }
  closeMenu()
}

async function askAI() {
  const text = getSelection()
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

// Keep sessionId watcher in component for retry resize timing
watch(() => props.tab.sessionId, (newId) => {
  if (newId) {
    // Retry resize multiple times with longer delays to ensure backend Connect is ready
    const delays = [200, 400, 600, 800, 1000, 1500, 2000]
    delays.forEach((delay) => {
      setTimeout(() => resize(), delay)
    })
  }
})

onMounted(() => {
  window.addEventListener('global:close-context-menus', closeMenu)
  document.addEventListener('click', closeMenu)
})

onUnmounted(() => {
  window.removeEventListener('global:close-context-menus', closeMenu)
  document.removeEventListener('click', closeMenu)
})
</script>

<style scoped>
.terminal-tab {
  width: 100%;
  height: 100%;
  padding: 0;
  background: var(--bg-base);
  overflow: hidden;
  user-select: text;
  -webkit-user-select: text;
}

/* Ensure xterm fills the container so FitAddon measures correctly */
.terminal-tab :deep(.xterm) {
  width: 100%;
  height: 100%;
  display: block;
}

/* Ensure xterm fill matches terminal background */
.terminal-tab :deep(.xterm),
.terminal-tab :deep(.xterm-viewport) {
  background: var(--bg-base);
}

/* Hide terminal content during window resize — handled globally in style.css */

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
