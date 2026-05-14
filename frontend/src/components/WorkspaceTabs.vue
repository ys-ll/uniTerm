<template>
  <div class="workspace-tabs">
    <div class="tabs-list" ref="tabsListRef">
      <WorkspaceTabItem
        v-for="workspace in workspaces"
        :key="workspace.id"
        :workspace="workspace"
        :is-active="workspace.id === activeWorkspaceId"
        @activate="setActiveWorkspace"
        @close="closeWorkspace"
        draggable="true"
        @dragstart="onTabDragStart($event, workspace.id)"
        @dragover.prevent
        @drop="onTabDrop($event, workspace.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceStore } from '../stores/workspaceStore'
import WorkspaceTabItem from './WorkspaceTabItem.vue'

const workspaceStore = useWorkspaceStore()
const workspaces = computed(() => workspaceStore.workspaces)
const activeWorkspaceId = computed(() => workspaceStore.activeWorkspaceId)

function setActiveWorkspace(id: string) {
  workspaceStore.setActiveWorkspace(id)
}

function closeWorkspace(id: string) {
  workspaceStore.closeWorkspace(id)
}

function onTabDragStart(e: DragEvent, workspaceId: string) {
  e.dataTransfer?.setData('application/workspace-id', workspaceId)
}

function onTabDrop(e: DragEvent, targetWorkspaceId: string) {
  const draggedId = e.dataTransfer?.getData('application/workspace-id')
  if (!draggedId || draggedId === targetWorkspaceId) return

  const fromIdx = workspaces.value.findIndex(w => w.id === draggedId)
  const toIdx = workspaces.value.findIndex(w => w.id === targetWorkspaceId)
  if (fromIdx !== -1 && toIdx !== -1) {
    workspaceStore.moveWorkspace(fromIdx, toIdx)
  }
}
</script>

<style scoped>
.workspace-tabs {
  display: flex;
  align-items: center;
  height: 40px;
  background: var(--bg-base);
  border-bottom: 1px solid var(--border-subtle);
}
.tabs-list {
  display: flex;
  flex: 1;
  overflow-x: auto;
}
</style>
