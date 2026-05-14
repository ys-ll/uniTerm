<template>
  <div ref="sidebarEl" class="ai-sidebar" :class="{ collapsed: !aiStore.visible, resizing: isResizing }" :style="{ width: sidebarWidth + 'px' }">
    <div class="resize-handle" @mousedown="onResizeStart" />
    <div class="ai-header">
      <span>{{ t('ai.title') }}</span>
      <div class="ai-actions">
        <el-button link size="small" @click="openGlobalSettings" :title="t('settings.ai')">
          <el-icon><Setting /></el-icon>
        </el-button>
        <el-button link size="small" @click="aiStore.toggle">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </div>

    <div class="ai-session-bar">
      <el-dropdown trigger="click" @command="onSessionCommand">
        <div class="session-trigger">
          <span class="session-name">{{ currentSessionName }}</span>
          <el-icon><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu class="dark-dropdown">
            <el-dropdown-item command="new">
              <el-icon><Plus /></el-icon> {{ t('ai.newSession') }}
            </el-dropdown-item>
            <el-dropdown-item divided v-if="aiStore.sessions.length > 0" disabled>
              {{ t('ai.recentSessions') }}
            </el-dropdown-item>
            <el-dropdown-item
              v-for="s in aiStore.sessions"
              :key="s.id"
              :command="s.id"
              :class="{ active: s.id === aiStore.currentSessionId }"
            >
              <span class="session-item-name">{{ s.name }}</span>
              <span class="session-time">{{ formatRelativeTime(s.updatedAt) }}</span>
              <el-icon class="session-delete" @click.stop="aiStore.deleteSession(s.id)"><Delete /></el-icon>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div ref="messagesRef" class="ai-messages" @contextmenu="onAIContextMenu">
      <AIMessage
        v-for="msg in visibleMessages"
        :key="msg.id"
        :message="msg"
        @approve="onApprove"
        @reject="onReject"
        @continue="onContinue"
      />
      <div v-if="aiStore.isRunning" class="ai-thinking">
        <div class="thinking-avatar">{{ t('ai.avatarAI') }}</div>
        <div class="thinking-text">{{ t('ai.thinking') }}</div>
      </div>
    </div>

    <!-- AI messages context menu -->
    <div
      v-show="aiMenuVisible"
      ref="aiMenuRef"
      class="ai-context-menu"
      :style="aiMenuStyle"
      @click.stop
    >
      <div class="ai-menu-item" @click="aiCopySelection">{{ t('terminal.copy') }}</div>
      <div class="ai-menu-item" @click="aiAskSelection">{{ t('terminal.askAI') }}</div>
    </div>

    <div class="ai-input">
      <div class="textarea-wrap">
        <el-input
          v-model="input"
          type="textarea"
          :rows="4"
          :placeholder="t('ai.placeholder')"
          @keydown.enter="onKeydownEnter"
        />
        <div class="input-actions">
          <el-dropdown trigger="click" @command="onModelChange" size="small" v-if="settingsStore.settings.ai.models.length > 0">
            <el-button size="small" class="model-btn">
              <span class="model-btn-name">{{ currentModelName }}</span>
              <el-icon class="dropdown-icon"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu class="dark-dropdown">
                <el-dropdown-item
                  v-for="m in settingsStore.settings.ai.models"
                  :key="m.id"
                  :command="m.id"
                  :class="{ active: m.id === settingsStore.settings.ai.activeModelId }"
                >
                  {{ m.name }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-dropdown trigger="click" @command="onModeChange" size="small">
            <el-button :type="modeButtonType" size="small">
              {{ modeLabel }}<el-icon class="dropdown-icon"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu class="dark-dropdown">
                <el-dropdown-item command="confirm_all">
                  <span class="mode-option mode-confirm">{{ t('ai.confirmAll') }}</span>
                </el-dropdown-item>
                <el-dropdown-item command="confirm_dangerous">
                  <span class="mode-option mode-warning">{{ t('ai.confirmDangerous') }}</span>
                </el-dropdown-item>
                <el-dropdown-item command="bypass">
                  <span class="mode-option mode-auto">{{ t('ai.bypass') }}</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button v-if="!aiStore.isRunning" type="primary" size="small" :disabled="!input.trim()" @click="onSend">
            {{ t('ai.send') }}
          </el-button>
          <el-button v-else type="danger" size="small" @click="onStop">{{ t('ai.stop') }}</el-button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, computed, watch, onMounted, onUnmounted } from 'vue'
