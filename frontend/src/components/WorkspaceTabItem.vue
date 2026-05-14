<template>
  <div
    class="workspace-tab-item"
    :class="{ active: isActive }"
    @click="$emit('activate', workspace.id)"
    draggable="true"
    @dragstart="onDragStart"
  >
    <span class="tab-name">{{ workspace.name }}</span>
    <button
      v-if="isActive || showClose"
      class="tab-close"
      @click.stop="$emit('close', workspace.id)"
    >×</button>
  </div>
</template>

<script setup lang="ts">
import type { Workspace } from '../types/workspace'

const props = defineProps<{
  workspace: Workspace
  isActive: boolean
  showClose?: boolean
}>()

const emit = defineEmits<{
  activate: [id: string]
  close: [id: string]
}>()

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('application/workspace-id', props.workspace.id)
}
</script>

<style scoped>
.workspace-tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  user-select: none;
  border-bottom: 2px solid transparent;
}
.workspace-tab-item.active {
  border-bottom-color: var(--accent);
  background: var(--bg-surface);
}
.tab-name {
  font-size: 13px;
  white-space: nowrap;
}
.tab-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
}
.tab-close:hover {
  color: var(--text-primary);
}
</style>
