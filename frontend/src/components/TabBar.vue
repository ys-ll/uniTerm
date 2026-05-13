<template>
  <div
    class="tab-bar"
    @dragover="onDragOver"
    @drop="onDrop"
    @dragleave="onDragLeave"
  >
    <TabItem
      v-for="(tab, index) in groupTabs"
      :key="tab.id"
      :title="tab.title"
      :is-active="tab.id === tabStore.activeTabId"
      :is-foreground="tab.id !== tabStore.activeTabId && tab.id === tabStore.activeTabForGroup(props.groupId)"
      :status="sessionStore.sessions.get(tab.sessionId)?.status || 'disconnected'"
      :tab-id="tab.id"
      :type="tab.type"
      :ai-locked="tab.aiLocked || false"
      @activate="tabStore.setActiveTab(tab.id)"
      @close="closeTab(tab)"
      @dragstart="onDragStart(tab.id)"
      @dragend="onDragEnd"
      @duplicate="duplicateTab(tab)"
      @close-right="closeTabsToTheRight(index)"
      @close-left="closeTabsToTheLeft(index)"
      @close-other="closeOtherTabs(index)"
    />
    <!-- Absolute positioned indicator, does NOT affect flex layout -->
    <div v-if="indicatorLeft != null" class="drop-indicator" :style="{ left: indicatorLeft }" />
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
// Non-reactive flag to avoid Vue reactivity during dragstart
let isLocalDrag = false

const groupTabs = computed(() =>
  tabStore.tabs.filter(t => t.groupId === props.groupId)
)

const isSameGroupDrag = computed(() =>
  draggingId.value != null && draggingId.value === tabStore.draggingTabId
)

const indicatorLeft = ref<string | null>(null)

function updateIndicator(targetIdx: number, items: NodeListOf<Element>, barRect: DOMRect) {
  if (!isSameGroupDrag.value || !draggingId.value) {
    indicatorLeft.value = null
    return
  }
  // Don't show indicator on the dragged tab itself (no-change case)
  if (targetIdx < items.length) {
    const item = items[targetIdx] as HTMLElement
    const tabId = item.getAttribute('data-tab-id')
    if (tabId === draggingId.value) {
      indicatorLeft.value = null
      return
    }
    indicatorLeft.value = (item.getBoundingClientRect().left - barRect.left - 1) + 'px'
  } else if (items.length > 0) {
    const lastItem = items[items.length - 1] as HTMLElement
    const tabId = lastItem.getAttribute('data-tab-id')
    if (tabId === draggingId.value) {
      indicatorLeft.value = null
      return
    }
    indicatorLeft.value = (lastItem.getBoundingClientRect().right - barRect.left + 1) + 'px'
  }
}

function onDragStart(tabId: string) {
  draggingId.value = tabId
  tabStore.draggingTabId = tabId
  // Direct DOM manipulation is safe here (not Vue reactive — body class
  // is consumed by CSS rules only). Must happen early so that zone pointer-events
  // are active before the first dragover even if cursor exits the tab bar immediately.
  document.body.classList.add('drag-active')
}

function onDragEnd() {
  document.body.classList.remove('drag-active')
  tabStore.draggingTabId = null
  draggingId.value = null
  dropTargetIndex.value = -1
  indicatorLeft.value = null
}

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
  // Set global drag state on first dragover (NOT in dragstart, to avoid Vue reactivity during drag initiation)
  if (!tabStore.draggingTabId) {
    tabStore.draggingTabId = e.dataTransfer?.getData('text/plain') || null
    document.body.classList.add('drag-active')
    console.log('[TabBar] onDragOver set draggingTabId', tabStore.draggingTabId)
  }
  // Resolve effective drag ID each dragover — WebView2 getData is empty during
  // dragover, and dragend is lost after cross-panel drops, leaving stale local state.
  const dataId = e.dataTransfer?.getData('text/plain') || null
  const effectiveId = dataId || tabStore.draggingTabId || null
  if (draggingId.value !== effectiveId) {
    draggingId.value = effectiveId
  }
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
  updateIndicator(targetIdx, items, rect)
}

function onDragLeave(e: DragEvent) {
  const bar = e.currentTarget as HTMLElement
  const relatedTarget = e.relatedTarget as HTMLElement | null
  if (!relatedTarget || !bar.contains(relatedTarget)) {
    indicatorLeft.value = null
    dropTargetIndex.value = -1
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  document.body.classList.remove('drag-active')
  const tabId = e.dataTransfer?.getData('text/plain')
  if (!tabId) {
    dropTargetIndex.value = -1
    indicatorLeft.value = null
    return
  }

  const tab = tabStore.tabs.find(t => t.id === tabId)
  if (!tab) {
    dropTargetIndex.value = -1
    indicatorLeft.value = null
    return
  }

  // Cross-group move: just change groupId, tree cleanup handles the rest
  if (tab.groupId !== props.groupId) {
    tabStore.moveTab(tabId, props.groupId)
    dropTargetIndex.value = -1
    draggingId.value = null
    tabStore.draggingTabId = null
    indicatorLeft.value = null
    return
  }

  // Within-group reorder (keep existing logic below)
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
  tabStore.draggingTabId = null
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
  position: relative;
}

/* Hide scrollbar */
.tab-bar::-webkit-scrollbar {
  display: none;
}

.drop-indicator {
  position: absolute;
  top: 5px;
  bottom: 5px;
  width: 3px;
  background: var(--accent);
  border-radius: 1.5px;
  pointer-events: none;
  z-index: 5;
  box-shadow: 0 0 6px var(--accent-glow);
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