import { Setting, Close, ArrowDown, Plus, Delete } from '@element-plus/icons-vue'
import { useAIStore } from '../stores/aiStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { usePanelStore } from '../stores/panelStore'
import { useI18n } from '../i18n'
import { runAgent, approveTool, rejectTool, continueAgent } from '../services/agent'
import type { ExecutionMode, AIConfig } from '../types/ai'
import AIMessage from './AIMessage.vue'

const aiStore = useAIStore()
const settingsStore = useSettingsStore()
const workspaceStore = useWorkspaceStore()
const panelStore = usePanelStore()
const { t } = useI18n()
const input = ref('')

const visibleMessages = computed(() => {
  return aiStore.messages.filter(m => {
    // Real tool_results (with tool_call_id) are shown via assistant's tool_calls, hide them here
    if (m.role === 'tool' && m.tool_call_id) return false
    // Display-only tool messages (system errors, no tool_call_id) should be visible
    if (m.role === 'tool' && !m.tool_call_id) return true
    if (m.role !== 'assistant') return true
    // 过滤掉内容为空且没有可展示内容的 assistant 消息
    return m.content || m.tool_calls?.length || m.pendingTools?.length || m.needsContinue
  })
})
const messagesRef = ref<HTMLDivElement>()
const aiMenuRef = ref<HTMLDivElement>()
const sidebarWidth = ref(360)
const isResizing = ref(false)
const sidebarEl = ref<HTMLDivElement>()
const aiMenuVisible = ref(false)
const aiMenuStyle = ref({ left: '0px', top: '0px' })
const isAtBottom = ref(true)
let mutationObserver: MutationObserver | null = null

const currentSessionName = computed(() => {
  const s = aiStore.sessions.find(s => s.id === aiStore.currentSessionId)
  return s?.name || t('ai.newSession')
})

const modeLabel = computed(() => {
  switch (aiStore.mode) {
    case 'bypass': return t('ai.bypass')
    case 'confirm_dangerous': return t('ai.confirmDangerous')
    default: return t('ai.confirmAll')
  }
})

const modeButtonType = computed(() => {
  switch (aiStore.mode) {
    case 'bypass': return 'danger'
    case 'confirm_dangerous': return 'warning'
    default: return 'success'
  }
})

const currentModelName = computed(() => {
  const m = settingsStore.settings.ai.models.find(m => m.id === settingsStore.settings.ai.activeModelId)
  return m?.name || 'Model'
})

function onModeChange(mode: string) {
  aiStore.mode = mode as ExecutionMode
}

function onModelChange(modelId: string) {
  settingsStore.setActiveModel(modelId)
  const model = settingsStore.settings.ai.models.find(m => m.id === modelId)
  if (model) {
    aiStore.setConfig({
      apiKey: model.apiKey,
      baseURL: model.baseURL,
      model: model.model,
    })
  }
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return t('ai.justNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('ai.minutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('ai.hoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return t('ai.daysAgo', { n: days })
  const months = Math.floor(days / 30)
  if (months < 12) return t('ai.monthsAgo', { n: months })
  const years = Math.floor(months / 12)
  return t('ai.yearsAgo', { n: years })
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
      isAtBottom.value = true
    }
  })
}

function onMessagesScroll() {
  if (!messagesRef.value) return
  const el = messagesRef.value
  isAtBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 30
}

