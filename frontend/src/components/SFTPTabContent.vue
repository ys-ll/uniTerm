<template>
  <div class="sftp-tab-content">
    <div class="panes-area">
      <div
        class="local-pane"
        @dragover.prevent="onDragOver"
        @dragenter.prevent="onDragEnter('local')"
        @dragleave="onDragLeave('local')"
        @drop.capture="onDropLocal"
      >
        <div v-if="dragOverLocal" class="drop-overlay">
          <span>{{ t('sftp.dropHere') }}</span>
        </div>
        <SFTPPathBreadcrumb :label="t('sftp.local')" :path="localCwd" :drives="localDrives" @navigate="onLocalNavigate" />
        <SFTPFileList
          mode="local"
          :files="localFiles"
          :loading="loadingLocal"
          @navigate="onLocalNavigate"
          @send-to-other="onSendToRemote"
          @rename="(item: FileItem) => { dialogMode = 'local'; onRename(item) }"
          @delete="(items: FileItem[]) => { dialogMode = 'local'; onDelete(items) }"
          @refresh="onRefreshLocal"
          @mkdir="() => { dialogMode = 'local'; onMkdir() }"
          @cancel-load="onCancelLoadLocal"
        />
      </div>
      <div
        class="remote-pane"
        @dragover.prevent="onDragOver"
        @dragenter.prevent="onDragEnter('remote')"
        @dragleave="onDragLeave('remote')"
        @drop.capture="onDropRemote"
      >
        <div v-if="dragOverRemote" class="drop-overlay">
          <span>{{ t('sftp.dropHere') }}</span>
        </div>
        <SFTPPathBreadcrumb :label="panel?.config?.host || t('sftp.remote')" :path="cwd" @navigate="onRemoteNavigate" />
        <SFTPFileList
          mode="remote"
          :files="remoteFiles"
          :loading="loadingRemote"
          @navigate="onRemoteNavigate"
          @send-to-other="onSendToLocal"
          @rename="(item: FileItem) => { dialogMode = 'remote'; onRename(item) }"
          @delete="(items: FileItem[]) => { dialogMode = 'remote'; onDelete(items) }"
          @refresh="onRefreshRemote"
          @mkdir="() => { dialogMode = 'remote'; onMkdir() }"
          @chmod="(item: FileItem) => { dialogMode = 'remote'; onChmod(item) }"
          @upload="onUpload"
          @download-to="onDownloadTo"
          @cancel-load="onCancelLoadRemote"
        />
      </div>
    </div>
    <SFTPTransferProgress :tasks="transferTasks" @cancel="onCancelTransfer" @pause="onPauseTransfer" @resume="onResumeTransfer" />

    <!-- Custom Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="400px"
      :close-on-click-modal="false"
      @closed="onDialogClosed"
    >
      <template v-if="dialogType === 'delete'">
        <p>{{ dialogMessage }}</p>
      </template>
      <template v-else-if="dialogType === 'chmod'">
        <div class="chmod-file-info">
          <span class="chmod-filename">{{ dialogItem?.name }}</span>
          <span v-if="dialogItem?.owner || dialogItem?.group" class="chmod-ownergroup">{{ dialogItem?.owner || '-' }}:{{ dialogItem?.group || '-' }}</span>
        </div>
        <table class="chmod-table">
          <thead>
            <tr>
              <th></th>
              <th>Read</th>
              <th>Write</th>
              <th>Execute</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="chmod-row-label">Owner</td>
              <td><el-checkbox v-model="chmodOwnerR" /></td>
              <td><el-checkbox v-model="chmodOwnerW" /></td>
              <td><el-checkbox v-model="chmodOwnerX" /></td>
            </tr>
            <tr>
              <td class="chmod-row-label">Group</td>
              <td><el-checkbox v-model="chmodGroupR" /></td>
              <td><el-checkbox v-model="chmodGroupW" /></td>
              <td><el-checkbox v-model="chmodGroupX" /></td>
            </tr>
            <tr>
              <td class="chmod-row-label">Other</td>
              <td><el-checkbox v-model="chmodOtherR" /></td>
              <td><el-checkbox v-model="chmodOtherW" /></td>
              <td><el-checkbox v-model="chmodOtherX" /></td>
            </tr>
          </tbody>
        </table>
      </template>
      <template v-else>
        <el-input v-model="dialogInput" :placeholder="dialogPlaceholder" @keyup.enter="onDialogConfirm" />
      </template>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('sftp.dialog.cancel') }}</el-button>
        <el-button type="primary" @click="onDialogConfirm">{{ t('sftp.dialog.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { usePanelStore } from '../stores/panelStore'
import { useI18n } from '../i18n'
import {
  SftpListRemote, SftpListLocal, SftpListLocalDrives,
  SftpChangeRemoteDir, SftpChangeLocalDir,
  SftpMakeDir, SftpRemove, SftpRename, SftpChmod,
  SftpLocalRemove, SftpLocalRename, SftpLocalMkdir,
  SftpGet, SftpPut, WriteTempFile, SftpCancelTransfer, SftpPauseTransfer, SftpResumeTransfer, ListSessions, GetDesktopPath,
  OpenMultipleFilesDialog, OpenDirectoryDialog,
} from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime'
import SFTPPathBreadcrumb from './SFTPPathBreadcrumb.vue'
import SFTPFileList from './SFTPFileList.vue'
import SFTPTransferProgress from './SFTPTransferProgress.vue'
import type { FileItem } from './SFTPFileList.vue'
import type { TransferTaskUI } from '../stores/panelStore'

const props = defineProps<{
  panelId: string
}>()

const panelStore = usePanelStore()
const transferTasks = panelStore.getTransferTasks(props.panelId)
const { t } = useI18n()
const panel = computed(() => panelStore.getPanel(props.panelId))

const localCwd = ref('/')
const cwd = ref('/')
const localFiles = ref<FileItem[]>([])
const remoteFiles = ref<FileItem[]>([])
const localDrives = ref<string[]>([])
const loadingLocal = ref(false)
const loadingRemote = ref(false)
let loadVersionLocal = 0
let loadVersionRemote = 0
const dragOverLocal = ref(false)
const dragOverRemote = ref(false)
const dragSource = ref<'local' | 'remote' | null>(null)
let dragEnterLocalCount = 0
let dragEnterRemoteCount = 0
let dragDroppedInternally = false
let draggedRemoteItems: FileItem[] = []
const dialogMode = ref<'local' | 'remote'>('remote')

function joinPath(base: string, name: string): string {
  if (base.endsWith('/') || base.endsWith('\\')) return base + name
  return base + '/' + name
}

// Dialog state
const dialogVisible = ref(false)
const dialogType = ref<'rename' | 'mkdir' | 'chmod' | 'delete'>('rename')
const dialogTitle = ref('')
const dialogMessage = ref('')
const dialogInput = ref('')
const dialogPlaceholder = ref('')
const dialogItem = ref<FileItem | null>(null)
const dialogItems = ref<FileItem[]>([])

// Chmod checkbox state
const chmodOwnerR = ref(false)
const chmodOwnerW = ref(false)
const chmodOwnerX = ref(false)
const chmodGroupR = ref(false)
const chmodGroupW = ref(false)
const chmodGroupX = ref(false)
const chmodOtherR = ref(false)
const chmodOtherW = ref(false)
const chmodOtherX = ref(false)

const chmodOctal = computed(() => {
  const o = (chmodOwnerR.value ? 4 : 0) + (chmodOwnerW.value ? 2 : 0) + (chmodOwnerX.value ? 1 : 0)
  const g = (chmodGroupR.value ? 4 : 0) + (chmodGroupW.value ? 2 : 0) + (chmodGroupX.value ? 1 : 0)
  const t = (chmodOtherR.value ? 4 : 0) + (chmodOtherW.value ? 2 : 0) + (chmodOtherX.value ? 1 : 0)
  return String(o) + String(g) + String(t)
})

function parseMode(mode: string) {
  // mode example: "drwxr-xr-x" or "-rw-r--r--" — strip leading file type char
  const m = mode.length >= 10 ? mode.slice(1) : mode
  chmodOwnerR.value = m[0] === 'r'
  chmodOwnerW.value = m[1] === 'w'
  chmodOwnerX.value = m[2] === 'x' || m[2] === 's'
  chmodGroupR.value = m[3] === 'r'
  chmodGroupW.value = m[4] === 'w'
  chmodGroupX.value = m[5] === 'x' || m[5] === 's'
  chmodOtherR.value = m[6] === 'r'
  chmodOtherW.value = m[7] === 'w'
  chmodOtherX.value = m[8] === 'x' || m[8] === 't'
}

let unsubscribe: (() => void) | null = null
let unsubscribeStatus: (() => void) | null = null

onMounted(async () => {
  document.addEventListener('dragstart', onDragStart)
  document.addEventListener('dragend', clearDragState)
  document.addEventListener('drop', onDocumentDrop)

  unsubscribeStatus = EventsOn('session:status', (payload: { id: string; status: string }) => {
    if (payload.id === panel.value?.sessionId && payload.status === 'connected') {
      onRefreshLocal()
      onRefreshRemote()
    }
  })

  unsubscribe = EventsOn('session:data', (payload: { id: string; data: string }) => {
    if (payload.id !== panel.value?.sessionId) return
    const match = payload.data.match(/\x1b\]633;S([^\x07]*)\x07/)
    if (!match) return
    try {
      const msg = JSON.parse(match[1])
      if (msg.type === 'sftp:transfer') {
        if (msg.event === 'start') {
          const existing = transferTasks.find(t => t.id === msg.taskId)
          if (existing) {
            existing.status = 'running'
            existing.speed = ''
            existing.eta = ''
            existing.lastBytes = 0
            existing.lastTime = Date.now()
          } else {
            transferTasks.push({
              id: msg.taskId,
              type: msg.tfType,
              name: msg.name,
              percentage: 0,
              speed: '',
              eta: '',
              status: 'running',
              lastBytes: 0,
              lastTime: Date.now(),
              total: msg.total || 0
            })
          }
        } else if (msg.event === 'progress') {
          const existing = transferTasks.find(t => t.id === msg.taskId)
          if (existing) {
            existing.total = msg.total || existing.total
            existing.percentage = existing.total > 0 ? Math.round((msg.progress / existing.total) * 100) : 0
            const now = Date.now()
            const elapsed = (now - existing.lastTime) / 1000
            if (elapsed >= 0.5) {
              const bytesSince = msg.progress - existing.lastBytes
              const bytesPerSec = bytesSince / elapsed
              existing.speed = formatSpeed(bytesPerSec)
              if (bytesPerSec > 0 && existing.total > 0) {
                const remaining = (existing.total - msg.progress) / bytesPerSec
                existing.eta = formatETA(remaining)
              }
              existing.lastBytes = msg.progress
              existing.lastTime = now
            }
          }
        } else if (msg.event === 'complete') {
          const existing = transferTasks.find(t => t.id === msg.taskId)
          if (existing) {
            const st = msg.status as string
            existing.status = st === 'done' ? 'done' : st === 'cancelled' ? 'cancelled' : st === 'paused' ? 'paused' : 'error'
            existing.percentage = existing.status === 'done' ? 100 : existing.percentage
            if (existing.status === 'done') {
              if (existing.type === 'download') {
                onRefreshLocal()
              } else {
                onRefreshRemote()
              }
            }
            if (existing.status !== 'running' && existing.status !== 'paused') {
              setTimeout(() => {
                const idx = transferTasks.findIndex(t => t.id === msg.taskId)
                if (idx >= 0) transferTasks.splice(idx, 1)
              }, 5000)
            }
          }
        }
      }
    } catch {}
  })

  // Proactively check if session is already connected (race: event may have fired before listener registered)
  const sid = panel.value?.sessionId
  if (sid) {
    fetchLocalDrives()
    try {
      const sessions = await ListSessions()
      const sess = sessions.find(s => s.id === sid)
      if (sess && sess.status === 'connected') {
        onRefreshLocal()
        onRefreshRemote()
      }
    } catch {}
  }
})

watch(() => panel.value?.sessionId, (newId, oldId) => {
  if (newId && !oldId) {
    fetchLocalDrives()
  }
})

onUnmounted(() => {
  document.removeEventListener('dragstart', onDragStart)
  document.removeEventListener('dragend', clearDragState)
  document.removeEventListener('drop', onDocumentDrop)
  unsubscribe?.()
  unsubscribeStatus?.()
})

async function fetchLocalDrives() {
  const sid = panel.value?.sessionId
  if (!sid) return
  try {
    const drives = await SftpListLocalDrives(sid)
    localDrives.value = drives.map(d => d.name)
  } catch {}
}

function onCancelLoadLocal() {
  loadVersionLocal++
  loadingLocal.value = false
}

function onCancelLoadRemote() {
  loadVersionRemote++
  loadingRemote.value = false
}

async function onRefreshLocal() {
  const sid = panel.value?.sessionId
  if (!sid) return
  const version = ++loadVersionLocal
  loadingLocal.value = true
  try {
    const result = await SftpListLocal(sid, '')
    if (version !== loadVersionLocal) return
    localFiles.value = result.files
    localCwd.value = result.dir
    if (/^[A-Za-z]:\\$/.test(result.dir)) {
      try {
        const drives = await SftpListLocalDrives(sid)
        if (version !== loadVersionLocal) return
        localDrives.value = drives.map(d => d.name)
      } catch {}
    }
  } catch (e: any) {
    if (version !== loadVersionLocal) return
    ElMessage.error(e?.toString() || 'Failed to list local files')
  } finally {
    if (version === loadVersionLocal) loadingLocal.value = false
  }
}

async function onRefreshRemote() {
  const sid = panel.value?.sessionId
  if (!sid) return
  const version = ++loadVersionRemote
  loadingRemote.value = true
  try {
    const result = await SftpListRemote(sid, '')
    if (version !== loadVersionRemote) return
    remoteFiles.value = result.files
    cwd.value = result.dir
  } catch (e: any) {
    if (version !== loadVersionRemote) return
    ElMessage.error(e?.toString() || 'Failed to list remote files')
  } finally {
    if (version === loadVersionRemote) loadingRemote.value = false
  }
}

async function onLocalNavigate(path: string) {
  const sid = panel.value?.sessionId
  if (!sid) return
  let fullPath: string
  if (path === '..') {
    const parts = localCwd.value.replace(/\\/g, '/').split('/').filter(Boolean)
    parts.pop()
    if (parts.length === 0) {
      fullPath = localCwd.value
    } else if (/^[A-Za-z]:$/.test(parts[0])) {
      fullPath = parts[0] + '\\' + parts.slice(1).join('\\')
    } else {
      fullPath = '/' + parts.join('/')
    }
  } else if (!path.startsWith('/') && !/^[A-Za-z]:/.test(path)) {
    fullPath = joinPath(localCwd.value, path)
  } else {
    fullPath = path
  }
  const version = ++loadVersionLocal
  loadingLocal.value = true
  try {
    const result = await SftpChangeLocalDir(sid, fullPath)
    if (version !== loadVersionLocal) return
    localFiles.value = result.files
    localCwd.value = result.dir
    if (/^[A-Za-z]:\\$/.test(result.dir)) {
      try {
        const drives = await SftpListLocalDrives(sid)
        if (version !== loadVersionLocal) return
        localDrives.value = drives.map(d => d.name)
      } catch {}
    }
  } catch (e: any) {
    if (version !== loadVersionLocal) return
    ElMessage.error(e?.toString() || 'Failed to navigate')
  } finally {
    if (version === loadVersionLocal) loadingLocal.value = false
  }
}

async function onRemoteNavigate(path: string) {
  const sid = panel.value?.sessionId
  if (!sid) return
  let fullPath: string
  if (path === '..') {
    fullPath = cwd.value.split('/').filter(Boolean).slice(0, -1).join('/')
    fullPath = '/' + fullPath
  } else if (!path.startsWith('/')) {
    fullPath = joinPath(cwd.value, path)
  } else {
    fullPath = path
  }
  const version = ++loadVersionRemote
  loadingRemote.value = true
  try {
    const result = await SftpChangeRemoteDir(sid, fullPath)
    if (version !== loadVersionRemote) return
    remoteFiles.value = result.files
    cwd.value = result.dir
  } catch (e: any) {
    if (version !== loadVersionRemote) return
    ElMessage.error(e?.toString() || 'Failed to navigate')
  } finally {
    if (version === loadVersionRemote) loadingRemote.value = false
  }
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return Math.round(bytesPerSec) + ' B/s'
  if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s'
  if (bytesPerSec < 1024 * 1024 * 1024) return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s'
  return (bytesPerSec / (1024 * 1024 * 1024)).toFixed(1) + ' GB/s'
}

function formatETA(seconds: number): string {
  if (seconds < 1) return ''
  if (seconds < 60) return Math.round(seconds) + 's'
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + Math.round(seconds % 60) + 's'
  return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm'
}

async function onCancelTransfer(taskId: string) {
  const sid = panel.value?.sessionId
  if (!sid) return
  try {
    await SftpCancelTransfer(sid, taskId)
  } catch (e) {
    console.error('cancel transfer:', e)
  }
}

async function onPauseTransfer(taskId: string) {
  const sid = panel.value?.sessionId
  if (!sid) return
  try {
    await SftpPauseTransfer(sid, taskId)
  } catch (e) {
    console.error('pause transfer:', e)
  }
}

async function onResumeTransfer(taskId: string) {
  const sid = panel.value?.sessionId
  if (!sid) return
  try {
    await SftpResumeTransfer(sid, taskId)
  } catch (e) {
    console.error('resume transfer:', e)
  }
}

function onSendToRemote(items: FileItem[]) {
  const sid = panel.value?.sessionId
  if (!sid) return
  for (const item of items) {
    if (item.name === '..') continue
    const localPath = joinPath(localCwd.value, item.name)
    const remotePath = cwd.value + '/' + item.name
    SftpPut(sid, localPath, remotePath, item.isDir)
  }
}

function onSendToLocal(items: FileItem[]) {
  const sid = panel.value?.sessionId
  if (!sid) return
  for (const item of items) {
    if (item.name === '..') continue
    const remotePath = joinPath(cwd.value, item.name)
    const localPath = joinPath(localCwd.value, item.name).replace(/\\/g, '/')
    SftpGet(sid, remotePath, localPath, item.isDir)
  }
}

async function onUpload() {
  const sid = panel.value?.sessionId
  if (!sid) return
  try {
    const files = await OpenMultipleFilesDialog()
    if (!files || files.length === 0) return
    for (const fp of files) {
      const name = fp.replace(/\\/g, '/').split('/').pop() || 'upload'
      SftpPut(sid, fp, cwd.value + '/' + name, false)
    }
  } catch (e) {
    console.error('upload:', e)
  }
}

async function onDownloadTo(items: FileItem[]) {
  const sid = panel.value?.sessionId
  if (!sid) return
  try {
    const dir = await OpenDirectoryDialog()
    if (!dir) return
    for (const item of items) {
      if (item.name === '..') continue
      const remotePath = joinPath(cwd.value, item.name)
      const localPath = (dir + '/' + item.name).replace(/\\/g, '/')
      SftpGet(sid, remotePath, localPath, item.isDir)
    }
  } catch (e) {
    console.error('downloadTo:', e)
  }
}

// Dialog helpers
function openDialog(
  type: 'rename' | 'mkdir' | 'chmod' | 'delete',
  title: string,
  inputValue: string = '',
  placeholder: string = '',
  message: string = ''
) {
  dialogType.value = type
  dialogTitle.value = title
  dialogInput.value = inputValue
  dialogPlaceholder.value = placeholder
  dialogMessage.value = message
  dialogVisible.value = true
}

function onDialogClosed() {
  dialogInput.value = ''
  dialogPlaceholder.value = ''
  dialogMessage.value = ''
  dialogItem.value = null
  dialogItems.value = []
}

async function onDialogConfirm() {
  dialogVisible.value = false
  const sid = panel.value?.sessionId
  if (!sid) return
  const isLocal = dialogMode.value === 'local'
  const baseDir = isLocal ? localCwd.value : cwd.value
  switch (dialogType.value) {
    case 'rename':
      if (dialogInput.value && dialogInput.value !== dialogItem.value?.name) {
        const oldPath = joinPath(baseDir, dialogItem.value!.name)
        const newPath = joinPath(baseDir, dialogInput.value)
        try {
          if (isLocal) {
            await SftpLocalRename(sid, oldPath, newPath)
            onRefreshLocal()
          } else {
            await SftpRename(sid, oldPath, newPath)
            onRefreshRemote()
          }
        } catch (e) { console.error('rename:', e) }
      }
      break
    case 'mkdir':
      if (dialogInput.value) {
        try {
          if (isLocal) {
            await SftpLocalMkdir(sid, joinPath(baseDir, dialogInput.value))
            onRefreshLocal()
          } else {
            await SftpMakeDir(sid, joinPath(baseDir, dialogInput.value))
            onRefreshRemote()
          }
        } catch (e) { console.error('mkdir:', e) }
      }
      break
    case 'chmod':
      try {
        await SftpChmod(sid, joinPath(baseDir, dialogItem.value!.name), chmodOctal.value)
        onRefreshRemote()
      } catch (e) { console.error('chmod:', e) }
      break
    case 'delete':
      for (const item of dialogItems.value) {
        const itemPath = joinPath(baseDir, item.name)
        try {
          if (isLocal) {
            await SftpLocalRemove(sid, itemPath, item.isDir)
          } else {
            await SftpRemove(sid, itemPath, item.isDir)
          }
        } catch (e) { console.error('delete item:', item.name, e) }
      }
      if (isLocal) {
        onRefreshLocal()
      } else {
        onRefreshRemote()
      }
      break
  }
}

function onRename(item: FileItem) {
  dialogItem.value = item
  openDialog(
    'rename',
    t('sftp.dialog.renameTitle'),
    item.name,
    t('sftp.dialog.renamePrompt', { name: item.name })
  )
}
function onDelete(items: FileItem[]) {
  dialogItems.value = items
  const hasDir = items.some(i => i.isDir)
  const hasFile = items.some(i => !i.isDir)
  let msg: string
  if (hasDir && hasFile) {
    msg = t('sftp.dialog.deleteConfirmMixed', { count: items.length })
  } else if (hasDir) {
    msg = t('sftp.dialog.deleteConfirmDir', { count: items.length })
  } else {
    msg = t('sftp.dialog.deleteConfirmFile', { count: items.length })
  }
  openDialog('delete', t('sftp.dialog.deleteTitle'), '', '', msg)
}
function onMkdir() {
  openDialog('mkdir', t('sftp.dialog.mkdirTitle'), '', t('sftp.dialog.mkdirPrompt'))
}
function onChmod(item: FileItem) {
  dialogItem.value = item
  parseMode(item.mode)
  openDialog(
    'chmod',
    t('sftp.dialog.chmodTitle'),
    '',
    t('sftp.dialog.chmodPrompt', { name: item.name })
  )
}

function onDocumentDrop(e: DragEvent) {
  if (!dragDroppedInternally) {
    // If drop didn't fire on a pane but files are available, handle as external upload
    const files = e.dataTransfer?.files
    if (files && files.length > 0 && dragSource.value === null) {
      e.preventDefault()
      const sid = panel.value?.sessionId
      if (sid) {
        for (let i = 0; i < files.length; i++) {
          const f = files[i]
          const remotePath = cwd.value + '/' + f.name
          const nativePath = (f as any).path
          if (nativePath) {
            SftpPut(sid, nativePath, remotePath, false)
          } else {
            readAndUpload(f, remotePath)
          }
        }
      }
    }
  }
}

async function readAndUpload(file: File, remotePath: string) {
  const sid = panel.value?.sessionId
  if (!sid) return
  const reader = new FileReader()
  reader.onload = async () => {
    const base64 = (reader.result as string).split(',')[1]
    try {
      const tmpPath = await WriteTempFile(file.name, base64)
      SftpPut(sid, tmpPath, remotePath, false)
    } catch (e) {
      ElMessage.error('Failed to prepare file for upload')
    }
  }
  reader.readAsDataURL(file)
}

function onDragOver(e: DragEvent) {
  if (dragSource.value === null) {
    e.dataTransfer!.dropEffect = 'copy'
  } else {
    e.dataTransfer!.dropEffect = 'move'
  }
}

function onDragStart(e: DragEvent) {
  const target = e.target as HTMLElement | null
  dragDroppedInternally = false
  draggedRemoteItems = []
  if (target?.closest('.local-pane')) {
    dragSource.value = 'local'
  } else if (target?.closest('.remote-pane')) {
    dragSource.value = 'remote'
    // Capture the dragged file items for potential drag-out download
    try {
      const raw = e.dataTransfer?.getData('application/sftp-file')
      if (raw) {
        draggedRemoteItems = [JSON.parse(raw)]
      }
    } catch {}
  }
}

function onDragEnter(mode: 'local' | 'remote') {
  // Internal drag: skip overlay on source pane
  if (dragSource.value !== null && dragSource.value === mode) return
  // External drag (from desktop): only show overlay on remote pane
  if (dragSource.value === null && mode === 'local') return
  if (mode === 'local') {
    dragEnterLocalCount++
    dragOverLocal.value = true
  } else {
    dragEnterRemoteCount++
    dragOverRemote.value = true
  }
}

function onDragLeave(mode: 'local' | 'remote') {
  if (mode === 'local') {
    dragEnterLocalCount--
    if (dragEnterLocalCount <= 0) {
      dragEnterLocalCount = 0
      dragOverLocal.value = false
    }
  } else {
    dragEnterRemoteCount--
    if (dragEnterRemoteCount <= 0) {
      dragEnterRemoteCount = 0
      dragOverRemote.value = false
    }
  }
}

async function clearDragState() {
  dragOverLocal.value = false
  dragOverRemote.value = false
  dragEnterLocalCount = 0
  dragEnterRemoteCount = 0
  // Drag-out: remote file dragged outside app (e.g. to desktop)
  if (dragSource.value === 'remote' && !dragDroppedInternally && draggedRemoteItems.length > 0) {
    const sid = panel.value?.sessionId
    if (sid) {
      let desktopPath = ''
      try { desktopPath = await GetDesktopPath() } catch {}
      for (const item of draggedRemoteItems) {
        const remotePath = joinPath(cwd.value, item.name)
        const localPath = (desktopPath || localCwd.value) + '/' + item.name
        SftpGet(sid, remotePath, localPath, item.isDir)
      }
    }
  }
  dragSource.value = null
  draggedRemoteItems = []
}

function onDropLocal(e: DragEvent) {
  e.preventDefault()
  dragDroppedInternally = true
  clearDragState()
  const data = e.dataTransfer?.getData('application/sftp-file')
  if (!data) return
  try {
    const item = JSON.parse(data)
    if (item.mode === 'remote') {
      const remotePath = joinPath(cwd.value, item.name)
      const localPath = joinPath(localCwd.value, item.name).replace(/\\/g, '/')
      SftpGet(panel.value?.sessionId!, remotePath, localPath, item.isDir)
    }
  } catch (e) { console.error('onDropLocal:', e) }
}

function onDropRemote(e: DragEvent) {
  e.preventDefault()
  dragDroppedInternally = true
  clearDragState()
  const sid = panel.value?.sessionId
  if (!sid) return

  // External files from desktop / file explorer
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const remotePath = cwd.value + '/' + f.name
      // Try native path first (WebView2 may expose it), fall back to reading content
      const nativePath = (f as any).path
      if (nativePath) {
        SftpPut(sid, nativePath, remotePath, false)
      } else {
        readAndUpload(f, remotePath)
      }
    }
    return
  }

  // Internal SFTP file drag
  const data = e.dataTransfer?.getData('application/sftp-file')
  if (!data) return
  try {
    const item = JSON.parse(data)
    if (item.mode === 'local') {
      const localPath = joinPath(localCwd.value, item.name)
      const remotePath = cwd.value + '/' + item.name
      SftpPut(panel.value?.sessionId!, localPath, remotePath, item.isDir)
    }
  } catch (e) { console.error('onDropRemote:', e) }
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
  flex: 1;
  display: flex;
  overflow: hidden;
}
.local-pane, .remote-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--border-subtle);
  position: relative;
}
.remote-pane {
  border-right: none;
}
.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
.drop-overlay span {
  font-size: 14px;
  color: #fff;
  padding: 12px 24px;
  border: 2px dashed rgba(255, 255, 255, 0.6);
  border-radius: var(--radius-md);
}
</style>

<style>
.chmod-file-info {
  text-align: center;
  margin-bottom: 16px;
}
.chmod-filename {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-mono, monospace);
}
.chmod-ownergroup {
  display: block;
  font-size: 11px;
  color: var(--text-disabled);
  margin-top: 2px;
}
.chmod-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 12px;
}
.chmod-table th {
  font-size: 11px;
  color: var(--text-disabled);
  font-weight: 500;
  text-transform: uppercase;
  padding: 4px 8px 8px;
  text-align: center;
}
.chmod-table th:first-child {
  text-align: left;
  padding-left: 0;
}
.chmod-table td {
  padding: 6px 8px;
  text-align: center;
}
.chmod-table td:first-child {
  text-align: left;
  padding-left: 0;
}
.chmod-row-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.chmod-octal {
  text-align: center;
  font-size: 20px;
  font-weight: 700;
  font-family: var(--font-mono, monospace);
  color: var(--accent);
}
</style>
