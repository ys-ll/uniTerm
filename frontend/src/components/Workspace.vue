<template>
  <div class="workspace" @dragover.prevent @drop="onWorkspaceDrop">
    <PanelGrid
      :workspace="workspace"
      @close-panel="closePanel"
      @panel-drag-start="onPanelDragStart"
      @panel-drop="onPanelDrop"
      @resize="onResize"
    />
  </div>
</template>

<script setup lang="ts">
import { useWorkspaceStore } from '../stores/workspaceStore'
import { usePanelStore } from '../stores/panelStore'
import type { Workspace, LayoutNode } from '../types/workspace'
import PanelGrid from './PanelGrid.vue'

const props = defineProps<{
  workspace: Workspace
}>()

const workspaceStore = useWorkspaceStore()
const panelStore = usePanelStore()

function closePanel(panelId: string) {
  workspaceStore.removePanelFromWorkspace(props.workspace.id, panelId)
  panelStore.removePanel(panelId)
}

function onPanelDragStart(e: DragEvent, panelId: string) {
  e.dataTransfer?.setData('application/panel-id', panelId)
}

function onPanelDrop(e: DragEvent, targetPanelId: string) {
  const draggedPanelId = e.dataTransfer?.getData('application/panel-id')
  if (!draggedPanelId || draggedPanelId === targetPanelId) return

  // Same workspace split logic (Scenario 1)
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const w = rect.width
  const h = rect.height

  let direction: 'horizontal' | 'vertical'
  let insertBefore: boolean

  if (x / w < 0.5 && y / h > 0.25 && y / h < 0.75) {
    direction = 'horizontal'
    insertBefore = true
  } else if (x / w >= 0.5 && y / h > 0.25 && y / h < 0.75) {
    direction = 'horizontal'
    insertBefore = false
  } else if (y / h < 0.5) {
    direction = 'vertical'
    insertBefore = true
  } else {
    direction = 'vertical'
    insertBefore = false
  }

  // Update layout tree to insert draggedPanelId next to targetPanelId
  const newLayout = insertPanelIntoLayout(
    props.workspace.layout.root,
    targetPanelId,
    draggedPanelId,
    direction,
    insertBefore
  )
  workspaceStore.updateLayout(props.workspace.id, { root: newLayout })
}

function onWorkspaceDrop(e: DragEvent) {
  // Scenario 3: Workspace-to-workspace merge
  // Handled in Task 13
  const workspaceId = e.dataTransfer?.getData('application/workspace-id')
  if (!workspaceId || workspaceId === props.workspace.id) return

  const draggedWorkspace = workspaceStore.workspaces.find(w => w.id === workspaceId)
  if (!draggedWorkspace) return

  // Only single-panel ssh workspaces can merge
  if (draggedWorkspace.panelIds.length !== 1) return

  const panelId = draggedWorkspace.panelIds[0]
  const panel = panelStore.getPanel(panelId)
  if (!panel || panel.type !== 'ssh') return

  // Calculate drop position
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const w = rect.width
  const h = rect.height

  let direction: 'horizontal' | 'vertical'
  let insertBefore: boolean

  if (x / w < 0.5 && y / h > 0.25 && y / h < 0.75) {
    direction = 'horizontal'
    insertBefore = true
  } else if (x / w >= 0.5 && y / h > 0.25 && y / h < 0.75) {
    direction = 'horizontal'
    insertBefore = false
  } else if (y / h < 0.5) {
    direction = 'vertical'
    insertBefore = true
  } else {
    direction = 'vertical'
    insertBefore = false
  }

  // Move panel to target workspace
  workspaceStore.closeWorkspace(workspaceId)
  workspaceStore.addPanelToWorkspace(props.workspace.id, panelId)
  panelStore.movePanelToWorkspace(panelId, props.workspace.id)
}

function onResize(payload: { node: any, index: number, delta: number }) {
  // Resize logic - update sizes array based on delta
  // This is a placeholder for full implementation
  const { node, index, delta } = payload
  if (node.type !== 'split') return

  const newSizes = [...node.sizes]
  const containerSize = node.direction === 'horizontal'
    ? (document.querySelector('.panel-grid') as HTMLElement)?.offsetWidth || 1
    : (document.querySelector('.panel-grid') as HTMLElement)?.offsetHeight || 1

  const deltaRatio = delta / containerSize
  newSizes[index] = Math.max(0.1, Math.min(0.9, newSizes[index] + deltaRatio))
  newSizes[index + 1] = Math.max(0.1, Math.min(0.9, 1 - newSizes[index]))

  // Normalize
  const total = newSizes.reduce((a, b) => a + b, 0)
  const normalized = newSizes.map(s => s / total)

  const newNode = { ...node, sizes: normalized }
  const newRoot = updateNodeInTree(props.workspace.layout.root, node, newNode)
  workspaceStore.updateLayout(props.workspace.id, { root: newRoot })
}

// Helper: insert panel into layout tree
function insertPanelIntoLayout(
  node: LayoutNode,
  targetId: string,
  newId: string,
  direction: 'horizontal' | 'vertical',
  before: boolean
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.panelId === targetId) {
      const children = before
        ? [{ type: 'leaf' as const, panelId: newId }, node]
        : [node, { type: 'leaf' as const, panelId: newId }]
      return {
        type: 'split',
        direction,
        sizes: [0.5, 0.5],
        children
      }
    }
    return node
  }

  return {
    ...node,
    children: node.children.map(child =>
      insertPanelIntoLayout(child, targetId, newId, direction, before)
    )
  }
}

// Helper: update a node in the layout tree
function updateNodeInTree(
  node: LayoutNode,
  oldNode: LayoutNode,
  newNode: LayoutNode
): LayoutNode {
  if (node === oldNode) return newNode
  if (node.type === 'leaf') return node
  return {
    ...node,
    children: node.children.map(child => updateNodeInTree(child, oldNode, newNode))
  }
}
</script>

<style scoped>
.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
}
</style>
