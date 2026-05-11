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

  function addTab(tab: Tab, groupId: string = 'default') {
    tab.groupId = groupId
    tabs.value.push(tab)
    activeTabId.value = tab.id
  }

  function removeTabFromSplit(node: SplitNode, tabGroupId: string): boolean {
    if (node.children && node.children.length > 0) {
      node.children = node.children.filter(child => {
        return removeTabFromSplit(child, tabGroupId)
      })
      // If after pruning children, this node has no children and no tabGroupId, prune it
      if (node.children.length === 0 && node.tabGroupId === undefined) {
        return false
      }
      // If only one child left and this is not root, collapse
      if (node.children.length === 1 && node.id !== 'root') {
        const onlyChild = node.children[0]
        node.direction = onlyChild.direction
        node.children = onlyChild.children
        node.tabGroupId = onlyChild.tabGroupId
      }
    }
    // Remove this node if it's the target empty group
    if (node.tabGroupId === tabGroupId && (!node.children || node.children.length === 0)) {
      return false
    }

    const hasContent = node.tabGroupId !== undefined || (node.children?.length > 0)
    return hasContent || node.id === 'root'
  }

  function removeTab(tabId: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    const groupId = tab?.groupId
    const idx = tabs.value.findIndex(t => t.id === tabId)
    if (idx >= 0) {
      tabs.value.splice(idx, 1)
    }
    if (activeTabId.value === tabId) {
      // Prefer next tab in same group
      const sameGroupTabs = tabs.value.filter(t => t.groupId === groupId)
      activeTabId.value = sameGroupTabs.length > 0 ? sameGroupTabs[0].id : (tabs.value.length > 0 ? tabs.value[0].id : null)
    }
    // Clean up split tree: if group has no tabs, remove the group node
    if (groupId && !tabs.value.some(t => t.groupId === groupId)) {
      removeTabFromSplit(splitRoot.value, groupId)
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

  function moveTab(tabId: string, targetGroupId: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab) {
      tab.groupId = targetGroupId
      activeTabId.value = tabId
    }
  }

  function reorderTabs(dragId: string, dropIndex: number) {
    const dragIdx = tabs.value.findIndex(t => t.id === dragId)
    if (dragIdx < 0) return
    const [moved] = tabs.value.splice(dragIdx, 1)
    tabs.value.splice(dropIndex, 0, moved)
  }

  function splitTab(tabId: string, direction: 'horizontal' | 'vertical') {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab) return

    const oldGroupId = tab.groupId || 'default'
    const newGroupId = `group-${Date.now()}`
    tab.groupId = newGroupId
    activeTabId.value = tabId

    // Find the node with oldGroupId and replace it with a split node
    function findAndReplace(node: SplitNode): boolean {
      if (node.tabGroupId === oldGroupId) {
        node.direction = direction
        node.tabGroupId = undefined
        node.children = [
          { id: `split-${Date.now()}-a`, direction: null, children: [], tabGroupId: oldGroupId },
          { id: `split-${Date.now()}-b`, direction: null, children: [], tabGroupId: newGroupId }
        ]
        return true
      }
      if (node.children) {
        for (const child of node.children) {
          if (findAndReplace(child)) return true
        }
      }
      return false
    }

    findAndReplace(splitRoot.value)
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    splitRoot,
    addTab,
    removeTab,
    setActiveTab,
    updateTabTitle,
    moveTab,
    reorderTabs,
    splitTab
  }
})
