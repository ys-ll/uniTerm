<template>
  <div
    class="tab-item"
    :class="{ active: isActive, 'ai-locked': isAILocked }"
    @click="$emit('activate', tab.id)"
    draggable="true"
    @dragstart="onDragStart"
    @contextmenu="onContextMenu"
  >
    <span v-if="!editing" class="tab-name" @dblclick.stop="startEdit">{{ tab.name }}</span>
    <input
      v-else
      ref="editInputRef"
      v-model="editName"
      class="tab-name-input"
      @keydown.enter="confirmEdit"
      @keydown.escape="cancelEdit"
      @blur="confirmEdit"
      @click.stop
    />
    <button
      v-if="tab.type === 'terminal'"
      class="tab-ai-lock"
      :class="{ locked: isAILocked }"
      @click.stop="$emit('toggleAiLock', tab.panelId)"
      :title="isAILocked ? 'AI locked' : 'Lock AI'"
    >AI</button>
    <button
      v-if="isActive || showClose"
      class="tab-close"
      @click.stop="$emit('close', tab.id)"
    >×</button>

    <Teleport to="body">
      <div
        v-show="contextMenuVisible"
        ref="menuRef"
        class="tab-context-menu"
        :style="contextMenuStyle"
        @click.stop
      >
        <div v-if="tab.type === 'terminal'" class="menu-item" @click="duplicateTab">{{ t('tab.duplicate') }}</div>
        <div v-if="tab.type === 'terminal'" class="menu-item" @click="startEdit">{{ t('tab.rename') }}</div>
        <div v-if="tab.type === 'terminal'" class="menu-divider" />
        <div class="menu-item" @click="closeTab">{{ t('tab.close') }}</div>
        <div class="menu-item" @click="closeOther">{{ t('tab.closeOther') }}</div>
        <div class="menu-item" @click="closeRight">{{ t('tab.closeRight') }}</div>
        <div class="menu-item" @click="closeLeft">{{ t('tab.closeLeft') }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useTabStore } from '../stores/tabStore'
import { usePanelStore } from '../stores/panelStore'
import { useI18n } from '../i18n'
import { CreateSession } from '../../wailsjs/go/main/App'
import type { TerminalTab, SettingsTab, SFTPTab } from '../types/workspace'

const props = defineProps<{
  tab: TerminalTab | SettingsTab | SFTPTab
  isActive: boolean
  showClose?: boolean
}>()

const emit = defineEmits<{
  activate: [id: string]
  close: [id: string]
  toggleAiLock: [panelId: string]
}>()

const tabStore = useTabStore()
const panelStore = usePanelStore()
const { t } = useI18n()

const contextMenuVisible = ref(false)
const contextMenuStyle = ref({ left: '0px', top: '0px' })

const editing = ref(false)
const editName = ref('')
const editInputRef = ref<HTMLInputElement>()

const isAILocked = computed(() => {
  if (props.tab.type !== 'terminal') return false
  return tabStore.aiLockedPanelId === props.tab.panelId
})

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('application/tab-id', props.tab.id)
  if (props.tab.type === 'terminal') {
    e.dataTransfer?.setData('application/tab-type', 'terminal')
  }
  if (props.tab.type === 'sftp') {
    e.dataTransfer?.setData('application/tab-type', 'sftp')
  }
  if (props.isActive) {
    e.dataTransfer?.setData('application/is-active-tab', '1')
  }
  e.dataTransfer!.effectAllowed = 'move'
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  window.dispatchEvent(new CustomEvent('global:close-context-menus'))
  contextMenuStyle.value = { left: e.clientX + 'px', top: e.clientY + 'px' }
  contextMenuVisible.value = true
}

function closeContextMenu() {
  contextMenuVisible.value = false
}

function startEdit() {
  closeContextMenu()
  editName.value = props.tab.name
  editing.value = true
  nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
  })
}

function confirmEdit() {
  if (!editing.value) return
  editing.value = false
  const newName = editName.value.trim()
  if (newName && newName !== props.tab.name) {
    tabStore.renameTab(props.tab.id, newName)
  }
}

function cancelEdit() {
  editing.value = false
}

function closeTab() {
  emit('close', props.tab.id)
  closeContextMenu()
}

function closeOther() {
  const allTabs = tabStore.tabs
  const currentIdx = allTabs.findIndex(t => t.id === props.tab.id)
  const others = allTabs.filter((_, i) => i !== currentIdx)
  others.forEach(t => emit('close', t.id))
  closeContextMenu()
}

function closeRight() {
  const allTabs = tabStore.tabs
  const currentIdx = allTabs.findIndex(t => t.id === props.tab.id)
  allTabs.slice(currentIdx + 1).forEach(t => emit('close', t.id))
  closeContextMenu()
}

function closeLeft() {
  const allTabs = tabStore.tabs
  const currentIdx = allTabs.findIndex(t => t.id === props.tab.id)
  allTabs.slice(0, currentIdx).forEach(t => emit('close', t.id))
  closeContextMenu()
}

async function duplicateTab() {
  const panel = panelStore.getPanel(props.tab.panelId)
  if (!panel) return
  const newPanel = panelStore.createPanel(panel.config, panel.type)
  newPanel.title = panel.title
  const newTab = tabStore.createTerminalTab(panel.title, newPanel.id)
  panelStore.movePanelToTab(newPanel.id, newTab.id)
  if (panel.config) {
    try {
      const info = await CreateSession(panel.config.type, panel.config)
      panelStore.bindSession(newPanel.id, info.id)
    } catch (e) {
      console.error('Failed to duplicate session:', e)
    }
  }
  closeContextMenu()
}

onMounted(() => {
  window.addEventListener('global:close-context-menus', closeContextMenu)
  document.addEventListener('click', closeContextMenu)
})

onUnmounted(() => {
  window.removeEventListener('global:close-context-menus', closeContextMenu)
  document.removeEventListener('click', closeContextMenu)
})
</script>

<style scoped>
.tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  user-select: none;
  border-bottom: 2px solid transparent;
  position: relative;
}
.tab-item.active {
  border-bottom-color: var(--accent);
  background: var(--bg-surface);
}
.tab-item.ai-locked {
  box-shadow: inset 3px 0 0 var(--warning, #f59e0b);
}
.tab-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab-name-input {
  font-size: 13px;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--bg-base);
  border: 1px solid var(--accent-dim);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  width: 120px;
  outline: none;
}
.tab-ai-lock {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  opacity: 0;
}
.tab-item:hover .tab-ai-lock,
.tab-item.active .tab-ai-lock,
.tab-ai-lock.locked {
  opacity: 1;
}
.tab-ai-lock:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.tab-ai-lock.locked {
  color: var(--warning, #f59e0b);
}
.tab-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
}
.tab-close:hover {
  color: var(--text-primary);
}
</style>

<style>
.tab-context-menu {
  position: fixed;
  z-index: 99999;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  min-width: 180px;
  padding: 4px;
  backdrop-filter: blur(8px);
}
.tab-context-menu .menu-item {
  padding: 7px 14px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  border-radius: var(--radius-sm);
  transition: all 0.1s ease;
}
.tab-context-menu .menu-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.tab-context-menu .menu-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px 6px;
}
</style>
