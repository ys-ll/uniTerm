<template>
  <div
    class="panel"
    :class="{ 'panel-active': isActive }"
    draggable="true"
    @dragstart="emit('dragstart', $event)"
  >
    <div v-if="showHeader" class="panel-header" :class="{ 'ai-locked': isAILocked }" @dblclick.stop>
      <span class="panel-title">{{ panel.title }}</span>
      <div class="panel-header-actions">
        <button
          v-if="panel.type === 'ssh'"
          class="panel-ai-lock"
          :class="{ locked: isAILocked }"
          @click.stop="emit('toggleAiLock', panel.id)"
          :title="isAILocked ? t('terminal.aiLockedToPanel') : t('terminal.lockAIToPanel')"
        >AI</button>
        <button class="panel-close" @click.stop="emit('close', panel.id)">×</button>
      </div>
    </div>
    <BaseTerminal
      ref="baseTerminalRef"
      mode="ssh"
      :session-id="panel.sessionId"
      :on-session-status="onSessionStatus"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import BaseTerminal from './BaseTerminal.vue'
import { useTabStore } from '../stores/tabStore'
import { usePanelStore } from '../stores/panelStore'
import { useSessionStore } from '../stores/sessionStore'
import { CreateSession } from '../../wailsjs/go/main/App'
import { useI18n } from '../i18n'
import type { Panel } from '../types/workspace'

const { t } = useI18n()

const props = defineProps<{
  panel: Panel
  showHeader: boolean
  isActive: boolean
}>()

const emit = defineEmits<{
  close: [panelId: string]
  dragstart: [e: DragEvent]
  toggleAiLock: [panelId: string]
}>()

const tabStore = useTabStore()
const panelStore = usePanelStore()
const sessionStore = useSessionStore()

const isAILocked = computed(() =>
  tabStore.aiLockedPanelId === props.panel.id
)

const baseTerminalRef = ref<InstanceType<typeof BaseTerminal> | null>(null)

function onSessionStatus(status: string) {
  if (status === 'retry') {
    retryConnection()
  }
}

async function retryConnection() {
  if (!props.panel.config) return
  baseTerminalRef.value?.write('\r\n\x1b[33mReconnecting...\x1b[0m\r\n')
  try {
    const info = await CreateSession(props.panel.config.type, props.panel.config)
    panelStore.bindSession(props.panel.id, info.id)
    sessionStore.initSession(info.id)
  } catch (e: any) {
    baseTerminalRef.value?.write(`\r\n\x1b[31mReconnect failed: ${e}\x1b[0m\r\n`)
    baseTerminalRef.value?.setRetryOnEnter(true)
  }
}

// Watch panel sessionId changes and retry resize
watch(() => props.panel.sessionId, (newId) => {
  if (newId) {
    const delays = [200, 400, 600, 800, 1000, 1500, 2000]
    delays.forEach((delay) => {
      setTimeout(() => baseTerminalRef.value?.resize(), delay)
    })
  }
})
</script>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-base);
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  cursor: grab;
}
.panel-header:active {
  cursor: grabbing;
}
.panel-active .panel-header {
  background: var(--bg-elevated);
  border-bottom-color: var(--accent-dim);
}
.panel-header.ai-locked {
  border-left: 3px solid var(--warning, #f59e0b);
  box-shadow: inset 0 0 12px rgba(245, 158, 11, 0.12);
}
.panel-title {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel-active .panel-title {
  color: var(--text-primary);
}
.panel-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.panel-ai-lock {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
}
.panel-ai-lock:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.panel-ai-lock.locked {
  color: var(--warning, #f59e0b);
}
.panel-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
}
.panel-close:hover {
  color: var(--text-primary);
}
</style>
