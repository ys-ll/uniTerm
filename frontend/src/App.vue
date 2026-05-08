<template>
  <div class="app-container">
    <AppHeader @new-connection="showConnectionForm = true" @toggle-ai="aiStore.toggle" />
    <div class="main-content">
      <Sidebar @connect="onConnect" />
      <div class="tab-area">
        <SplitContainer :node="tabStore.splitRoot" />
      </div>
      <AISidebar />
    </div>
    <ConnectionForm v-model="showConnectionForm" @save="onSaveOnly" @connect="onConnect" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import Sidebar from './components/Sidebar.vue'
import SplitContainer from './components/SplitContainer.vue'
import ConnectionForm from './components/ConnectionForm.vue'
import AISidebar from './components/AISidebar.vue'
import { useConnectionStore } from './stores/connectionStore'
import { useTabStore } from './stores/tabStore'
import { useSessionStore } from './stores/sessionStore'
import { useAIStore } from './stores/aiStore'
import { CreateSession } from '../wailsjs/go/main/App'
import type { ConnectionConfig } from './types/session'

const connectionStore = useConnectionStore()
const tabStore = useTabStore()
const sessionStore = useSessionStore()
const aiStore = useAIStore()
const showConnectionForm = ref(false)

onMounted(() => {
  connectionStore.load()
})

function onSaveOnly(config: ConnectionConfig) {
  connectionStore.add(config)
}

async function onConnect(config: ConnectionConfig) {
  // Save connection config to sidebar
  connectionStore.add(config)

  const sessionType = config.type
  const tabId = `tab-${Date.now()}`
  const groupId = tabStore.activeTab?.groupId || 'default'
  const displayTitle = config.name
    ? `${config.name} (${config.host})`
    : `${config.user}@${config.host}`

  tabStore.addTab({
    id: tabId,
    sessionId: '',
    title: displayTitle,
    type: sessionType,
    groupId,
    config
  }, groupId)

  try {
    const info = await CreateSession(sessionType, config)
    const tab = tabStore.tabs.find(t => t.id === tabId)
    if (tab) {
      tab.sessionId = info.id
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
