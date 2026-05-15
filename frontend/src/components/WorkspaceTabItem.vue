<template>
  <div
    class="workspace-tab-item"
    :class="{ active: isActive, 'ai-locked': hasAILockedPanel }"
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
    <span v-if="hasAILockedPanel" class="tab-ai-lock locked" title="AI locked to a panel in this workspace">AI</span>
    <button
      v-if="isActive || showClose"
      class="tab-close"
      @click.stop="$emit('close', tab.id)"
    >×</button>

    <!-- Context menu -->
    <Teleport to="body">
      <div
        v-show="contextMenuVisible"
        ref="menuRef"
        class="tab-context-menu"
        :style="contextMenuStyle"
        @click.stop
      >
        <div class="menu-item" @click="startEdit">{{ t('tab.rename') }}</div>
        <div class="menu-divider" />
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
import { useI18n } from '../i18n'
import type { WorkspaceTab } from '../types/workspace'

const props = defineProps<{
  tab: WorkspaceTab
  isActive: boolean
  showClose?: boolean
}>()

const emit = defineEmits<{
  activate: [id: string]
  close: [id: string]
}>()

const tabStore = useTabStore()
const { t } = useI18n()

const hasAILockedPanel = computed(() => {
  if (!tabStore.aiLockedPanelId) return false
  return props.tab.panelIds.includes(tabStore.aiLockedPanelId)
})

const contextMenuVisible = ref(false)
const contextMenuStyle = ref({ left: '0px', top: '0px' })

const editing = ref(false)
const editName = ref('')
const editInputRef = ref<HTMLInputElement>()

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('application/tab-id', props.tab.id)
  e.dataTransfer?.setData('application/workspace-id', props.tab.id)
  e.dataTransfer?.setData('application/tab-type', 'workspace')
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
  const tabs = tabStore.tabs
  const currentIdx = tabs.findIndex(t => t.id === props.tab.id)
  const others = tabs.filter((_, i) => i !== currentIdx)
  others.forEach(t => emit('close', t.id))
  closeContextMenu()
}

function closeRight() {
  const tabs = tabStore.tabs
  const currentIdx = tabs.findIndex(t => t.id === props.tab.id)
  tabs.slice(currentIdx + 1).forEach(t => emit('close', t.id))
  closeContextMenu()
}

function closeLeft() {
  const tabs = tabStore.tabs
  const currentIdx = tabs.findIndex(t => t.id === props.tab.id)
  tabs.slice(0, currentIdx).forEach(t => emit('close', t.id))
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
.workspace-tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  user-select: none;
  border-bottom: 2px solid transparent;
  position: relative;
}
.workspace-tab-item.active {
  border-bottom-color: var(--accent);
  background: var(--bg-surface);
}
.workspace-tab-item.ai-locked {
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
  width: 140px;
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
.workspace-tab-item:hover .tab-ai-lock,
.workspace-tab-item.active .tab-ai-lock,
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
