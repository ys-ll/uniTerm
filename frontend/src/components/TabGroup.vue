<template>
  <div class="tab-group">
    <TabBar :group-id="groupId" />
    <TabContent :group-id="groupId" />
  </div>
</template>

<script setup lang="ts">
import TabBar from './TabBar.vue'
import TabContent from './TabContent.vue'

defineProps<{
  groupId: string
}>()
</script>

<style scoped>
.tab-group {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}
</style>
