<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <span>Connections</span>
      <el-button link size="small" @click="openNewForm">
        <el-icon><Plus /></el-icon>
      </el-button>
    </div>
    <div class="connection-list">
      <div
        v-for="conn in connectionStore.connections"
        :key="conn.id"
        class="connection-item"
        @click="emit('connect', conn)"
        @contextmenu.prevent="onContextMenu($event, conn)"
      >
        <el-icon><Connection /></el-icon>
        <span class="name">{{ conn.name }}</span>
        <span class="host">{{ conn.host }}:{{ conn.port }}</span>
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
        <div class="menu-item" @click="doConnect">Connect</div>
        <div class="menu-divider" />
        <div class="menu-item" @click="doEdit">Edit</div>
        <div class="menu-item" @click="doDuplicate">Duplicate</div>
        <div class="menu-divider" />
        <div class="menu-item" @click="doDelete">Delete</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Connection } from '@element-plus/icons-vue'
import { useConnectionStore } from '../stores/connectionStore'
import ConnectionForm from './ConnectionForm.vue'
import type { ConnectionConfig } from '../types/session'

const emit = defineEmits(['connect'])
const connectionStore = useConnectionStore()
const showForm = ref(false)
const editConfig = ref<ConnectionConfig | undefined>(undefined)

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

function onContextMenu(e: MouseEvent, conn: ConnectionConfig) {
  e.stopPropagation()
  selectedConn.value = conn
  menuStyle.value = { left: e.clientX + 'px', top: e.clientY + 'px' }
  menuVisible.value = true
  document.addEventListener('click', closeMenu, { once: true })
}

function closeMenu() {
  menuVisible.value = false
}

function doConnect() {
  if (selectedConn.value) {
    emit('connect', selectedConn.value)
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
  const re = new RegExp('^' + escapeRegex(base) + '\\s*\\(\\d+\\)$')
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
</script>

<style scoped>
.sidebar {
  width: 240px;
  background: #252526;
  border-right: 1px solid #3d3d3d;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 11px;
  text-transform: uppercase;
  color: #bbbbbb;
  border-bottom: 1px solid #3d3d3d;
}

.connection-list {
  flex: 1;
  overflow-y: auto;
}

.connection-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
}

.connection-item:hover {
  background: #2a2d2e;
}

.name {
  flex: 1;
  color: #e0e0e0;
}

.host {
  color: #858585;
  font-size: 11px;
}
</style>

<style>
.conn-context-menu {
  position: fixed;
  z-index: 99999;
  background: #2d2d2d;
  border: 1px solid #3d3d3d;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  min-width: 120px;
  padding: 4px 0;
}

.conn-context-menu .menu-item {
  padding: 6px 16px;
  font-size: 13px;
  color: #e0e0e0;
  cursor: pointer;
  user-select: none;
}

.conn-context-menu .menu-item:hover {
  background: #094771;
}

.conn-context-menu .menu-divider {
  height: 1px;
  background: #3d3d3d;
  margin: 4px 0;
}
</style>
