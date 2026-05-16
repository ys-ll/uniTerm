<template>
  <div class="sftp-tab-content">
    <div class="panes-area">
      <div
        class="local-pane"
        @dragover.prevent="onDragOver"
        @drop="onDropLocal"
      >
        <SFTPPathBreadcrumb :path="localCwd" @navigate="onLocalNavigate" />
        <SFTPFileList
          mode="local"
          :files="localFiles"
          @navigate="onLocalNavigate"
          @download="onDownload"
          @send-to-other="onSendToRemote"
          @rename="onRename"
          @move="onMove"
          @delete="onDelete"
          @refresh="onRefreshLocal"
          @mkdir="onMkdir"
          @chmod="onChmod"
        />
      </div>
      <div
        class="remote-pane"
        @dragover.prevent="onDragOver"
        @drop="onDropRemote"
      >
        <SFTPPathBreadcrumb :path="cwd" @navigate="onRemoteNavigate" />
        <SFTPFileList
          mode="remote"
          :files="remoteFiles"
          @navigate="onRemoteNavigate"
          @download="onDownload"
          @send-to-other="onSendToLocal"
          @rename="onRename"
          @move="onMove"
          @delete="onDelete"
          @refresh="onRefreshRemote"
          @mkdir="onMkdir"
          @chmod="onChmod"
        />
      </div>
    </div>
    <SFTPTransferProgress :tasks="transferTasks" />
    <div class="command-line-area">
      <SFTPCommandLine :session-id="panel?.sessionId" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { usePanelStore } from '../stores/panelStore'
import { SessionWrite } from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime'
import SFTPPathBreadcrumb from './SFTPPathBreadcrumb.vue'
import SFTPFileList from './SFTPFileList.vue'
import SFTPTransferProgress from './SFTPTransferProgress.vue'
import SFTPCommandLine from './SFTPCommandLine.vue'
import type { FileItem } from './SFTPFileList.vue'

interface TransferTaskUI {
  id: string
  type: 'upload' | 'download'
  name: string
  percentage: number
  status: 'running' | 'done' | 'error'
}

const props = defineProps<{
  panelId: string
}>()

const panelStore = usePanelStore()
const panel = computed(() => panelStore.getPanel(props.panelId))

const localCwd = ref('/')
const cwd = ref('/')
const localFiles = ref<FileItem[]>([])
const remoteFiles = ref<FileItem[]>([])
const transferTasks = ref<TransferTaskUI[]>([])

let unsubscribe: (() => void) | null = null

onMounted(() => {
  onRefreshLocal()
  onRefreshRemote()

  unsubscribe = EventsOn('session:data', (payload: { id: string; data: string }) => {
    if (payload.id !== panel.value?.sessionId) return
    const match = payload.data.match(/\x1b\]633;S([^\x07]*)\x07/)
    if (!match) return
    try {
      const msg = JSON.parse(match[1])
      if (msg.type === 'sftp:filelist') {
        remoteFiles.value = msg.files.map((f: any) => ({
          name: f.name,
          size: f.size,
          modTime: f.modTime,
          mode: typeof f.mode === 'string' ? f.mode : ('000' + f.mode?.toString(8)).slice(-3),
          isDir: f.isDir
        }))
        if (msg.cwd) cwd.value = msg.cwd
      } else if (msg.type === 'sftp:locallist') {
        localFiles.value = msg.files.map((f: any) => ({
          name: f.name,
          size: f.size,
          modTime: f.modTime,
          mode: typeof f.mode === 'string' ? f.mode : ('000' + f.mode?.toString(8)).slice(-3),
          isDir: f.isDir
        }))
        if (msg.localCwd) localCwd.value = msg.localCwd
      } else if (msg.type === 'sftp:transfer') {
        if (msg.event === 'progress') {
          const existing = transferTasks.value.find(t => t.id === msg.taskId)
          if (existing) {
            existing.percentage = msg.total > 0 ? Math.round((msg.progress / msg.total) * 100) : 0
          }
        } else if (msg.event === 'complete') {
          const existing = transferTasks.value.find(t => t.id === msg.taskId)
          if (existing) {
            existing.status = msg.status === 'done' ? 'done' : 'error'
            existing.percentage = msg.status === 'done' ? 100 : existing.percentage
            setTimeout(() => {
              transferTasks.value = transferTasks.value.filter(t => t.id !== msg.taskId)
            }, 3000)
          }
        }
      }
    } catch {}
  })
})

