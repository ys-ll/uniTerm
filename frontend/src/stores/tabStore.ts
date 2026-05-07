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
    // If this node directly references the removed tab, clear it
    if (node.tabGroupId === tabId) {
      node.tabGroupId = undefined
    }

    // Recursively process children
    if (node.children && node.children.length > 0) {
      node.children = node.children.filter(child => {
        const keep = removeTabFromSplit(child, tabId)
        return keep
      })
    }

    // Return false if this node should be pruned:
    // - no tabGroupId
    // - no children (or empty children array)
    const hasContent = node.tabGroupId !== undefined || (node.children?.length > 0)
    return hasContent || node.id === 'root' // never prune root
  }

  function removeTab(tabId: string) {
    const idx = tabs.value.findIndex(t => t.id === tabId)
    if (idx >= 0) {
      tabs.value.splice(idx, 1)
    }
    if (activeTabId.value === tabId) {
      activeTabId.value = tabs.value.length > 0 ? tabs.value[0].id : null
    }
    // Clean up split tree references (root is never pruned)
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
