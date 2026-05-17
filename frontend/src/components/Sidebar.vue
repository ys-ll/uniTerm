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

    <div class="connection-list" tabindex="0" @keydown="onListKeydown" @contextmenu.prevent="onEmptyAreaContextMenu">
      <!-- Grouped connections -->
      <template v-for="entry in filteredGrouped.groups" :key="entry.group.id">
        <div
          class="group-header"
          :class="{ 'drag-over': dragOverGroupId === entry.group.id }"
          @click="toggleGroup(entry.group.id)"
          @contextmenu.prevent="onGroupContextMenu($event, entry.group)"
          @dragover.prevent="onGroupDragOver(entry.group.id)"
          @dragleave="onGroupDragLeave(entry.group.id)"
          @drop.prevent="onGroupDrop(entry.group.id, $event)"
        >
          <span class="group-arrow" :class="{ expanded: expandedGroups.has(entry.group.id) }">▸</span>
          <span class="group-name">{{ entry.group.name }}</span>
        </div>
        <template v-if="expandedGroups.has(entry.group.id)">
          <div
            v-for="conn in entry.connections"
            :key="conn.id"
            class="connection-item indented"
            :class="{
              active: selectedId === conn.id,
              'multi-selected': multiSelectedIds.has(conn.id)
            }"
            draggable="true"
            @dragstart="onDragStart($event, conn)"
            @dragend="onDragEnd"
            @click="onItemClick($event, conn)"
            @dblclick="onItemDblClick(conn)"
            @contextmenu.prevent="onContextMenu($event, conn)"
          >
            <div class="conn-indicator" :class="{ connected: false }" />
            <div class="conn-details">
              <span class="name">{{ conn.name }}</span>
              <span class="host">{{ conn.user }}@{{ conn.host }}</span>
            </div>
          </div>
        </template>
      </template>

      <!-- Virtual (No Group) group - only when real groups exist -->
      <template v-if="connectionStore.groups.length > 0 && filteredGrouped.ungrouped.length > 0">
        <div
          class="group-header"
          :class="{ 'drag-over': dragOverGroupId === '__ungrouped__' }"
          @click="toggleGroup('__ungrouped__')"
          @contextmenu.prevent="onVirtualGroupContextMenu($event)"
          @dragover.prevent="onGroupDragOver('__ungrouped__')"
          @dragleave="onGroupDragLeave('__ungrouped__')"
          @drop.prevent="onGroupDrop('__ungrouped__', $event)"
        >
          <span class="group-arrow" :class="{ expanded: expandedGroups.has('__ungrouped__') }">▸</span>
          <span class="group-name">{{ t('conn.noGroup') }}</span>
        </div>
        <template v-if="expandedGroups.has('__ungrouped__')">
          <div
            v-for="conn in filteredGrouped.ungrouped"
            :key="conn.id"
            class="connection-item indented"
            :class="{
              active: selectedId === conn.id,
              'multi-selected': multiSelectedIds.has(conn.id)
            }"
            draggable="true"
            @dragstart="onDragStart($event, conn)"
            @dragend="onDragEnd"
            @click="onItemClick($event, conn)"
            @dblclick="onItemDblClick(conn)"
            @contextmenu.prevent="onContextMenu($event, conn)"
          >
            <div class="conn-indicator" :class="{ connected: false }" />
            <div class="conn-details">
              <span class="name">{{ conn.name }}</span>
              <span class="host">{{ conn.user }}@{{ conn.host }}</span>
            </div>
          </div>
        </template>
      </template>

      <!-- Flat ungrouped connections (only when no real groups exist) -->
      <template v-if="connectionStore.groups.length === 0">
        <div
          v-for="conn in filteredGrouped.ungrouped"
          :key="conn.id"
          class="connection-item"
          :class="{
            active: selectedId === conn.id,
            'multi-selected': multiSelectedIds.has(conn.id)
          }"
          draggable="true"
          @dragstart="onDragStart($event, conn)"
          @dragend="onDragEnd"
          @click="onItemClick($event, conn)"
          @dblclick="onItemDblClick(conn)"
          @contextmenu.prevent="onContextMenu($event, conn)"
        >
          <div class="conn-indicator" :class="{ connected: false }" />
          <div class="conn-details">
            <span class="name">{{ conn.name }}</span>
            <span class="host">{{ conn.user }}@{{ conn.host }}</span>
          </div>
        </div>
      </template>

      <!-- Virtual "New Connection..." when searching -->
      <div
        v-if="searchQuery.trim()"
        class="connection-item virtual-new-conn"
        :class="{ active: selectedId === '__new_connection__' }"
        @click="selectedId = '__new_connection__'; multiSelectedIds = new Set(); lastClickId = '__new_connection__'"
        @dblclick="openNewFormFromSearch"
      >
        <div class="conn-indicator" style="background: var(--accent)" />
        <div class="conn-details">
          <span class="name virtual-name">{{ t('sidebar.newConnectionFromSearch') }}</span>
          <span class="host">{{ t('conn.host') }}: {{ searchQuery.trim() }}</span>
        </div>
      </div>

      <div v-if="totalFiltered === 0 && connectionStore.connections.length > 0 && !searchQuery.trim()" class="empty-state">
        {{ t('sidebar.noSearchResults') }}
      </div>
      <div v-if="connectionStore.connections.length === 0" class="empty-state">
        {{ t('sidebar.noConnections') }}
      </div>
    </div>

    <ConnectionForm v-model="showForm" :edit-config="editConfig" @save="onSave" @connect="onConnectFromForm" />

    <!-- Connection context menu -->
    <Teleport to="body">
      <div
        v-show="menuVisible"
        ref="menuRef"
        class="conn-context-menu"
        :style="menuStyle"
        @click.stop
      >
        <div class="menu-item" @click="doConnect">{{ t('sidebar.connect') }}</div>
        <div class="menu-item" @click="doConnectSFTP">{{ t('sidebar.connectSftp') }}</div>
        <div class="menu-divider" />
        <div class="menu-item" :class="{ disabled: multiSelectedIds.size > 0 }" @click="multiSelectedIds.size === 0 && doEdit()">{{ t('sidebar.edit') }}</div>
        <div class="menu-item" @click="doDuplicate">{{ t('sidebar.duplicate') }}</div>
        <div class="menu-divider" />
        <div class="menu-item" @click="doChangeGroup">{{ t('conn.changeGroup') }}</div>
        <div class="menu-item" @click="doNewGroup">{{ t('conn.newGroupTitle') }}</div>
        <div class="menu-divider" />
        <div class="menu-item danger" @click="doDelete">{{ t('sidebar.delete') }}</div>
      </div>
    </Teleport>

    <!-- Group context menu -->
    <Teleport to="body">
      <div
        v-show="groupMenuVisible"
        ref="groupMenuRef"
        class="conn-context-menu"
        :style="groupMenuStyle"
        @click.stop
      >
        <div class="menu-item" @click="doNewGroup">{{ t('conn.newGroupTitle') }}</div>
        <template v-if="selectedGroup && selectedGroup.id !== '__ungrouped__'">
          <div class="menu-divider" />
          <div class="menu-item" @click="doRenameGroup">{{ t('conn.renameGroup') }}</div>
          <div class="menu-divider" />
          <div class="menu-item danger" @click="doDeleteGroup">{{ t('conn.deleteGroup') }}</div>
        </template>
      </div>
    </Teleport>

    <!-- Empty area context menu -->
    <Teleport to="body">
      <div
        v-show="emptyAreaMenuVisible"
        ref="emptyAreaMenuRef"
        class="conn-context-menu"
        :style="emptyAreaMenuStyle"
        @click.stop
      >
        <div class="menu-item" @click="doNewGroup">{{ t('conn.newGroupTitle') }}</div>
      </div>
    </Teleport>

    <!-- Delete group dialog -->
    <el-dialog v-model="showDeleteGroupDialog" :title="t('conn.deleteGroupTitle')" width="450px">
      <p>{{ deleteGroupPromptText }}</p>
      <template #footer>
        <el-button @click="showDeleteGroupDialog = false">{{ t('conn.deleteGroupCancel') }}</el-button>
        <el-button type="warning" @click="confirmDeleteGroup('move-out')">{{ t('conn.deleteGroupMoveOut') }}</el-button>
        <el-button type="danger" @click="confirmDeleteGroup('delete-connections')">{{ t('conn.deleteGroupDeleteAll') }}</el-button>
      </template>
    </el-dialog>

    <!-- Rename group dialog -->
    <el-dialog v-model="showRenameGroupDialog" :title="t('conn.renameGroup')" width="360px">
      <el-form @submit.prevent="confirmRenameGroup">
        <el-form-item :label="t('conn.groupName')">
          <el-input
            v-model="renameGroupName"
            :placeholder="t('conn.groupNamePlaceholder')"
            @keyup.enter="confirmRenameGroup"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRenameGroupDialog = false">{{ t('conn.cancel') }}</el-button>
        <el-button type="primary" @click="confirmRenameGroup">{{ t('conn.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- Change group dialog -->
    <el-dialog v-model="showChangeGroupDialog" :title="t('conn.changeGroup')" width="360px">
      <el-select v-model="changeGroupTargetId" :placeholder="t('conn.noGroup')" clearable style="width:100%">
        <el-option
          v-for="g in connectionStore.groups"
          :key="g.id"
          :label="g.name"
          :value="g.id"
        />
        <el-option
          :label="t('conn.noGroup')"
          value="__none__"
        />
        <el-option
          :label="t('conn.newGroup')"
          value="__new__"
        />
      </el-select>
      <template #footer>
        <el-button @click="showChangeGroupDialog = false">{{ t('conn.cancel') }}</el-button>
        <el-button type="primary" @click="confirmChangeGroup">{{ t('conn.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- Standalone new group dialog -->
    <el-dialog v-model="showNewGroupDialog" :title="t('conn.newGroupTitle')" width="360px">
      <el-form @submit.prevent="confirmNewGroup">
        <el-form-item :label="t('conn.groupName')">
          <el-input
            v-model="newGroupName"
            :placeholder="t('conn.groupNamePlaceholder')"
            @keyup.enter="confirmNewGroup"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showNewGroupDialog = false">{{ t('conn.cancel') }}</el-button>
        <el-button type="primary" @click="confirmNewGroup">{{ t('conn.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- New group dialog (for change group flow) -->
    <el-dialog v-model="showChangeNewGroupDialog" :title="t('conn.newGroupTitle')" width="360px">
      <el-form @submit.prevent="confirmChangeNewGroup">
        <el-form-item :label="t('conn.groupName')">
          <el-input
            v-model="changeNewGroupName"
            :placeholder="t('conn.groupNamePlaceholder')"
            @keyup.enter="confirmChangeNewGroup"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showChangeNewGroupDialog = false">{{ t('conn.cancel') }}</el-button>
        <el-button type="primary" @click="confirmChangeNewGroup">{{ t('conn.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { Plus, Close } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useConnectionStore } from '../stores/connectionStore'
import { useI18n } from '../i18n'
import ConnectionForm from './ConnectionForm.vue'
import type { ConnectionConfig, ConnectionGroup } from '../types/session'

defineProps<{
  visible: boolean
}>()
const emit = defineEmits(['connect', 'connectSftp', 'toggle'])
const connectionStore = useConnectionStore()
const { t } = useI18n()
const showForm = ref(false)
const editConfig = ref<ConnectionConfig | undefined>(undefined)
const searchQuery = ref('')
const selectedId = ref<string | null>(null)

// ── Expand/collapse state ──
const expandedGroups = ref<Set<string>>(new Set())

function toggleGroup(groupId: string) {
  if (expandedGroups.value.has(groupId)) {
    expandedGroups.value.delete(groupId)
  } else {
    expandedGroups.value.add(groupId)
  }
}

// ── Multi-select ──
const multiSelectedIds = ref<Set<string>>(new Set())

// ── Search filter ──
const filteredGrouped = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const data = connectionStore.groupedConnections
  if (!q) return data

  const matchConn = (c: ConnectionConfig) =>
    c.name.toLowerCase().includes(q) || c.host.toLowerCase().includes(q)

  const filteredGroups = data.groups
    .map(entry => ({
      group: entry.group,
      connections: entry.connections.filter(matchConn)
    }))
    .filter(entry => {
      const groupNameMatch = entry.group.name.toLowerCase().includes(q)
      if (groupNameMatch) {
        // Show all connections in group when group name matches
        entry.connections = data.groups.find(g => g.group.id === entry.group.id)!.connections
        return true
      }
      return entry.connections.length > 0
    })

  const filteredUngrouped = data.ungrouped.filter(matchConn)

  return { groups: filteredGroups, ungrouped: filteredUngrouped }
})

const totalFiltered = computed(() => {
  let count = 0
  for (const g of filteredGrouped.value.groups) {
    count += g.connections.length
  }
  count += filteredGrouped.value.ungrouped.length
  return count
})

// Update selection when filter changes
watch(filteredGrouped, () => {
  const allIds: string[] = []
  for (const g of filteredGrouped.value.groups) {
    for (const c of g.connections) allIds.push(c.id)
  }
  for (const c of filteredGrouped.value.ungrouped) allIds.push(c.id)

  if (allIds.length === 0) {
    selectedId.value = null
  } else if (!selectedId.value || !allIds.includes(selectedId.value)) {
    selectedId.value = allIds[0]
  }
}, { immediate: true })

// Auto-expand all groups by default
watch(() => connectionStore.groups, (groups) => {
  for (const g of groups) {
    expandedGroups.value.add(g.id)
  }
  if (groups.length > 0) {
    expandedGroups.value.add('__ungrouped__')
  }
}, { immediate: true })

// Auto-expand groups when searching
watch(searchQuery, (q) => {
  if (q.trim()) {
    for (const g of filteredGrouped.value.groups) {
      expandedGroups.value.add(g.group.id)
    }
    if (connectionStore.groups.length > 0) {
      expandedGroups.value.add('__ungrouped__')
    }
  }
})

// ── Resize ──
const sidebarWidth = ref(220)
const isResizing = ref(false)
const sidebarEl = ref<HTMLDivElement>()

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
    el!.style.width = newWidth + 'px'
  }

  function onMouseUp() {
    isResizing.value = false
    sidebarWidth.value = el!.offsetWidth
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    window.dispatchEvent(new CustomEvent('split:resize-end'))
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// ── Keyboard navigation ──
function getAllVisibleIds(): string[] {
  const ids: string[] = []
  for (const g of filteredGrouped.value.groups) {
    if (expandedGroups.value.has(g.group.id)) {
      for (const c of g.connections) ids.push(c.id)
    }
  }
  if (connectionStore.groups.length > 0) {
    if (expandedGroups.value.has('__ungrouped__')) {
      for (const c of filteredGrouped.value.ungrouped) ids.push(c.id)
    }
  } else {
    for (const c of filteredGrouped.value.ungrouped) ids.push(c.id)
  }
  if (searchQuery.value.trim()) {
    ids.push('__new_connection__')
  }
  return ids
}

function scrollActiveIntoView() {
  nextTick(() => {
    const activeEl = sidebarEl.value?.querySelector('.connection-item.active') as HTMLElement
    activeEl?.scrollIntoView({ block: 'nearest' })
  })
}

function onListKeydown(e: KeyboardEvent) {
  if (showForm.value || menuVisible.value || groupMenuVisible.value) return
  const ids = getAllVisibleIds()
  if (ids.length === 0) return

  const idx = ids.indexOf(selectedId.value || '')

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const nextIdx = idx >= 0 && idx < ids.length - 1 ? idx + 1 : 0
    selectedId.value = ids[nextIdx]
    scrollActiveIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prevIdx = idx > 0 ? idx - 1 : ids.length - 1
    selectedId.value = ids[prevIdx]
    scrollActiveIntoView()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (selectedId.value === '__new_connection__') {
      openNewFormFromSearch()
      return
    }
    const ids = getSelectedConnectionIds()
    if (ids.length > 0) {
      for (const id of ids) {
        const c = connectionStore.connections.find(c => c.id === id)
        if (c) emit('connect', c)
      }
      multiSelectedIds.value = new Set()
    }
  }
}

function findConnById(id: string | null): ConnectionConfig | undefined {
  if (!id) return undefined
  return connectionStore.connections.find(c => c.id === id)
}

// ── Drag & drop ──
const dragOverGroupId = ref<string | null>(null)

function onDragStart(e: DragEvent, conn: ConnectionConfig) {
  const ids = getSelectedConnectionIds()
  // If dragging an unselected item, drag just this one
  if (!ids.includes(conn.id)) {
    multiSelectedIds.value = new Set()
    e.dataTransfer!.setData('text/plain', JSON.stringify([conn.id]))
  } else {
    e.dataTransfer!.setData('text/plain', JSON.stringify(ids))
  }
  e.dataTransfer!.effectAllowed = 'move'
}

function onDragEnd() {
  dragOverGroupId.value = null
}

function onGroupDragOver(groupId: string) {
  dragOverGroupId.value = groupId
}

function onGroupDragLeave(groupId: string) {
  if (dragOverGroupId.value === groupId) {
    dragOverGroupId.value = null
  }
}

async function onGroupDrop(groupId: string, e: DragEvent) {
  const targetGroupId = groupId === '__ungrouped__' ? undefined : groupId
  const raw = e.dataTransfer?.getData('text/plain')
  if (raw) {
    const ids: string[] = JSON.parse(raw)
    await connectionStore.setConnectionsGroup(ids, targetGroupId)
    multiSelectedIds.value = new Set()
  }
  dragOverGroupId.value = null
}

// ── Connection click / multi-select ──
const lastClickId = ref<string | null>(null)

function onItemClick(e: MouseEvent, conn: ConnectionConfig) {
  if (e.shiftKey && lastClickId.value) {
    // Range select from last click to current
    const ids = getAllVisibleIds()
    const anchorIdx = ids.indexOf(lastClickId.value)
    const currentIdx = ids.indexOf(conn.id)
    if (anchorIdx >= 0 && currentIdx >= 0) {
      const [start, end] = anchorIdx < currentIdx ? [anchorIdx, currentIdx] : [currentIdx, anchorIdx]
      const selected = new Set<string>()
      for (let i = start; i <= end; i++) {
        selected.add(ids[i])
      }
      multiSelectedIds.value = selected
    }
    selectedId.value = conn.id
  } else if (e.ctrlKey || e.metaKey) {
    // Toggle multi-select
    if (multiSelectedIds.value.has(conn.id)) {
      multiSelectedIds.value.delete(conn.id)
    } else {
      multiSelectedIds.value.add(conn.id)
    }
    multiSelectedIds.value = new Set(multiSelectedIds.value)
    lastClickId.value = conn.id
  } else {
    selectedId.value = conn.id
    multiSelectedIds.value = new Set([conn.id])
    lastClickId.value = conn.id
  }
}

function onItemDblClick(conn: ConnectionConfig) {
  multiSelectedIds.value = new Set()
  emit('connect', conn)
}

// ── Context menu helper ──
function getSelectedConnectionIds(): string[] {
  if (multiSelectedIds.value.size > 0) {
    return [...multiSelectedIds.value]
  }
  if (selectedConn.value) {
    return [selectedConn.value.id]
  }
  if (selectedId.value) {
    return [selectedId.value]
  }
  return []
}

// ── Connection context menu ──
const menuVisible = ref(false)
const menuStyle = ref({ left: '0px', top: '0px' })
const selectedConn = ref<ConnectionConfig | null>(null)
const menuRef = ref<HTMLDivElement>()

function onContextMenu(e: MouseEvent, conn: ConnectionConfig) {
  e.stopPropagation()
  window.dispatchEvent(new CustomEvent('global:close-context-menus'))
  selectedConn.value = conn
  // If right-clicking on a non-multi-selected item, clear multi-select
  if (!multiSelectedIds.value.has(conn.id)) {
    multiSelectedIds.value = new Set()
  }
  menuStyle.value = { left: e.clientX + 'px', top: e.clientY + 'px' }
  menuVisible.value = true
}

function closeMenu() {
  menuVisible.value = false
}

function doConnect() {
  const ids = getSelectedConnectionIds()
  // Collect connections before any state changes
  const conns = ids.map(id => connectionStore.connections.find(c => c.id === id)).filter(Boolean) as ConnectionConfig[]
  multiSelectedIds.value = new Set()
  closeMenu()
  // Emit sequentially — each onConnect runs async but tabs/panels are created synchronously
  for (const c of conns) {
    emit('connect', c)
  }
}

function doConnectSFTP() {
  const ids = getSelectedConnectionIds()
  const conns = ids.map(id => connectionStore.connections.find(c => c.id === id)).filter(Boolean) as ConnectionConfig[]
  multiSelectedIds.value = new Set()
  closeMenu()
  for (const c of conns) {
    emit('connectSftp', c)
  }
}

function doEdit() {
  if (selectedConn.value) {
    editConfig.value = { ...selectedConn.value }
    showForm.value = true
  }
  closeMenu()
}

function doDuplicate() {
  const ids = getSelectedConnectionIds()
  const conns = ids.map(id => connectionStore.connections.find(c => c.id === id)).filter(Boolean) as ConnectionConfig[]
  multiSelectedIds.value = new Set()
  closeMenu()
  for (const c of conns) {
    const dupName = generateDuplicateName(c.name)
    const dup: ConnectionConfig = {
      ...c,
      id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: dupName
    }
    connectionStore.add(dup)
  }
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

async function doDelete() {
  closeMenu()
  const ids = getSelectedConnectionIds()
  try {
    await ElMessageBox.confirm(
      t('sidebar.deleteConfirm', { count: ids.length }),
      t('sidebar.delete'),
      { confirmButtonText: t('sftp.dialog.confirm'), cancelButtonText: t('sftp.dialog.cancel'), type: 'warning' }
    )
  } catch {
    return
  }
  for (const id of ids) {
    connectionStore.remove(id)
  }
  multiSelectedIds.value = new Set()
}

// ── Standalone new group ──
const showNewGroupDialog = ref(false)
const newGroupName = ref('')

function doNewGroup() {
  closeMenu()
  closeGroupMenu()
  closeEmptyAreaMenu()
  newGroupName.value = ''
  showNewGroupDialog.value = true
}

async function confirmNewGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  if (connectionStore.groups.some(g => g.name === name)) return
  await connectionStore.addGroup(name)
  showNewGroupDialog.value = false
}

// ── Change group ──
const showChangeGroupDialog = ref(false)
const changeGroupTargetId = ref<string | undefined>(undefined)
const showChangeNewGroupDialog = ref(false)
const changeNewGroupName = ref('')

function doChangeGroup() {
  closeMenu()
  const ids = getSelectedConnectionIds()
  // Find common group if all selected connections are in the same group
  const groups = new Set(ids.map(id => {
    const c = connectionStore.connections.find(c => c.id === id)
    return c?.groupId || '__none__'
  }))
  if (groups.size === 1) {
    const g = [...groups][0]
    changeGroupTargetId.value = g === '__none__' ? undefined : g
  } else {
    changeGroupTargetId.value = undefined
  }
  showChangeGroupDialog.value = true
}

function confirmChangeGroup() {
  const val = changeGroupTargetId.value
  if (val === '__new__') {
    showChangeNewGroupDialog.value = true
    changeNewGroupName.value = ''
    return
  }
  const groupId = val === '__none__' ? undefined : val
  const ids = getSelectedConnectionIds()
  connectionStore.setConnectionsGroup(ids, groupId)
  multiSelectedIds.value = new Set()
  showChangeGroupDialog.value = false
  changeGroupTargetId.value = undefined
}

async function confirmChangeNewGroup() {
  const name = changeNewGroupName.value.trim()
  if (!name) return
  if (connectionStore.groups.some(g => g.name === name)) return
  const group = await connectionStore.addGroup(name)
  const ids = getSelectedConnectionIds()
  connectionStore.setConnectionsGroup(ids, group.id)
  multiSelectedIds.value = new Set()
  showChangeNewGroupDialog.value = false
  showChangeGroupDialog.value = false
  changeGroupTargetId.value = undefined
}

// ── Group context menu ──
const groupMenuVisible = ref(false)
const groupMenuStyle = ref({ left: '0px', top: '0px' })
const selectedGroup = ref<ConnectionGroup | null>(null)
const groupMenuRef = ref<HTMLDivElement>()

function onGroupContextMenu(e: MouseEvent, group: ConnectionGroup) {
  e.stopPropagation()
  window.dispatchEvent(new CustomEvent('global:close-context-menus'))
  selectedGroup.value = group
  groupMenuStyle.value = { left: e.clientX + 'px', top: e.clientY + 'px' }
  groupMenuVisible.value = true
}

function closeGroupMenu() {
  groupMenuVisible.value = false
}

// ── Empty area context menu ──
const emptyAreaMenuVisible = ref(false)
const emptyAreaMenuStyle = ref({ left: '0px', top: '0px' })
const emptyAreaMenuRef = ref<HTMLDivElement>()

function onEmptyAreaContextMenu(e: MouseEvent) {
  window.dispatchEvent(new CustomEvent('global:close-context-menus'))
  emptyAreaMenuStyle.value = { left: e.clientX + 'px', top: e.clientY + 'px' }
  emptyAreaMenuVisible.value = true
}

function closeEmptyAreaMenu() {
  emptyAreaMenuVisible.value = false
}

// ── Virtual group context menu ──
function onVirtualGroupContextMenu(e: MouseEvent) {
  e.stopPropagation()
  window.dispatchEvent(new CustomEvent('global:close-context-menus'))
  selectedGroup.value = { id: '__ungrouped__', name: t('conn.noGroup') }
  groupMenuStyle.value = { left: e.clientX + 'px', top: e.clientY + 'px' }
  groupMenuVisible.value = true
}

// ── Rename group ──
const showRenameGroupDialog = ref(false)
const renameGroupName = ref('')

function doRenameGroup() {
  closeGroupMenu()
  renameGroupName.value = selectedGroup.value?.name || ''
  showRenameGroupDialog.value = true
}

function confirmRenameGroup() {
  const name = renameGroupName.value.trim()
  if (!name || !selectedGroup.value) return
  connectionStore.renameGroup(selectedGroup.value.id, name)
  showRenameGroupDialog.value = false
}

// ── Delete group ──
const showDeleteGroupDialog = ref(false)

const deleteGroupPromptText = computed(() => {
  const g = selectedGroup.value
  if (!g) return ''
  const count = connectionStore.connections.filter(c => c.groupId === g.id).length
  return t('conn.deleteGroupPrompt', { name: g.name, count })
})

function doDeleteGroup() {
  closeGroupMenu()
  if (!selectedGroup.value) return
  const count = connectionStore.connections.filter(c => c.groupId === selectedGroup.value!.id).length
  if (count === 0) {
    connectionStore.deleteGroup(selectedGroup.value.id, 'move-out')
    return
  }
  showDeleteGroupDialog.value = true
}

async function confirmDeleteGroup(action: 'delete-connections' | 'move-out') {
  if (selectedGroup.value) {
    await connectionStore.deleteGroup(selectedGroup.value.id, action)
  }
  showDeleteGroupDialog.value = false
  selectedGroup.value = null
}

// ── Form handlers ──
function openNewForm() {
  editConfig.value = undefined
  showForm.value = true
}

function openNewFormFromSearch() {
  editConfig.value = { host: searchQuery.value.trim() } as ConnectionConfig
  multiSelectedIds.value = new Set()
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

// ── Lifecycle ──
onMounted(() => {
  window.addEventListener('global:close-context-menus', () => {
    closeMenu()
    closeGroupMenu()
    closeEmptyAreaMenu()
  })
  document.addEventListener('click', () => {
    closeMenu()
    closeGroupMenu()
    closeEmptyAreaMenu()
  })
})

onUnmounted(() => {
  window.removeEventListener('global:close-context-menus', () => {
    closeMenu()
    closeGroupMenu()
    closeEmptyAreaMenu()
  })
  document.removeEventListener('click', () => {
    closeMenu()
    closeGroupMenu()
    closeEmptyAreaMenu()
  })
})
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

/* ── Group header ── */
.group-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px 6px 6px;
  cursor: pointer;
  user-select: none;
  border-radius: var(--radius-sm);
  transition: background 0.12s ease;
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-secondary);
}

.group-header:hover {
  background: var(--bg-hover);
}

.group-arrow {
  display: inline-block;
  width: 16px;
  font-size: 14px;
  transition: transform 0.15s ease;
  color: var(--text-disabled);
}

.group-arrow.expanded {
  transform: rotate(90deg);
}

.group-name {
  font-weight: 600;
}

.group-header.drag-over {
  background: var(--accent-subtle);
  box-shadow: inset 0 0 0 1px var(--accent);
}

/* ── Connection item ── */
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

.connection-item.indented {
  padding-left: 26px;
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

.connection-item.multi-selected {
  background: var(--accent-subtle);
  box-shadow: inset 0 0 0 1px var(--accent-dim);
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

.virtual-new-conn .virtual-name {
  color: var(--accent);
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

.conn-context-menu .menu-item.disabled {
  color: var(--text-disabled);
  cursor: default;
  pointer-events: none;
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
