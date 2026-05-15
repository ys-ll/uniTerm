<template>
  <div
    class="workspace-content"
    @dragover.prevent="onWorkspaceDragOver"
  >
    <PanelGrid
      :layout="tab.layout"
      :panel-ids="tab.panelIds"
      :active-panel-id="tab.activePanelId"
      :tab-id="tab.id"
      @close-panel="closePanel"
      @toggle-ai-lock="onToggleAiLock"
      @panel-drag-start="onPanelDragStart"
      @panel-drop="onPanelDrop"
      @resize="onResize"
    />
  </div>
</template>

<script setup lang="ts">
import { useTabStore } from '../stores/tabStore'
import { usePanelStore } from '../stores/panelStore'
import type { WorkspaceTab } from '../types/workspace'
import PanelGrid from './PanelGrid.vue'

const props = defineProps<{
  tab: WorkspaceTab
}>()

const tabStore = useTabStore()
const panelStore = usePanelStore()

function closePanel(panelId: string) {
  const panel = panelStore.getPanel(panelId)
  tabStore.removePanelFromWorkspaceTab(props.tab.id, panelId)
  if (panel) {
    panelStore.removePanel(panel.id)
  }
}

function onToggleAiLock(panelId: string) {
  if (tabStore.aiLockedPanelId === panelId) {
    tabStore.setAILockedPanel(null)
  } else {
    tabStore.setAILockedPanel(panelId)
  }
}

function onPanelDragStart(e: DragEvent, panelId: string) {
  if (e.dataTransfer) {
    e.dataTransfer.setData('application/panel-id', panelId)
    e.dataTransfer.setData('application/source-tab-id', props.tab.id)
    e.dataTransfer.effectAllowed = 'move'
  }
}

function onPanelDrop(e: DragEvent, targetPanelId: string, targetRect?: DOMRect) {
  const draggedPanelId = e.dataTransfer?.getData('application/panel-id')
  const draggedTabId = e.dataTransfer?.getData('application/tab-id')
  const sourceTabId = e.dataTransfer?.getData('application/source-tab-id')

  // Case 1: Terminal tab dragged into workspace (from TabBar)
  if (draggedTabId && !draggedPanelId) {
    const draggedTab = tabStore.tabs.find(t => t.id === draggedTabId)
    if (!draggedTab || draggedTab.type !== 'terminal') return

    const rect = targetRect || (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const xRatio = x / rect.width
    const yRatio = y / rect.height

    let direction: 'horizontal' | 'vertical'
    let insertBefore: boolean

    if (Math.abs(xRatio - 0.5) >= Math.abs(yRatio - 0.5)) {
      direction = 'horizontal'
      insertBefore = xRatio < 0.5
    } else {
      direction = 'vertical'
      insertBefore = yRatio < 0.5
    }

    tabStore.addPanelToWorkspaceTab(draggedTabId, props.tab.id, targetPanelId, direction, insertBefore)
    panelStore.movePanelToTab(draggedTab.panelId, props.tab.id)
    return
  }

  // Case 2: Panel reposition within same workspace or from another workspace
  if (!draggedPanelId || draggedPanelId === targetPanelId) return

  const draggedPanel = panelStore.getPanel(draggedPanelId)
  if (!draggedPanel) return

  const rect = targetRect || (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const xRatio = x / rect.width
  const yRatio = y / rect.height

  let direction: 'horizontal' | 'vertical'
  let insertBefore: boolean

  if (Math.abs(xRatio - 0.5) >= Math.abs(yRatio - 0.5)) {
    direction = 'horizontal'
    insertBefore = xRatio < 0.5
  } else {
    direction = 'vertical'
    insertBefore = yRatio < 0.5
  }

  // If dragged from a different tab (workspace or terminal tab)
  if (sourceTabId && sourceTabId !== props.tab.id) {
    const sourceTab = tabStore.tabs.find(t => t.id === sourceTabId)
    if (sourceTab?.type === 'workspace') {
      tabStore.removePanelFromWorkspaceTab(sourceTabId, draggedPanelId)
    }
    // Add to this workspace
    props.tab.panelIds.push(draggedPanelId)
    panelStore.movePanelToTab(draggedPanelId, props.tab.id)
    const newLayout = tabStore.insertPanelIntoLayout(
      props.tab.layout.root,
      targetPanelId,
      draggedPanelId,
      direction,
      insertBefore
    )
    tabStore.updateWorkspaceLayout(props.tab.id, { root: newLayout })
  } else {
    // Same workspace reposition
    tabStore.movePanelInWorkspace(props.tab.id, draggedPanelId, targetPanelId, direction, insertBefore)
  }
}

function onWorkspaceDragOver(e: DragEvent) {
  const hasPanel = e.dataTransfer?.types.includes('application/panel-id')
  const hasTab = e.dataTransfer?.types.includes('application/tab-id')
  if (hasPanel || hasTab) {
    e.dataTransfer!.dropEffect = 'move'
  }
}

function onResize(payload: { node: any, index: number, delta: number }) {
  const { node, index, delta } = payload
  if (node.type !== 'split') return

  const newSizes = [...node.sizes]
  newSizes[index] = Math.max(0.1, Math.min(0.9, newSizes[index] + delta))
  newSizes[index + 1] = Math.max(0.1, Math.min(0.9, newSizes[index + 1] - delta))

  const total = newSizes.reduce((a, b) => a + b, 0)
  const normalized = newSizes.map(s => s / total)

  const newNode = { ...node, sizes: normalized }
  const newRoot = tabStore.updateNodeInTree(props.tab.layout.root, node, newNode)
  tabStore.updateWorkspaceLayout(props.tab.id, { root: newRoot })
}
</script>

<style scoped>
.workspace-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
  position: relative;
}
</style>
