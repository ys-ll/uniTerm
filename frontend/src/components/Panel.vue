<template>
  <div class="panel" draggable="true" @dragstart="$emit('dragstart', $event)">
    <div v-if="showHeader" class="panel-header">
      <span class="panel-title">{{ panel.title }}</span>
      <button class="panel-close" @click="$emit('close', panel.id)">×</button>
    </div>
    <div ref="terminalRef" class="panel-terminal"></div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useTerminal } from '../composables/useTerminal'
import type { Panel } from '../types/workspace'

const props = defineProps<{
  panel: Panel
  showHeader: boolean
}>()

const emit = defineEmits<{
  close: [panelId: string]
  dragstart: [e: DragEvent]
}>()

const { terminalRef, resize } = useTerminal(
  () => props.panel.sessionId,
  { fontSize: 14 }
)

// Watch panel sessionId changes and retry resize
watch(() => props.panel.sessionId, (newId) => {
  if (newId) {
    const delays = [200, 400, 600, 800, 1000, 1500, 2000]
    delays.forEach((delay) => {
      setTimeout(() => resize(), delay)
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
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.panel-title {
  font-size: 12px;
  color: var(--text-secondary);
}
.panel-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
}
.panel-terminal {
  flex: 1;
  overflow: hidden;
}
</style>
