<template>
  <div class="sftp-file-list">
    <div class="filter-bar">
      <el-input
        v-model="filterText"
        placeholder="Filter by name"
        size="small"
        clearable
      />
    </div>
    <el-table
      ref="tableRef"
      :data="filteredFiles"
      size="small"
      @row-click="onRowClick"
      @row-dblclick="onRowDblClick"
      @row-contextmenu="onRowContextMenu"
    >
      <el-table-column label="Name" min-width="160">
        <template #default="{ row }">
          <div class="name-cell" :draggable="true" @dragstart="onDragStart($event, row)">
            <el-icon v-if="row.isDir"><Folder /></el-icon>
            <el-icon v-else><Document /></el-icon>
            <span class="file-name" :class="{ selected: isSelected(row) }">{{ row.name }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="mode" label="Permission" width="100" />
      <el-table-column label="Modified" width="130">
        <template #default="{ row }">
          {{ formatDate(row.modTime) }}
        </template>
      </el-table-column>
      <el-table-column label="Type" width="70">
        <template #default="{ row }">
          {{ row.isDir ? 'Directory' : 'File' }}
        </template>
      </el-table-column>
      <el-table-column label="Size" width="70" align="right">
        <template #default="{ row }">
          {{ row.isDir ? '-' : formatSize(row.size) }}
        </template>
      </el-table-column>
    </el-table>

    <Teleport to="body">
      <div
        v-show="contextMenuVisible"
        class="sftp-context-menu"
        :style="contextMenuStyle"
        @click.stop
      >
        <template v-if="menuType === 'file'">
          <div class="menu-item" @click="doDownload">Download</div>
          <div class="menu-item" @click="doSendToOther">Send to {{ targetSide }}</div>
          <div class="menu-item" @click="doRename">Rename</div>
          <div class="menu-item" @click="doMove">Move</div>
          <div class="menu-item" @click="doDelete">Delete</div>
          <div class="menu-divider" />
          <div class="menu-item" @click="doRefresh">Refresh</div>
          <div class="menu-item" @click="doMkdir">New Directory</div>
          <div class="menu-item" @click="doChmod">Change Permission</div>
        </template>
        <template v-else-if="menuType === 'dir'">
          <div class="menu-item" @click="doEnter">Enter Directory</div>
          <div class="menu-item" @click="doSendToOther">Send to {{ targetSide }}</div>
          <div class="menu-item" @click="doRename">Rename</div>
          <div class="menu-item" @click="doMove">Move</div>
          <div class="menu-item" @click="doDelete">Delete</div>
          <div class="menu-divider" />
          <div class="menu-item" @click="doRefresh">Refresh</div>
          <div class="menu-item" @click="doMkdir">New Directory</div>
          <div class="menu-item" @click="doChmod">Change Permission</div>
        </template>
        <template v-else-if="menuType === 'batch'">
          <div class="menu-item" @click="doBatchDownload">Download Selected</div>
          <div class="menu-item" @click="doBatchSendToOther">Send to {{ targetSide }}</div>
          <div class="menu-item" @click="doBatchDelete">Delete Selected</div>
          <div class="menu-divider" />
          <div class="menu-item" @click="doRefresh">Refresh</div>
          <div class="menu-item disabled">Rename (single only)</div>
          <div class="menu-item disabled">Change Permission (single only)</div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Folder, Document } from '@element-plus/icons-vue'

export interface FileItem {
  name: string
  size: number
  modTime: string
  mode: string
  isDir: boolean
}

const props = defineProps<{
  files: FileItem[]
  mode: 'local' | 'remote'
}>()

const emit = defineEmits<{
  open: [item: FileItem]
  navigate: [path: string]
  download: [items: FileItem[]]
  sendToOther: [items: FileItem[]]
  rename: [item: FileItem]
  move: [items: FileItem[]]
  delete: [items: FileItem[]]
  refresh: []
  mkdir: []
  chmod: [item: FileItem]
}>()

const filterText = ref('')
const selectedItems = ref<FileItem[]>([])
const lastClickedIndex = ref(-1)
const contextMenuVisible = ref(false)
const contextMenuStyle = ref({ left: '0px', top: '0px' })
const menuType = ref<'file' | 'dir' | 'batch'>('file')