function autoScrollToBottom() {
  if (isAtBottom.value && messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

function closeAIMenu() {
  aiMenuVisible.value = false
}

function onAIContextMenu(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  // Close other context menus via global event
  window.dispatchEvent(new CustomEvent('global:close-context-menus'))
  aiMenuStyle.value = fitMenuPosition(e.clientX, e.clientY, 120, 76)
  aiMenuVisible.value = true
}

function fitMenuPosition(x: number, y: number, menuW: number, menuH: number) {
  let left = x
  let top = y
  if (x + menuW > window.innerWidth) left = x - menuW
  if (y + menuH > window.innerHeight) top = y - menuH
  return { left: left + 'px', top: top + 'px' }
}

function aiCopySelection() {
  const selection = window.getSelection()
  if (selection && selection.toString()) {
    navigator.clipboard.writeText(selection.toString())
  }
  closeAIMenu()
}

function aiAskSelection() {
  const selection = window.getSelection()
  if (selection && selection.toString()) {
    input.value = selection.toString()
    if (!aiStore.visible) {
      aiStore.visible = true
    }
  }
  closeAIMenu()
}

function onSessionCommand(command: string) {
  if (command === 'new') {
    aiStore.createSession()
  } else {
    aiStore.switchSession(command)
  }
}

watch(() => aiStore.currentSessionId, () => {
  isAtBottom.value = true
  scrollToBottom()
})

function onKeydownEnter(e: KeyboardEvent) {
  if (e.shiftKey) {
    // Allow default newline behavior
    return
  }
  e.preventDefault()
  onSend()
}

async function onSend() {
  const text = input.value.trim()
  if (!text || aiStore.isRunning) return
  input.value = ''
  scrollToBottom()
  await runAgent(text)
  scrollToBottom()
}

function onStop() {
  aiStore.stop()
}

async function onApprove(messageId: string) {
  console.log('[DEBUG] onApprove clicked, messageId=', messageId)
  await approveTool(messageId)
  scrollToBottom()
}

function onReject(messageId: string) {
  console.log('[DEBUG] onReject clicked, messageId=', messageId)
  rejectTool(messageId)
  scrollToBottom()
}

async function onContinue() {
  await continueAgent()
  scrollToBottom()
}

function openGlobalSettings() {
  settingsStore.openCategory = 'ai'
  const existing = Array.from(panelStore.panels.values()).find(p => p.type === 'settings')
  if (existing) {
    const ws = workspaceStore.workspaces.find(w => w.panelIds.includes(existing.id))
    if (ws) {
      workspaceStore.setActiveWorkspace(ws.id)
    }
    return
  }
  const panel = panelStore.createPanel(null, 'settings')
  panel.title = t('settings.title')
  const workspace = workspaceStore.createWorkspace(t('settings.title'), panel.id)
  panelStore.movePanelToWorkspace(panel.id, workspace.id)
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
    const delta = startX - ev.clientX
    const newWidth = Math.min(Math.max(startWidth + delta, 240), 800)
    sidebarWidth.value = newWidth
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

function onAskAI(e: Event) {
  const text = (e as CustomEvent).detail as string
  if (text) {
    input.value = text
    if (!aiStore.visible) {
      aiStore.visible = true
    }
  }
}

onMounted(() => {
  window.addEventListener('ai:ask', onAskAI)
  window.addEventListener('global:close-context-menus', closeAIMenu)
  document.addEventListener('click', closeAIMenu)

  if (messagesRef.value) {
    messagesRef.value.addEventListener('scroll', onMessagesScroll)
    mutationObserver = new MutationObserver(() => {
      if (isAtBottom.value) {
        autoScrollToBottom()
      }
    })
    mutationObserver.observe(messagesRef.value, { childList: true, subtree: true })
  }
  scrollToBottom()
})

onUnmounted(() => {
  window.removeEventListener('ai:ask', onAskAI)
  window.removeEventListener('global:close-context-menus', closeAIMenu)
  document.removeEventListener('click', closeAIMenu)

  if (messagesRef.value) {
    messagesRef.value.removeEventListener('scroll', onMessagesScroll)
  }
  mutationObserver?.disconnect()
})
</script>

<style scoped>
.ai-sidebar {
  background: var(--bg-elevated);
  display: flex;
  flex-direction: column;
  position: relative;
  flex-shrink: 0;
}
.ai-sidebar.collapsed {
  width: 0 !important;
  overflow: hidden;
}
.ai-sidebar.resizing {
  transition: none;
}
.resize-handle {
  position: absolute;
  left: 0;
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
.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-size: 12px;
  font-family: var(--font-ui);
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.5px;
}
.ai-actions {
  display: flex;
  gap: 2px;
}
.ai-session-bar {
  padding: 6px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.session-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--text-primary);
  box-shadow: inset 0 0 0 1px var(--border-subtle);
  transition: all 0.12s ease;
}
.session-trigger:hover {
  background: var(--bg-hover);
  box-shadow: inset 0 0 0 1px var(--border-hover);
}
.session-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-time {
  margin-left: 8px;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  white-space: nowrap;
}
.session-delete {
  margin-left: 8px;
  opacity: 0;
  transition: opacity 0.15s;
  color: var(--text-muted);
}
.session-delete:hover {
  color: var(--text-primary);
}
:deep(.el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  font-family: var(--font-ui);
  font-size: 12px;
}
:deep(.el-dropdown-menu__item:hover .session-delete) {
  opacity: 1;
}
:deep(.el-dropdown-menu__item.active) {
  background: rgba(52, 211, 153, 0.08);
  color: var(--success);
}

:deep(.dark-dropdown) {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border-subtle) !important;
  border-radius: var(--radius-md) !important;
  box-shadow: var(--shadow-md) !important;
}
:deep(.dark-dropdown .el-dropdown-menu__item) {
  color: var(--text-secondary);
}
:deep(.dark-dropdown .el-dropdown-menu__item.is-disabled) {
  color: var(--text-disabled);
}
:deep(.dark-dropdown .el-dropdown-menu__item:not(.is-disabled):hover) {
  background: var(--bg-hover);
  color: var(--text-primary);
}
:deep(.dark-dropdown .el-dropdown-menu__item.divided) {
  border-top: 1px solid var(--border-subtle);
}
:deep(.dark-dropdown .el-dropdown-menu__item.divided::before) {
  background-color: var(--border-subtle);
}
.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  user-select: text;
  -webkit-user-select: text;
}
.ai-thinking {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 14px;
}
.thinking-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-dim), var(--accent));
  color: #fff;
  font-size: 9px;
  font-family: var(--font-ui);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  letter-spacing: 0.5px;
}
.thinking-text {
  font-size: 11px;
  font-family: var(--font-ui);
  color: var(--text-muted);
  font-style: italic;
}
.ai-input {
  padding: 10px 12px;
  flex-shrink: 0;
}
.textarea-wrap {
  position: relative;
}
.textarea-wrap :deep(.el-textarea__inner) {
  padding-bottom: 36px;
}
.input-actions {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: flex;
  gap: 8px;
  align-items: center;
  z-index: 2;
}
.dropdown-icon {
  margin-left: 4px;
}
.model-btn {
  padding-left: 8px;
  padding-right: 6px;
}
.model-btn-name {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  vertical-align: middle;
}
.mode-option {
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-ui);
}
.mode-auto {
  color: var(--error);
}
.mode-confirm {
  color: var(--success);
}
.mode-warning {
  color: var(--warning);
}

.ai-context-menu {
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

.ai-menu-item {
  padding: 7px 14px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  border-radius: var(--radius-sm);
  transition: all 0.1s ease;
}

.ai-menu-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>