<template>
  <div
    class="panel"
    :class="{ 'panel-active': isActive }"
    draggable="true"
    @dragstart="$emit('dragstart', $event)"
  >
    <div v-if="showHeader" class="panel-header" :class="{ 'ai-locked': isAILocked }" @dblclick.stop>
      <span class="panel-title">{{ panel.title }}</span>
      <div class="panel-header-actions">
        <button
          v-if="panel.type === 'ssh'"
          class="panel-ai-lock"
          :class="{ locked: isAILocked }"
          @click.stop="$emit('toggleAiLock', panel.id)"
          :title="isAILocked ? 'AI locked to this panel' : 'Lock AI to this panel'"
        >AI</button>
        <button class="panel-close" @click.stop="$emit('close', panel.id)">×</button>
      </div>
    </div>
    <div ref="terminalRef" class="panel-terminal" @contextmenu="onContextMenu"></div>

    <!-- Terminal context menu -->
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { useTerminal } from '../composables/useTerminal'
import { useSettingsStore } from '../stores/settingsStore'
import { useTabStore } from '../stores/tabStore'
import { usePanelStore } from '../stores/panelStore'
import { useSessionStore } from '../stores/sessionStore'
import { useI18n } from '../i18n'
import { SessionWrite, CreateSession } from '../../wailsjs/go/main/App'
import type { Panel } from '../types/workspace'

const props = defineProps<{
  panel: Panel
  showHeader: boolean
  isActive: boolean
}>()

const emit = defineEmits<{
  close: [panelId: string]
  dragstart: [e: DragEvent]
  toggleAiLock: [panelId: string]
}>()

const settingsStore = useSettingsStore()
const tabStore = useTabStore()
const { t } = useI18n()

const menuRef = ref<HTMLDivElement>()
const menuVisible = ref(false)
const menuStyle = ref({ left: '0px', top: '0px' })
const hasSelection = ref(false)

const panelStore = usePanelStore()
const sessionStore = useSessionStore()
const isAILocked = computed(() =>
  tabStore.aiLockedPanelId === props.panel.id
)

let needsRetry = false

const { terminalRef, terminal, resize, getSelection } = useTerminal(
  () => props.panel.sessionId,
  {
    onSessionStatus: (status) => {
      if (status === 'error') {
        needsRetry = true
      } else if (status === 'connected') {
        needsRetry = false
      } else if (status === 'retry') {
        retryConnection()
      }
    }
  }
)

async function retryConnection() {
  if (!props.panel.config) return
  terminal?.write('\r\n\x1b[33mReconnecting...\x1b[0m\r\n')
  try {
    const info = await CreateSession(props.panel.config.type, props.panel.config)
    panelStore.bindSession(props.panel.id, info.id)
    sessionStore.initSession(info.id)
    needsRetry = false
  } catch (e: any) {
    terminal?.write(`\r\n\x1b[31mReconnect failed: ${e}\x1b[0m\r\n`)
    needsRetry = true
  }
}

function closeMenu() {
  menuVisible.value = false
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
    if (props.panel.sessionId) {
      SessionWrite(props.panel.sessionId, text)
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
    if (text && props.panel.sessionId) {
      SessionWrite(props.panel.sessionId, text)
    }
  } catch {
    // clipboard read failed
  }
  closeMenu()
}

// Watch panel sessionId changes and retry resize
watch(() => props.panel.sessionId, (newId) => {
  if (newId) {
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
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-base);
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  cursor: grab;
}
.panel-header:active {
  cursor: grabbing;
}
.panel-active .panel-header {
  background: var(--bg-elevated);
  border-bottom-color: var(--accent-dim);
}
.panel-header.ai-locked {
  border-left: 3px solid var(--warning, #f59e0b);
  box-shadow: inset 0 0 12px rgba(245, 158, 11, 0.12);
}
.panel-title {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel-active .panel-title {
  color: var(--text-primary);
}
.panel-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.panel-ai-lock {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
}
.panel-ai-lock:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.panel-ai-lock.locked {
  color: var(--warning, #f59e0b);
}
.panel-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
}
.panel-close:hover {
  color: var(--text-primary);
}
.panel-terminal {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.panel-terminal :deep(.xterm) {
  width: 100%;
  height: 100%;
  display: block;
}
.panel-terminal :deep(.xterm),
.panel-terminal :deep(.xterm-viewport) {
  background: var(--bg-base);
}
.panel-terminal :deep(.xterm-viewport) {
  overflow-y: scroll !important;
}
.panel-terminal :deep(.xterm-viewport::-webkit-scrollbar) {
  width: 5px;
}
.panel-terminal :deep(.xterm-viewport::-webkit-scrollbar-track) {
  background: transparent;
}
.panel-terminal :deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
}
.panel-terminal :deep(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
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
