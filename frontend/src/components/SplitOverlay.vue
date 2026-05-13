<template>
  <div class="split-overlay">
    <!-- Visual shadows (non-interactive) -->
    <div class="drop-shadow top" :class="{ visible: activeZone === 'top' }" />
    <div class="drop-shadow bottom" :class="{ visible: activeZone === 'bottom' }" />
    <div class="drop-shadow left" :class="{ visible: activeZone === 'left' }" />
    <div class="drop-shadow right" :class="{ visible: activeZone === 'right' }" />
    <div class="drop-shadow full" :class="{ visible: activeZone === 'center' }" />

    <!-- Edge zones: 1/4 of content area, below tab bar -->
    <div
      class="zone top"
      @dragover.prevent="onZoneOver('top')"
      @dragleave="onZoneLeave"
      @drop="onDrop('top', $event)"
    />
    <div
      class="zone bottom"
      @dragover.prevent="onZoneOver('bottom')"
      @dragleave="onZoneLeave"
      @drop="onDrop('bottom', $event)"
    />
    <div
      class="zone left"
      @dragover.prevent="onZoneOver('left')"
      @dragleave="onZoneLeave"
      @drop="onDrop('left', $event)"
    />
    <div
      class="zone right"
      @dragover.prevent="onZoneOver('right')"
      @dragleave="onZoneLeave"
      @drop="onDrop('right', $event)"
    />
    <!-- Center zone: merge -->
    <div
      class="zone center"
      @dragover.prevent="onZoneOver('center')"
      @dragleave="onZoneLeave"
      @drop="onDropCenter($event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useTabStore } from '../stores/tabStore'

const props = defineProps<{
  containerEl?: HTMLDivElement | null
  nodeId: string
  groupId: string
}>()

const tabStore = useTabStore()
const activeZone = ref<string | null>(null)

function onZoneOver(zone: string) {
  activeZone.value = zone
}

function onZoneLeave() {
  activeZone.value = null
}

function getDirection(edge: string): 'horizontal' | 'vertical' {
  return (edge === 'left' || edge === 'right') ? 'horizontal' : 'vertical'
}

function onDrop(edge: string, e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  document.body.classList.remove('drag-active')
  const tabId = e.dataTransfer?.getData('text/plain') || tabStore.draggingTabId
  if (!tabId) {
    tabStore.draggingTabId = null
    return
  }
  const dir = getDirection(edge)
  tabStore.createSplit(tabId, dir, edge as 'top' | 'bottom' | 'left' | 'right', props.groupId)
  tabStore.draggingTabId = null
  activeZone.value = null
}

function onDropCenter(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  document.body.classList.remove('drag-active')
  const tabId = e.dataTransfer?.getData('text/plain') || tabStore.draggingTabId
  if (!tabId) {
    tabStore.draggingTabId = null
    return
  }
  const tab = tabStore.tabs.find(t => t.id === tabId)
  if (tab && tab.groupId !== props.groupId) {
    tabStore.moveTab(tabId, props.groupId)
  }
  tabStore.draggingTabId = null
  activeZone.value = null
}
</script>

<style scoped>
.split-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 100;
}

/* ── Drop zones ── */
.zone {
  position: absolute;
  z-index: 101;
  pointer-events: none;
}

:global(body.drag-active) .zone {
  pointer-events: all;
}

/* Content area starts below tab bar (34px) */
.zone.top {
  top: 34px;
  left: 0;
  right: 0;
  height: calc((100% - 34px) / 4);
}

.zone.bottom {
  bottom: 0;
  left: 0;
  right: 0;
  height: calc((100% - 34px) / 4);
}

.zone.left {
  top: calc(34px + (100% - 34px) / 4);
  bottom: calc((100% - 34px) / 4);
  left: 0;
  width: 25%;
}

.zone.right {
  top: calc(34px + (100% - 34px) / 4);
  bottom: calc((100% - 34px) / 4);
  right: 0;
  width: 25%;
}

.zone.center {
  top: calc(34px + (100% - 34px) / 4);
  bottom: calc((100% - 34px) / 4);
  left: 25%;
  right: 25%;
}

/* ── Drop shadows (visual feedback, non-interactive) ── */
.drop-shadow {
  position: absolute;
  z-index: 100;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s ease;
  background: rgba(34, 211, 238, 0.12);
  border: 2px solid rgba(34, 211, 238, 0.35);
  border-radius: 4px;
}

.drop-shadow.visible {
  opacity: 1;
}

.drop-shadow.top {
  top: 34px;
  left: 0;
  right: 0;
  height: 50%;
}

.drop-shadow.bottom {
  bottom: 0;
  left: 0;
  right: 0;
  height: 50%;
}

.drop-shadow.left {
  top: 34px;
  bottom: 0;
  left: 0;
  width: 50%;
}

.drop-shadow.right {
  top: 34px;
  bottom: 0;
  right: 0;
  width: 50%;
}

.drop-shadow.full {
  top: 34px;
  bottom: 0;
  left: 0;
  right: 0;
}
</style>
