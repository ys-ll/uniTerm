<template>
  <div
    class="tab-bar"
    :class="{ 'drag-over': dragOverTabs }"
    @dragover.prevent="onTabsDragOver"
    @dragleave="onTabsDragLeave"
    @drop="onTabsDrop"
  >
    <div class="tabs-list">
      <template v-for="(tab, index) in tabs" :key="tab.id">
        <!-- Drop indicator before this tab: insert-before this tab, or insert-after previous tab -->
        <div
          v-if="(dragOverTabIndex === index && !dragOverInsertAfter) || (dragOverTabIndex === index - 1 && dragOverInsertAfter)"
          class="tab-drop-indicator"
        ></div>

        <TabItem
          v-if="tab.type === 'terminal' || tab.type === 'settings' || tab.type === 'sftp'"
          :tab="tab"
          :is-active="tab.id === activeTabId"
          @activate="setActiveTab"
          @close="closeTab"
          @toggle-ai-lock="onToggleAiLock"
          @dragstart="onTabDragStart($event, tab.id)"
          @dragover.prevent="onTabDragOver($event, index)"
          @dragleave="onTabDragLeave"
          @drop="onTabDrop($event, tab.id, index)"
        />
        <WorkspaceTabItem
          v-else-if="tab.type === 'workspace'"
          :tab="tab"
          :is-active="tab.id === activeTabId"
          @activate="setActiveTab"
          @close="closeTab"
          @dragstart="onTabDragStart($event, tab.id)"
          @dragover.prevent="onTabDragOver($event, index)"
          @dragleave="onTabDragLeave"
          @drop="onTabDrop($event, tab.id, index)"
        />
      </template>
      <!-- Drop indicator after last tab -->
      <div
        v-if="dragOverTabIndex === tabs.length - 1 && dragOverInsertAfter"
        class="tab-drop-indicator"
      ></div>
      <!-- Drop indicator at end when dragging over empty tab bar area -->
      <div
        v-if="dragOverTabIndex === null && (dragOverPanel || dragOverTab)"
        class="tab-drop-indicator tab-drop-indicator-end"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTabStore } from '../stores/tabStore'
import { usePanelStore } from '../stores/panelStore'
import TabItem from './TabItem.vue'
import WorkspaceTabItem from './WorkspaceTabItem.vue'

const tabStore = useTabStore()
const panelStore = usePanelStore()
const tabs = computed(() => tabStore.tabs)
const activeTabId = computed(() => tabStore.activeTabId)

const dragOverTabs = ref(false)
const dragOverTabIndex = ref<number | null>(null)
const dragOverInsertAfter = ref(false)
const dragOverPanel = ref(false)
const dragOverTab = ref(false)

function setActiveTab(id: string) {
  tabStore.setActiveTab(id)
}

function closeTab(id: string) {
  const panelIds = tabStore.closeTab(id)
  panelIds.forEach(pid => panelStore.removePanel(pid))
}

function onToggleAiLock(panelId: string) {
  if (tabStore.aiLockedPanelId === panelId) {
    tabStore.setAILockedPanel(null)
  } else {
    tabStore.setAILockedPanel(panelId)
  }
}

function onTabDragStart(_e: DragEvent, _tabId: string) {
  // Data is set in TabItem/WorkspaceTabItem
}

function onTabDragOver(e: DragEvent, index: number) {
  const hasPanel = e.dataTransfer?.types.includes('application/panel-id')
  const hasTab = e.dataTransfer?.types.includes('application/tab-id')
  if (!hasPanel && !hasTab) return

  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  dragOverTabIndex.value = index
  dragOverInsertAfter.value = e.clientX >= rect.left + rect.width / 2
  e.dataTransfer!.dropEffect = 'move'
}

function onTabDragLeave(_e: DragEvent) {
  // Reset handled by onTabDragOver of next tab, or onTabsDragLeave for exit
}

