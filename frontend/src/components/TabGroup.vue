<template>
  <div class="tab-group">
    <TabBar />
    <TabContent />
  </div>
</template>

<script setup lang="ts">
import TabBar from './TabBar.vue'
import TabContent from './TabContent.vue'
</script>

<style scoped>
.tab-group {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}
</style>