const targetSide = computed(() => props.mode === 'local' ? 'Remote' : 'Local')

const filteredFiles = computed(() => {
  let list = [...props.files]
  // Add ".." if not at root (detected by checking if files already has it or if parent knows)
  // For now always prepend ".." as first item unless already present
  if (!list.find(f => f.name === '..')) {
    list.unshift({ name: '..', size: 0, modTime: '', mode: '', isDir: true })
  }
  const q = filterText.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(f => f.name.toLowerCase().includes(q))
})

function isSelected(row: FileItem): boolean {
  return selectedItems.value.some(s => s.name === row.name)
}

function formatDate(ts: string): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return d.toLocaleString()
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

function onRowClick(row: FileItem, _column: any, event: MouseEvent) {
  const index = filteredFiles.value.findIndex(f => f.name === row.name)
  if (event.ctrlKey || event.metaKey) {
    const idx = selectedItems.value.findIndex(s => s.name === row.name)
    if (idx >= 0) {
      selectedItems.value.splice(idx, 1)
    } else {
      selectedItems.value.push(row)
    }
  } else if (event.shiftKey && lastClickedIndex.value >= 0) {
    const start = Math.min(lastClickedIndex.value, index)
    const end = Math.max(lastClickedIndex.value, index)
    selectedItems.value = filteredFiles.value.slice(start, end + 1)
  } else {
    selectedItems.value = [row]
    lastClickedIndex.value = index
  }
}

function onRowDblClick(row: FileItem) {
  if (row.name === '..') {
    emit('navigate', '..')
    return
  }
  if (row.isDir) {
    emit('navigate', row.name)
  } else {
    emit('open', row)
  }
}

function onRowContextMenu(event: MouseEvent, row: FileItem) {
  event.preventDefault()
  if (!selectedItems.value.some(s => s.name === row.name)) {
    selectedItems.value = [row]
  }
  if (selectedItems.value.length > 1) {
    menuType.value = 'batch'
  } else if (selectedItems.value[0]?.isDir) {
    menuType.value = 'dir'
  } else {
    menuType.value = 'file'
  }
  contextMenuStyle.value = { left: event.clientX + 'px', top: event.clientY + 'px' }
  contextMenuVisible.value = true
  document.addEventListener('click', closeMenu, { once: true })
}

function closeMenu() {
  contextMenuVisible.value = false
}

function doDownload() { emit('download', [...selectedItems.value]); closeMenu() }
function doSendToOther() { emit('sendToOther', [...selectedItems.value]); closeMenu() }
function doRename() { emit('rename', selectedItems.value[0]); closeMenu() }
function doMove() { emit('move', [...selectedItems.value]); closeMenu() }
function doDelete() { emit('delete', [...selectedItems.value]); closeMenu() }
function doRefresh() { emit('refresh'); closeMenu() }
function doMkdir() { emit('mkdir'); closeMenu() }
function doChmod() { emit('chmod', selectedItems.value[0]); closeMenu() }
function doEnter() { emit('navigate', selectedItems.value[0]?.name || '.'); closeMenu() }
function doBatchDownload() { emit('download', [...selectedItems.value]); closeMenu() }
function doBatchSendToOther() { emit('sendToOther', [...selectedItems.value]); closeMenu() }
function doBatchDelete() { emit('delete', [...selectedItems.value]); closeMenu() }

function onDragStart(event: DragEvent, row: FileItem) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/sftp-file', JSON.stringify({
      mode: props.mode,
      name: row.name,
      isDir: row.isDir
    }))
  }
}
</script>

<style scoped>
.sftp-file-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.filter-bar {
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}
.file-name {
  margin-left: 2px;
}
.file-name.selected {
  color: var(--accent);
}
</style>

<style>
.sftp-context-menu {
  position: fixed;
  z-index: 99999;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  min-width: 160px;
  padding: 4px;
}
.sftp-context-menu .menu-item {
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.sftp-context-menu .menu-item:hover:not(.disabled) {
  background: var(--bg-hover);
}
.sftp-context-menu .menu-item.disabled {
  color: var(--text-disabled);
  cursor: not-allowed;
}
.sftp-context-menu .menu-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px;
}
</style>
