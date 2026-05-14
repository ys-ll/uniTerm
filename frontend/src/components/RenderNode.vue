<template>
  <div v-if="node.type === 'leaf'" class="leaf-node">
    <Panel
      v-if="panel"
      :panel="panel"
      :show-header="workspace.panelIds.length > 1"
      @close="$emit('closePanel', panel.id)"
      @dragstart="$emit('panelDragStart', $event, panel.id)"
    />
  </div>
  <div
    v-else
    class="split-node"
    :class="node.direction"
    :style="splitStyle"
  >
    <template v-for="(child, index) in node.children" :key="getNodeKey(child)">
      <RenderNode
        :node="child"
        :workspace="workspace"
        @close-panel="$emit('closePanel', $event)"
        @panel-drag-start="$emit('panelDragStart', $event)"
        @panel-drop="$emit('panelDrop', $event)"
        @resize="$emit('resize', $event)"
      />
      <PanelSplitter
        v-if="index < node.children.length - 1"
        :direction="node.direction"
        @resize="$emit('resize', { node, index, delta: $event })"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePanelStore } from '../stores/panelStore'
import type { Workspace, LayoutNode } from '../types/workspace'
import Panel from './Panel.vue'
import PanelSplitter from './PanelSplitter.vue'

const props = defineProps<{
  node: LayoutNode
  workspace: Workspace
}>()

const emit = defineEmits<{
  closePanel: [panelId: string]
  panelDragStart: [e: DragEvent, panelId: string]
  panelDrop: [e: DragEvent, targetPanelId: string]
  resize: [payload: { node: any, index: number, delta: number }]
}>()

const panelStore = usePanelStore()

const panel = computed(() => {
  if (props.node.type === 'leaf') {
    return panelStore.getPanel(props.node.panelId)
  }
  return null
})

const splitStyle = computed(() => {
  if (props.node.type !== 'split') return {}
  const template = props.node.sizes
    .map(s => `${s * 100}%`)
    .join(props.node.direction === 'horizontal' ? ' 4px ' : ' 4px ')
  return {
    display: 'grid',
    gridTemplateColumns: props.node.direction === 'horizontal' ? template : '1fr',
    gridTemplateRows: props.node.direction === 'vertical' ? template : '1fr'
  }
})

function getNodeKey(node: LayoutNode): string {
  if (node.type === 'leaf') return node.panelId
  return `split-${node.direction}-${node.children.length}`
}
</script>

<style scoped>
.leaf-node {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.split-node {
  width: 100%;
  height: 100%;
}
</style>
