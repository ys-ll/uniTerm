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

  function removeTabFromSplit(node: SplitNode, tabId: string): boolean {
    // If this node has a tabGroupId matching the removed tab, clear it
    if (node.tabGroupId === tabId) {
      node.tabGroupId = undefined
    }
    // Recursively clean children
    if (node.children) {
      node.children = node.children.filter(child => {
        // Remove child nodes that directly reference this tab
        if (child.tabGroupId === tabId && !child.children?.length) {
          return false
        }
        // Otherwise recurse
        removeTabFromSplit(child, tabId)
        return true
      })
    }
    return true
  }

  function removeTab(tabId: string) {
    const idx = tabs.value.findIndex(t => t.id === tabId)
    if (idx >= 0) {
      tabs.value.splice(idx, 1)
    }
    if (activeTabId.value === tabId) {
      activeTabId.value = tabs.value.length > 0 ? tabs.value[0].id : null
    }
    // Clean up split tree references
    removeTabFromSplit(splitRoot.value, tabId)
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
