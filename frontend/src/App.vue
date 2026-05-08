<template>
  <div class="app-container">
    <AppHeader @new-connection="showConnectionForm = true" />
    <div class="main-content">
      <Sidebar @connect="onConnect" />
      <div class="tab-area">
        <TabBar />
        <TabContent />
      </div>
    </div>
    <ConnectionForm v-model="showConnectionForm" @save="onConnect" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import Sidebar from './components/Sidebar.vue'
import TabBar from './components/TabBar.vue'
import TabContent from './components/TabContent.vue'
import ConnectionForm from './components/ConnectionForm.vue'
import { useConnectionStore } from './stores/connectionStore'
import { useTabStore } from './stores/tabStore'
import { useSessionStore } from './stores/sessionStore'
import { CreateSession } from '../wailsjs/go/main/App'
import type { ConnectionConfig } from './types/session'

const connectionStore = useConnectionStore()
const tabStore = useTabStore()
const sessionStore = useSessionStore()
const showConnectionForm = ref(false)

onMounted(() => {
  connectionStore.load()
})

async function onConnect(config: ConnectionConfig) {
  const sessionType = config.type
  const tabId = `tab-${Date.now()}`

  tabStore.addTab({
    id: tabId,
    sessionId: '',
    title: config.name || `${config.user}@${config.host}`,
    type: sessionType
  })

  try {
    const info = await CreateSession(sessionType, config)
    const tab = tabStore.tabs.find(t => t.id === tabId)
    if (tab) {
      tab.sessionId = info.id
      tab.title = info.title
    }
    sessionStore.initSession(info.id)
  } catch (e) {
    console.error('Failed to create session:', e)
    tabStore.removeTab(tabId)
  }
}
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
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
