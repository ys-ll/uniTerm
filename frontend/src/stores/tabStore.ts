import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Tab, SplitNode } from '../types/session'

export const useTabStore = defineStore('tab', () => {
  const tabs = ref<Tab[]>([])
  const activeTabId = ref<string | null>(null)
  const splitRoot = ref<SplitNode>({
    id: 'root',
    direction: null,
    children: [],
    tabGroupId: 'default'
  })

  const activeTab = computed(() =>
    tabs.value.find(t => t.id === activeTabId.value)
  )

  function addTab(tab: Tab) {
    tabs.value.push(tab)
    activeTabId.value = tab.id
  }

  function removeTab(tabId: string) {
    const idx = tabs.value.findIndex(t => t.id === tabId)
    if (idx >= 0) {
      tabs.value.splice(idx, 1)
    }
    if (activeTabId.value === tabId) {
      activeTabId.value = tabs.value.length > 0 ? tabs.value[0].id : null
    }
  }

  function setActiveTab(tabId: string) {
    activeTabId.value = tabId
  }

  function updateTabTitle(tabId: string, title: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab) {
      tab.title = title
    }
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    splitRoot,
    addTab,
    removeTab,
    setActiveTab,
    updateTabTitle
  }
})
