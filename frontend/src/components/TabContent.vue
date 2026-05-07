<template>
  <div class="tab-content">
    <template v-for="tab in tabStore.tabs" :key="tab.id">
      <div v-show="tab.id === tabStore.activeTabId" class="tab-panel">
        <TerminalTab v-if="tab.type === 'ssh'" :tab="tab" />
        <SftpTab v-else-if="tab.type === 'sftp'" :tab="tab" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useTabStore } from '../stores/tabStore'
import TerminalTab from './TerminalTab.vue'
import SftpTab from './SftpTab.vue'

const tabStore = useTabStore()
</script>

<style scoped>
.tab-content {
  flex: 1;
  overflow: hidden;
  background: #1e1e1e;
}

.tab-panel {
  width: 100%;
  height: 100%;
}
</style>
