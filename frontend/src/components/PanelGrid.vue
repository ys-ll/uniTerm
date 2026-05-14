<template>
  <div class="panel-grid">
    <RenderNode
      :node="workspace.layout.root"
      :workspace="workspace"
      @close-panel="$emit('closePanel', $event)"
      @panel-drag-start="$emit('panelDragStart', $event)"
      @panel-drop="$emit('panelDrop', $event)"
      @resize="$emit('resize', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { Workspace } from '../types/workspace'
import RenderNode from './RenderNode.vue'

defineProps<{
  workspace: Workspace
}>()

defineEmits<{
  closePanel: [panelId: string]
  panelDragStart: [e: DragEvent, panelId: string]
  panelDrop: [e: DragEvent, targetPanelId: string]
  resize: [payload: { node: any, index: number, delta: number }]
}>()
</script>

<style scoped>
.panel-grid {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
