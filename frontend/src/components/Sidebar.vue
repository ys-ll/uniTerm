<template>
  <div
    ref="sidebarEl"
    class="sidebar"
    :class="{ collapsed: !visible, resizing: isResizing }"
    :style="{ width: sidebarWidth + 'px' }"
  >
    <div class="resize-handle" @mousedown="onResizeStart" />
    <div class="sidebar-header">
      <span class="header-label">{{ t('sidebar.title') }}</span>
      <div class="header-actions">
        <button class="icon-btn" @click="openNewForm" :title="t('sidebar.newConnection')">
          <el-icon><Plus /></el-icon>
        </button>
        <button class="icon-btn" @click="emit('toggle')" :title="t('sidebar.collapse')">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </div>

    <div class="search-box">
      <el-input
        v-model="searchQuery"
        :placeholder="t('sidebar.searchPlaceholder')"
        clearable
        @keydown="onListKeydown"
      />
    </div>

    <div class="connection-list" tabindex="0" @keydown="onListKeydown">
      <div
        v-for="conn in filteredConnections"
        :key="conn.id"
        class="connection-item"
        :class="{ active: selectedId === conn.id }"
        @click="onItemClick(conn)"
        @dblclick="onItemDblClick(conn)"
        @contextmenu.prevent="onContextMenu($event, conn)"
      >
        <div class="conn-indicator" :class="{ connected: conn.status === 'connected' }" />
        <div class="conn-details">
          <span class="name">{{ conn.name }}</span>
          <span class="host">{{ conn.user }}@{{ conn.host }}:{{ conn.port }}</span>
        </div>
      </div>
      <div v-if="filteredConnections.length === 0 && connectionStore.connections.length > 0" class="empty-state">
        {{ t('sidebar.noSearchResults') }}
      </div>
      <div v-if="connectionStore.connections.length === 0" class="empty-state">
        {{ t('sidebar.noConnections') }}
      </div>
    </div>

    <ConnectionForm v-model="showForm" :edit-config="editConfig" @save="onSave" @connect="onConnectFromForm" />

    <Teleport to="body">
      <div
        v-show="menuVisible"
        ref="menuRef"
        class="conn-context-menu"
        :style="menuStyle"
        @click.stop
      >
        <div class="menu-item" @click="doConnect">{{ t('sidebar.connect') }}</div>
        <div class="menu-item" @click="doConnectSFTP">Connect SFTP</div>
        <div class="menu-divider" />
        <div class="menu-item" @click="doEdit">{{ t('sidebar.edit') }}</div>
        <div class="menu-item" @click="doDuplicate">{{ t('sidebar.duplicate') }}</div>
        <div class="menu-divider" />
        <div class="menu-item danger" @click="doDelete">{{ t('sidebar.delete') }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { Plus, Close } from '@element-plus/icons-vue'
import { useConnectionStore } from '../stores/connectionStore'
import { useI18n } from '../i18n'
import ConnectionForm from './ConnectionForm.vue'
import type { ConnectionConfig } from '../types/session'

const props = defineProps<{
  visible: boolean
}>()
const emit = defineEmits(['connect', 'connectSftp', 'toggle'])
const connectionStore = useConnectionStore()
const { t } = useI18n()
const showForm = ref(false)
const editConfig = ref<ConnectionConfig | undefined>(undefined)
const searchQuery = ref('')
const selectedId = ref<string | null>(null)

const sidebarWidth = ref(220)
const isResizing = ref(false)
const sidebarEl = ref<HTMLDivElement>()

const filteredConnections = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return connectionStore.connections
  return connectionStore.connections.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.host.toLowerCase().includes(q)
  )
})

watch(filteredConnections, (list) => {
  if (list.length === 0) {
    selectedId.value = null
  } else if (!selectedId.value || !list.some(c => c.id === selectedId.value)) {
    selectedId.value = list[0].id
  }
}, { immediate: true })

function scrollActiveIntoView() {
  nextTick(() => {
    const activeEl = sidebarEl.value?.querySelector('.connection-item.active') as HTMLElement
    activeEl?.scrollIntoView({ block: 'nearest' })
  })
}

function onListKeydown(e: KeyboardEvent) {
  if (showForm.value || menuVisible.value) return
  const list = filteredConnections.value
  if (list.length === 0) return

  const idx = list.findIndex(c => c.id === selectedId.value)

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const nextIdx = idx >= 0 && idx < list.length - 1 ? idx + 1 : 0
    selectedId.value = list[nextIdx].id
    scrollActiveIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prevIdx = idx > 0 ? idx - 1 : list.length - 1
    selectedId.value = list[prevIdx].id
    scrollActiveIntoView()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const conn = list.find(c => c.id === selectedId.value)
    if (conn) {
      emit('connect', conn)
    }
  }
}

const menuVisible = ref(false)
const menuStyle = ref({ left: '0px', top: '0px' })
const selectedConn = ref<ConnectionConfig | null>(null)
const menuRef = ref<HTMLDivElement>()

function openNewForm() {
  editConfig.value = undefined
  showForm.value = true
}

function onSave(config: ConnectionConfig) {
  if (editConfig.value) {
    connectionStore.update(config.id, config)
  } else {
    connectionStore.add(config)
  }
  showForm.value = false
  editConfig.value = undefined
}

