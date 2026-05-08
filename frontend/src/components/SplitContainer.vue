<template>
  <div
    class="split-container"
    :class="{ 'horizontal': node.direction === 'horizontal', 'vertical': node.direction === 'vertical' }"
  >
    <template v-if="node.direction">
      <SplitContainer
        v-for="child in node.children"
        :key="child.id"
        :node="child"
      />
    </template>
    <TabGroup v-else :group-id="node.tabGroupId || 'default'" />
  </div>
</template>

<script setup lang="ts">
import type { SplitNode } from '../types/session'
import TabGroup from './TabGroup.vue'

defineProps<{
  node: SplitNode
}>()
</script>

<style scoped>
.split-container {
  display: flex;
  flex: 1;
  overflow: hidden;
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
</style>