function onTabDrop(e: DragEvent, targetTabId: string, index: number) {
  e.stopPropagation()

  const insertAfter = dragOverInsertAfter.value
  clearDragState()

  const draggedTabId = e.dataTransfer?.getData('application/tab-id')
  const draggedPanelId = e.dataTransfer?.getData('application/panel-id')
  const sourceTabId = e.dataTransfer?.getData('application/source-tab-id')

  // Case 1: Tab reorder
  if (draggedTabId && !draggedPanelId) {
    if (draggedTabId === targetTabId) return
    const fromIdx = tabs.value.findIndex(t => t.id === draggedTabId)
    if (fromIdx === -1) return
    let toIdx = index + (insertAfter ? 1 : 0)
    if (toIdx > fromIdx) toIdx--
    if (fromIdx !== toIdx) {
      tabStore.moveTab(fromIdx, toIdx)
    }
    return
  }

  // Case 2: Panel dropped on existing tab → create terminal tab at position
  if (draggedPanelId) {
    const panel = panelStore.getPanel(draggedPanelId)
    if (!panel) return

    if (sourceTabId) {
      tabStore.removePanelFromWorkspaceTab(sourceTabId, draggedPanelId)
    }

    const tab = tabStore.createTerminalTab(panel.title, draggedPanelId)
    panelStore.movePanelToTab(draggedPanelId, tab.id)

    // Move to the drop position
    const targetIdx = index + (insertAfter ? 1 : 0)
    const currentIdx = tabs.value.findIndex(t => t.id === tab.id)
    if (currentIdx !== targetIdx) {
      tabStore.moveTab(currentIdx, targetIdx)
    }
  }
}

function onTabsDragOver(e: DragEvent) {
  const hasPanel = e.dataTransfer?.types.includes('application/panel-id')
  const hasTab = e.dataTransfer?.types.includes('application/tab-id')
  if (hasPanel || hasTab) {
    dragOverTabs.value = true
    dragOverPanel.value = hasPanel
    dragOverTab.value = hasTab
    e.dataTransfer!.dropEffect = 'move'
  }
}

function onTabsDragLeave(e: DragEvent) {
  const el = e.currentTarget as HTMLElement
  const relatedTarget = e.relatedTarget as HTMLElement | null
  if (!relatedTarget || !el.contains(relatedTarget)) {
    clearDragState()
  }
}

function onTabsDrop(e: DragEvent) {
  // Handles drops on empty tab bar area only (tab drops handled by onTabDrop)
  const panelId = e.dataTransfer?.getData('application/panel-id')
  const sourceTabId = e.dataTransfer?.getData('application/source-tab-id')

  if (!panelId) {
    clearDragState()
    return
  }

  // Skip if drop landed on a tab item (already handled by onTabDrop)
  const target = e.target as HTMLElement
  if (target.closest('.tab-item') || target.closest('.workspace-tab-item')) {
    clearDragState()
    return
  }

  clearDragState()

  const panel = panelStore.getPanel(panelId)
  if (!panel) return

  if (sourceTabId) {
    tabStore.removePanelFromWorkspaceTab(sourceTabId, panelId)
  }

  const tab = tabStore.createTerminalTab(panel.title, panelId)
  panelStore.movePanelToTab(panelId, tab.id)
}

function clearDragState() {
  dragOverTabs.value = false
  dragOverTabIndex.value = null
  dragOverInsertAfter.value = false
  dragOverPanel.value = false
  dragOverTab.value = false
}
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  height: 40px;
  background: var(--bg-base);
  border-bottom: 1px solid var(--border-subtle);
  position: relative;
  transition: background 0.15s, border-color 0.15s;
}
.tab-bar.drag-over {
  background: var(--accent-subtle);
  border-bottom-color: var(--accent-dim);
}
.tabs-list {
  display: flex;
  flex: 1;
  overflow-x: auto;
  align-items: stretch;
}

.tab-drop-indicator {
  width: 2px;
  min-width: 2px;
  align-self: stretch;
  background: var(--accent);
  opacity: 0.8;
  margin: 4px 0;
  border-radius: 1px;
  flex-shrink: 0;
}
.tab-drop-indicator-end {
  margin-left: auto;
}
</style>