function onConnectFromForm(config: ConnectionConfig) {
  if (editConfig.value) {
    connectionStore.update(config.id, config)
  } else {
    connectionStore.add(config)
  }
  showForm.value = false
  editConfig.value = undefined
  emit('connect', config)
}

function onItemClick(conn: ConnectionConfig) {
  selectedId.value = conn.id
}

function onItemDblClick(conn: ConnectionConfig) {
  emit('connect', conn)
}

function onContextMenu(e: MouseEvent, conn: ConnectionConfig) {
  e.stopPropagation()
  window.dispatchEvent(new CustomEvent('global:close-context-menus'))
  selectedConn.value = conn
  menuStyle.value = { left: e.clientX + 'px', top: e.clientY + 'px' }
  menuVisible.value = true
}

onMounted(() => {
  window.addEventListener('global:close-context-menus', closeMenu)
  document.addEventListener('click', closeMenu)
})

onUnmounted(() => {
  window.removeEventListener('global:close-context-menus', closeMenu)
  document.removeEventListener('click', closeMenu)
})

function closeMenu() {
  menuVisible.value = false
}

function doConnect() {
  if (selectedConn.value) {
    emit('connect', selectedConn.value)
  }
  closeMenu()
}

function doConnectSFTP() {
  if (selectedConn.value) {
    emit('connectSftp', selectedConn.value)
  }
  closeMenu()
}

function doEdit() {
  if (selectedConn.value) {
    editConfig.value = { ...selectedConn.value }
    showForm.value = true
  }
  closeMenu()
}

function doDuplicate() {
  if (selectedConn.value) {
    const dupName = generateDuplicateName(selectedConn.value.name)
    const dup: ConnectionConfig = {
      ...selectedConn.value,
      id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: dupName
    }
    connectionStore.add(dup)
  }
  closeMenu()
}

function generateDuplicateName(name: string): string {
  const match = name.match(/^(.*)\s*\((\d+)\)$/)
  const base = match ? match[1].trim() : name
  const re = new RegExp('^' + escapeRegex(base) + '\s*\(\d+\)$')
  let maxNum = 0
  for (const c of connectionStore.connections) {
    if (c.name === base || re.test(c.name)) {
      const m = c.name.match(/\((\d+)\)$/)
      if (m) {
        maxNum = Math.max(maxNum, parseInt(m[1], 10))
      } else {
        maxNum = Math.max(maxNum, 0)
      }
    }
  }
  return `${base} (${maxNum + 1})`
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function doDelete() {
  if (selectedConn.value) {
    connectionStore.remove(selectedConn.value.id)
  }
  closeMenu()
}

function onResizeStart(e: MouseEvent) {
  isResizing.value = true
  const el = sidebarEl.value
  if (!el) return
  const startX = e.clientX
  const startWidth = el.offsetWidth

  window.dispatchEvent(new CustomEvent('split:resize-start'))

  function onMouseMove(ev: MouseEvent) {
    if (!isResizing.value) return
    const delta = ev.clientX - startX
    const newWidth = Math.min(Math.max(startWidth + delta, 180), 400)
    el.style.width = newWidth + 'px'
  }

  function onMouseUp() {
    isResizing.value = false
    sidebarWidth.value = el.offsetWidth
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    window.dispatchEvent(new CustomEvent('split:resize-end'))
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}
</script>

<style scoped>
.sidebar {
  background: var(--bg-elevated);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: relative;
}

.sidebar.collapsed {
  width: 0 !important;
  overflow: hidden;
}

.sidebar.resizing {
  transition: none;
}

.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background 0.15s ease;
}

.resize-handle:hover {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  flex-shrink: 0;
}

.header-label {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  gap: 2px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.12s ease;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.search-box {
  padding: 0 10px 8px;
  flex-shrink: 0;
}

.connection-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
  outline: none;
}

.connection-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.12s ease;
  margin-bottom: 2px;
  user-select: none;
}

.connection-item:hover {
  background: var(--bg-hover);
}

.connection-item.active {
  background: var(--accent-subtle);
  box-shadow: inset 0 0 0 1px var(--accent-dim);
}

.connection-item.active .name {
  color: var(--accent);
}

.conn-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-disabled);
  flex-shrink: 0;
  transition: background 0.2s ease;
}

.conn-indicator.connected {
  background: var(--success);
  box-shadow: 0 0 6px rgba(52, 211, 153, 0.4);
}

.conn-details {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.name {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.host {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-state {
  padding: 32px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-disabled);
  font-family: var(--font-ui);
}
</style>

<style>
.conn-context-menu {
  position: fixed;
  z-index: 99999;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  min-width: 140px;
  padding: 4px;
  backdrop-filter: blur(8px);
}

.conn-context-menu .menu-item {
  padding: 7px 14px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  border-radius: var(--radius-sm);
  transition: all 0.1s ease;
}

.conn-context-menu .menu-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.conn-context-menu .menu-item.danger:hover {
  background: rgba(248, 113, 113, 0.1);
  color: var(--error);
}

.conn-context-menu .menu-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px 6px;
}
</style>
