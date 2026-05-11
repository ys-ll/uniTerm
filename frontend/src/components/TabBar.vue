<template>
  <div
    class="tab-bar"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <TabItem
      v-for="(tab, index) in groupTabs"
      :key="tab.id"
      :title="tab.title"
      :is-active="tab.id === tabStore.activeTabId"
      :status="sessionStore.sessions.get(tab.sessionId)?.status || 'disconnected'"
      :tab-id="tab.id"
      @activate="tabStore.setActiveTab(tab.id)"
      @close="closeTab(tab)"
      @dragstart="draggingId = tab.id"
      @dragend="draggingId = null"
      @split="(dir) => tabStore.splitTab(tab.id, dir)"
      @duplicate="duplicateTab(tab)"
      @close-right="closeTabsToTheRight(index)"
      @close-left="closeTabsToTheLeft(index)"
      @close-other="closeOtherTabs(index)"
    />
    <div
      v-if="draggingId && groupTabs.length === 0"
      class="drop-zone"
      :class="{ active: dropTargetIndex === -1 }"
    >
      Drop here
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTabStore } from '../stores/tabStore'
import { useSessionStore } from '../stores/sessionStore'
import { CreateSession } from '../../wailsjs/go/main/App'
import TabItem from './TabItem.vue'
import type { Tab } from '../types/session'

const props = defineProps<{
  groupId: string
}>()

const tabStore = useTabStore()
const sessionStore = useSessionStore()
const draggingId = ref<string | null>(null)
const dropTargetIndex = ref<number>(-1)

const groupTabs = computed(() =>
  tabStore.tabs.filter(t => t.groupId === props.groupId)
)

function closeTab(tab: Tab) {
  tabStore.removeTab(tab.id)
  sessionStore.removeSession(tab.sessionId)
}

async function duplicateTab(tab: Tab) {
  if (!tab.config) return
  const tabId = `tab-${Date.now()}`
  tabStore.addTab({
    id: tabId,
    sessionId: '',
    title: tab.title,
    type: tab.type,
    groupId: tab.groupId,
    config: tab.config
  }, tab.groupId || 'default')

  try {
    const info = await CreateSession(tab.type, tab.config)
    const newTab = tabStore.tabs.find(t => t.id === tabId)
    if (newTab) {
      newTab.sessionId = info.id
    }
    sessionStore.initSession(info.id)
  } catch (e) {
    console.error('Failed to duplicate session:', e)
    tabStore.removeTab(tabId)
  }
}

function closeTabsToTheRight(index: number) {
  const tabsToClose = groupTabs.value.slice(index + 1)
  for (const tab of tabsToClose) {
    closeTab(tab)
  }
}

function closeTabsToTheLeft(index: number) {
  const tabsToClose = groupTabs.value.slice(0, index)
  for (const tab of tabsToClose) {
    closeTab(tab)
  }
}

function closeOtherTabs(index: number) {
  const tabsToClose = groupTabs.value.filter((_, i) => i !== index)
  for (const tab of tabsToClose) {
    closeTab(tab)
  }
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (!draggingId.value) return
  e.dataTransfer!.dropEffect = 'move'

  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const x = e.clientX - rect.left
  const items = bar.querySelectorAll('.tab-item')
  let targetIdx = groupTabs.value.length
  for (let i = 0; i < items.length; i++) {
    const itemRect = items[i].getBoundingClientRect()
    const itemCenter = itemRect.left + itemRect.width / 2 - rect.left
    if (x < itemCenter) {
      targetIdx = i
      break
    }
  }
  dropTargetIndex.value = targetIdx
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  const tabId = e.dataTransfer?.getData('text/plain')
  if (!tabId || !draggingId.value) {
    dropTargetIndex.value = -1
    return
  }

  const tab = tabStore.tabs.find(t => t.id === tabId)
  if (!tab) {
    dropTargetIndex.value = -1
    return
  }

  if (tab.groupId !== props.groupId) {
    tabStore.moveTab(tabId, props.groupId)
  }

  const groupTabIds = groupTabs.value.map(t => t.id)
  const currentIdx = groupTabIds.indexOf(tabId)
  let targetIdx = dropTargetIndex.value

  if (currentIdx >= 0) {
    if (targetIdx > currentIdx) targetIdx--
  }

  const allTabs = [...tabStore.tabs]
  const globalCurrentIdx = allTabs.findIndex(t => t.id === tabId)
  if (globalCurrentIdx < 0) {
    dropTargetIndex.value = -1
    return
  }

  const [moved] = allTabs.splice(globalCurrentIdx, 1)

  let globalTargetIdx = allTabs.length
  if (targetIdx <= 0) {
    const firstGroupIdx = allTabs.findIndex(t => t.groupId === props.groupId)
    globalTargetIdx = firstGroupIdx >= 0 ? firstGroupIdx : allTabs.length
  } else if (targetIdx >= groupTabs.value.length - (currentIdx >= 0 ? 0 : 1)) {
    let lastGroupIdx = -1
    for (let i = allTabs.length - 1; i >= 0; i--) {
      if (allTabs[i].groupId === props.groupId) {
        lastGroupIdx = i
        break
      }
    }
    globalTargetIdx = lastGroupIdx >= 0 ? lastGroupIdx + 1 : allTabs.length
  } else {
    let groupCount = 0
    for (let i = 0; i < allTabs.length; i++) {
      if (allTabs[i].groupId === props.groupId) {
        if (groupCount === targetIdx - (currentIdx >= 0 && globalCurrentIdx < i ? 1 : 0)) {
          globalTargetIdx = i
          break
        }
        groupCount++
      }
    }
  }

  allTabs.splice(globalTargetIdx, 0, moved)
  tabStore.tabs = allTabs

  dropTargetIndex.value = -1
  draggingId.value = null
}
</script>

<style scoped>
.tab-bar {
  display: flex;
  height: 34px;
  background: var(--bg-elevated);
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 4px;
  align-items: flex-end;
  gap: 2px;
}

/* Hide scrollbar */
.tab-bar::-webkit-scrollbar {
  display: none;
}

.drop-zone {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 11px;
  font-family: var(--font-ui);
  border: 1px dashed var(--border-subtle);
  margin: 2px;
  border-radius: var(--radius-sm);
  height: 28px;
}

.drop-zone.active {
  border-color: var(--accent-dim);
  background: var(--accent-subtle);
  color: var(--accent);
}
</style>