// Watch for sessionId becoming available (async connection)
watch(() => panel.value?.sessionId, (newId, oldId) => {
  if (newId && !oldId) {
    // Session just connected — auto refresh file lists
    setTimeout(() => {
      onRefreshLocal()
      onRefreshRemote()
    }, 300)
  }
})

onUnmounted(() => {
  unsubscribe?.()
})

function sendCommand(cmd: string) {
  const sid = panel.value?.sessionId
  if (sid) SessionWrite(sid, cmd + '\n')
}

function onLocalNavigate(path: string) {
  sendCommand(`lcd ${path}`)
}
function onRemoteNavigate(path: string) {
  sendCommand(`cd ${path}`)
}
function onRefreshLocal() {
  sendCommand('lls')
}
function onRefreshRemote() {
  sendCommand('ls')
}
function onDownload(items: FileItem[]) {
  for (const item of items) {
    if (item.isDir || item.name === '..') continue
    sendCommand(`get ${item.name}`)
  }
}
function onSendToRemote(items: FileItem[]) {
  for (const item of items) {
    if (item.isDir || item.name === '..') continue
    sendCommand(`put ${item.name}`)
  }
}
function onSendToLocal(items: FileItem[]) {
  for (const item of items) {
    if (item.isDir || item.name === '..') continue
    sendCommand(`get ${item.name}`)
  }
}
function onRename(item: FileItem) {
  const newName = prompt(`Rename "${item.name}" to:`, item.name)
  if (newName && newName !== item.name) {
    sendCommand(`mv ${item.name} ${newName}`)
  }
}
function onMove(items: FileItem[]) {
  const path = prompt(`Move ${items.length} item(s) to:`)
  if (path) {
    for (const item of items) {
      sendCommand(`mv ${item.name} ${path}`)
    }
  }
}
function onDelete(items: FileItem[]) {
  const hasDir = items.some(i => i.isDir)
  const hasFile = items.some(i => !i.isDir)
  let msg = `Delete ${items.length} item(s)?`
  if (hasDir && hasFile) msg = `Delete ${items.length} items (files and directories)?`
  else if (hasDir) msg = `Delete ${items.length} director${items.length > 1 ? 'ies' : 'y'}?`
  else msg = `Delete ${items.length} file(s)?`
  if (confirm(msg)) {
    for (const item of items) {
      if (item.isDir) {
        sendCommand(`rmdir ${item.name}`)
      } else {
        sendCommand(`rm ${item.name}`)
      }
    }
  }
}
function onMkdir() {
  const name = prompt('New directory name:')
  if (name) sendCommand(`mkdir ${name}`)
}
function onChmod(item: FileItem) {
  const mode = prompt(`Change permission for "${item.name}" (e.g. 755):`)
  if (mode) sendCommand(`chmod ${mode} ${item.name}`)
}

function onDragOver(e: DragEvent) {
  e.dataTransfer!.dropEffect = 'move'
}

function onDropLocal(e: DragEvent) {
  e.preventDefault()
  const data = e.dataTransfer?.getData('application/sftp-file')
  if (!data) return
  try {
    const item = JSON.parse(data)
    if (item.mode === 'remote') {
      sendCommand(`get ${item.name}`)
    }
  } catch {}
}

function onDropRemote(e: DragEvent) {
  e.preventDefault()
  const data = e.dataTransfer?.getData('application/sftp-file')
  if (!data) return
  try {
    const item = JSON.parse(data)
    if (item.mode === 'local') {
      sendCommand(`put ${item.name}`)
    }
  } catch {}
}
</script>

<style scoped>
.sftp-tab-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.panes-area {
  flex: 3;
  display: flex;
  overflow: hidden;
}
.local-pane, .remote-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--border-subtle);
}
.remote-pane {
  border-right: none;
}
.command-line-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid var(--border-subtle);
}
</style>
