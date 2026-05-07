<template>
  <div class="app-container">
    <AppHeader />
    <div class="main-content">
      <Sidebar />
      <div class="tab-area">
        <TabGroup />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppHeader from './components/AppHeader.vue'
import Sidebar from './components/Sidebar.vue'
import TabGroup from './components/TabGroup.vue'
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.tab-area {
  flex: 1;
  overflow: hidden;
}
</style>
