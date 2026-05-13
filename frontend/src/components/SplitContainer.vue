<template>
  <div
    ref="el"
    class="split-container"
    :class="{ 'horizontal': node.direction === 'horizontal', 'vertical': node.direction === 'vertical' }"
  >
    <template v-if="node.direction">
      <div class="split-child" :style="{ flex: children[0].ratio }">
        <SplitContainer :node="children[0]" />
      </div>
      <div
        class="split-handle"
        :class="{ 'handle-h': node.direction === 'horizontal', 'handle-v': node.direction === 'vertical' }"
        @mousedown="onResizeStart($event, node.id, children[0].ratio)"
      />
      <div class="split-child" :style="{ flex: children[1].ratio }">
        <SplitContainer :node="children[1]" />
      </div>
    </template>
    <template v-else>
      <TabGroup :group-id="node.tabGroupId || 'default'" />
      <SplitOverlay :container-el="el" :node-id="node.id" :group-id="node.tabGroupId || 'default'" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SplitNode } from '../types/session'
import { useTabStore } from '../stores/tabStore'
import TabGroup from './TabGroup.vue'
import SplitOverlay from './SplitOverlay.vue'

const props = defineProps<{ node: SplitNode }>()
const tabStore = useTabStore()
const el = ref<HTMLDivElement>()

const children = computed(() => props.node.children)

function onResizeStart(e: MouseEvent, parentId: string, startRatio: number) {
  const handle = e.currentTarget as HTMLElement
  const container = handle.parentElement
  if (!container) return

  e.preventDefault()
  const isHorizontal = props.node.direction === 'horizontal'
  const startPos = isHorizontal ? e.clientX : e.clientY
  const containerSize = isHorizontal ? container.offsetWidth : container.offsetHeight

  if (containerSize <= 0) return

  window.dispatchEvent(new CustomEvent('split:resize-start'))

  function onMove(ev: MouseEvent) {
    const delta = isHorizontal ? (ev.clientX - startPos) : (ev.clientY - startPos)
    const deltaRatio = delta / containerSize
    const newRatio = startRatio + deltaRatio
    tabStore.resizePane(parentId, [newRatio, 1 - newRatio])
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    window.dispatchEvent(new CustomEvent('split:resize-end'))
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>

<style scoped>
.split-container {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
}

.split-container.horizontal {
  flex-direction: row;
}

.split-container.vertical {
  flex-direction: column;
}

.split-container > .split-container {
  flex: 1;
}

.split-child {
  overflow: hidden;
  display: flex;
  min-height: 0;
  min-width: 0;
}

.split-handle {
  flex-shrink: 0;
  z-index: 10;
  background: transparent;
  transition: background 0.15s;
  position: relative;
}

.split-handle:hover {
  background: var(--accent);
}

.handle-h {
  width: 4px;
  cursor: col-resize;
}

.handle-v {
  height: 4px;
  cursor: row-resize;
}
</style>
