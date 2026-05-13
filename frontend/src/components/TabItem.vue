<template>
  <div
    class="tab-item"
    :data-tab-id="tabId"
    :class="{ active: isActive, foreground: isForeground, error: status === 'error', 'ai-locked': aiLocked }"
    draggable="true"
    @click="$emit('activate')"
    @dragstart="onDragStart"
    @dragend="$emit('dragend')"
    @contextmenu="onContextMenu"
  >
    <span class="tab-title">{{ title }}</span>
    <button
      v-if="type === 'ssh'"
      draggable="false"
      class="tab-ai"
      :class="{ locked: aiLocked }"
      @click.stop="onToggleLock"
      @mousedown.stop
      :title="aiLocked ? 'AI已锁定到此终端' : '锁定AI到此终端'"
    >AI</button>
    <button
      draggable="false"
      class="tab-close"
      @click.stop="$emit('close')"
      @mousedown.stop
    >
      <el-icon><Close /></el-icon>
    </button>

    <Teleport to="body">
      <div
        v-show="contextMenuVisible"
        ref="menuRef"
        class="tab-context-menu"
        :style="contextMenuStyle"
        @click.stop
      >
        <div class="menu-item" @click="duplicate">{{ t('tab.duplicate') }}</div>
        <div class="menu-divider" />
        <div class="menu-item" @click="closeRight">{{ t('tab.closeRight') }}</div>
        <div class="menu-item" @click="closeLeft">{{ t('tab.closeLeft') }}</div>
        <div class="menu-item" @click="closeOther">{{ t('tab.closeOther') }}</div>
        <div class="menu-divider" />
        <div class="menu-item" @click="closeTab">{{ t('tab.close') }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Close } from '@element-plus/icons-vue'
import { useI18n } from '../i18n'
import { useTabStore } from '../stores/tabStore'
import type { SessionStatus } from '../types/session'

const { t } = useI18n()
const tabStore = useTabStore()

const props = defineProps<{
  title: string
  isActive: boolean
  isForeground: boolean
  status: SessionStatus
  tabId: string
  type: 'ssh' | 'settings'
  aiLocked: boolean
}>()

const emit = defineEmits([
  'activate',
  'close',
  'dragstart',
  'dragend',
  'split',
  'duplicate',
  'close-right',
  'close-left',
  'close-other'
])

const contextMenuVisible = ref(false)
const contextMenuStyle = ref({ left: '0px', top: '0px' })

function onDragStart(e: DragEvent) {
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', props.tabId)
    e.dataTransfer.effectAllowed = 'move'
  }
  emit('dragstart', props.tabId)
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

onMounted(() => {
  window.addEventListener('global:close-context-menus', closeContextMenu)
  document.addEventListener('click', closeContextMenu)
})

onUnmounted(() => {
  window.removeEventListener('global:close-context-menus', closeContextMenu)
  document.removeEventListener('click', closeContextMenu)
})

function duplicate() {
  emit('duplicate')
  closeContextMenu()
}

function closeRight() {
  emit('close-right')
  closeContextMenu()
}

function closeLeft() {
  emit('close-left')
  closeContextMenu()
}

function closeOther() {
  emit('close-other')
  closeContextMenu()
}

function closeTab() {
  emit('close')
  closeContextMenu()
}

function onToggleLock() {
  tabStore.toggleAILock(props.tabId)
}
</script>

<style scoped>
.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 30px;
  font-size: 11px;
  font-family: var(--font-ui);
  background: transparent;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  cursor: pointer;
  user-select: none;
  min-width: 100px;
  max-width: 180px;
  color: var(--text-muted);
  transition: all 0.12s ease;
  position: relative;
}

.tab-item:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.tab-item.active {
  background: var(--bg-base);
  color: var(--text-primary);
}

.tab-item.active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 8px;
  right: 8px;
  height: 2px;
  background: var(--accent);
  border-radius: 0 0 2px 2px;
  box-shadow: 0 0 8px var(--accent-glow);
}

.tab-item.error .tab-title {
  color: var(--error);
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  text-align: center;
}

.tab-close,
.tab-ai {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: var(--text-secondary);
  cursor: pointer;
  opacity: 0.45;
  transition: all 0.1s ease;
  box-sizing: border-box;
  height: 16px;
}

.tab-close {
  width: 16px;
}

.tab-close .el-icon {
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-item:hover .tab-close {
  opacity: 1;
  color: var(--text-primary);
}

.tab-close:hover {
  background: var(--bg-active);
  color: var(--error);
}

.tab-item.foreground .tab-close,
.tab-item.active .tab-close {
  opacity: 0.7;
}

.tab-item.active .tab-close:hover {
  opacity: 1;
}

.tab-item.ai-locked {
  box-shadow: inset 3px 0 0 var(--warning, #f59e0b);
}

.tab-item.ai-locked .tab-ai {
  opacity: 1;
  color: var(--warning, #f59e0b);
}

/* Foreground: visible in pane but not globally active */
.tab-item.foreground {
  background: var(--bg-surface);
  color: var(--text-secondary);
}

.tab-item.foreground::before {
  content: '';
  position: absolute;
  top: 0;
  left: 8px;
  right: 8px;
  height: 2px;
  background: var(--border-subtle);
  border-radius: 0 0 2px 2px;
}

.tab-ai {
  min-width: 22px;
  padding: 0 3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.tab-item:hover .tab-ai {
  opacity: 1;
  color: var(--text-primary);
}

.tab-ai:hover {
  background: var(--bg-active);
}

.tab-item.foreground .tab-ai,
.tab-item.active .tab-ai {
  opacity: 0.7;
}

.tab-item.foreground .tab-ai:hover,
.tab-item.active .tab-ai:hover {
  opacity: 1;
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
