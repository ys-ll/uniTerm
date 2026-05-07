<template>
  <div class="tab-bar">
    <TabItem
      v-for="tab in tabStore.tabs"
      :key="tab.id"
      :title="tab.title"
      :is-active="tab.id === tabStore.activeTabId"
      :status="sessionStore.sessions.get(tab.sessionId)?.status || 'disconnected'"
      @activate="tabStore.setActiveTab(tab.id)"
      @close="closeTab(tab)"
    />
  </div>
</template>

<script setup lang="ts">
import { useTabStore } from '../stores/tabStore'
import { useSessionStore } from '../stores/sessionStore'
import TabItem from './TabItem.vue'
import type { Tab } from '../types/session'

const tabStore = useTabStore()
const sessionStore = useSessionStore()

function closeTab(tab: Tab) {
  tabStore.removeTab(tab.id)
  sessionStore.removeSession(tab.sessionId)
}
</script>

<style scoped>
.tab-bar {
  display: flex;
  height: 32px;
  background: #2d2d2d;
  border-bottom: 1px solid #1e1e1e;
  overflow-x: auto;
}
</style>
