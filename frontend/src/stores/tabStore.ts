import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Tab, SplitNode } from '../types/session'

function newNode(overrides: Partial<SplitNode> = {}): SplitNode {
  return {
    id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    direction: null,
    children: [],
    ratio: 0.5,
    ...overrides
  }
}

export const useTabStore = defineStore('tab', () => {
  const tabs = ref<Tab[]>([])
  const activeTabId = ref<string | null>(null)
  const activeTabByGroup = ref<Record<string, string>>({})
  const draggingTabId = ref<string | null>(null)
  const splitRoot = ref<SplitNode>({
    id: 'root',
    direction: null,
    children: [],
    tabGroupId: 'default',
    ratio: 1
  })

  const activeTab = computed(() =>
    tabs.value.find(t => t.id === activeTabId.value) ?? null
  )

  function activeTabForGroup(groupId: string): string | null {
    if (activeTabByGroup.value[groupId]) return activeTabByGroup.value[groupId]
    const firstTab = tabs.value.find(t => t.groupId === groupId)
    return firstTab?.id || null
  }

  // ── Tab basics ──

  function addTab(tab: Tab, groupId: string = 'default') {
    tab.groupId = groupId
    tabs.value.push(tab)
    activeTabId.value = tab.id
    activeTabByGroup.value[groupId] = tab.id
  }

  function removeTab(tabId: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    const groupId = tab?.groupId
    const idx = tabs.value.findIndex(t => t.id === tabId)
    if (idx >= 0) {
      tabs.value.splice(idx, 1)
    }
    if (activeTabId.value === tabId) {
      const sameGroupTabs = tabs.value.filter(t => t.groupId === groupId)
      const next = sameGroupTabs.length > 0
        ? sameGroupTabs[0].id
        : (tabs.value.length > 0 ? tabs.value[0].id : null)
      activeTabId.value = next
      if (next && groupId) {
        activeTabByGroup.value[groupId] = next
      }
    }
    if (groupId && !tabs.value.some(t => t.groupId === groupId)) {
      delete activeTabByGroup.value[groupId]
      removeEmptyGroup(splitRoot.value, groupId)
    }
  }

  function setActiveTab(tabId: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    activeTabId.value = tabId
    if (tab?.groupId) {
      activeTabByGroup.value[tab.groupId] = tabId
    }
  }

  function updateTabTitle(tabId: string, title: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab) tab.title = title
  }

  // ── AI Lock ──

  function toggleAILock(tabId: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab || tab.type !== 'ssh') return

    if (tab.aiLocked) {
      tab.aiLocked = false
    } else {
      // Unlock any other locked tab (only one tab locked at a time)
      for (const t of tabs.value) {
        if (t.id !== tabId) t.aiLocked = false
      }
      tab.aiLocked = true
    }
  }

  function getAILockedTab(): Tab | undefined {
    return tabs.value.find(t => t.aiLocked && t.type === 'ssh')
  }

  // ── Split tree: move tab between groups ──

  function moveTab(tabId: string, targetGroupId: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab) return
    const sourceGroupId = tab.groupId
    if (sourceGroupId === targetGroupId) return

    tab.groupId = targetGroupId
    activeTabId.value = tabId
    activeTabByGroup.value[targetGroupId] = tabId

    // Update source group's active tab
    if (sourceGroupId) {
      const remaining = tabs.value.find(t => t.groupId === sourceGroupId)
      if (remaining) {
        activeTabByGroup.value[sourceGroupId] = remaining.id
      } else {
        delete activeTabByGroup.value[sourceGroupId]
        removeEmptyGroup(splitRoot.value, sourceGroupId)
      }
    }
  }

  // ── Split tree: create split via edge drag ──

  function createSplit(
    tabId: string,
    direction: 'horizontal' | 'vertical',
    edge: 'top' | 'bottom' | 'left' | 'right',
    targetGroupId?: string
  ) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab) return

    const sourceGroupId = tab.groupId || 'default'
    const newGroupId = `group-${Date.now()}`
    const splitGroupId = targetGroupId || sourceGroupId

    // Move tab to new group
    tab.groupId = newGroupId
    activeTabId.value = tabId
    activeTabByGroup.value[newGroupId] = tabId

    // Update source group's active tab
    const remaining = tabs.value.find(t => t.groupId === sourceGroupId)
    if (remaining) {
      activeTabByGroup.value[sourceGroupId] = remaining.id
    }

    // Find leaf node with splitGroupId and replace with split node
    function replace(node: SplitNode): boolean {
      if (!node.direction && node.tabGroupId === splitGroupId) {
        const existingLeaf = newNode({ tabGroupId: node.tabGroupId, ratio: 0.5 })
        const newLeaf = newNode({ tabGroupId: newGroupId, ratio: 0.5 })

        node.direction = direction
        node.tabGroupId = undefined

        // Edge determines child order: top/left = new pane first, bottom/right = existing first
        if (edge === 'top' || edge === 'left') {
          node.children = [newLeaf, existingLeaf]
        } else {
          node.children = [existingLeaf, newLeaf]
        }
        return true
      }
      if (node.children) {
        for (const child of node.children) {
          if (replace(child)) return true
        }
      }
      return false
    }

    replace(splitRoot.value)

    // Clean up source group if now empty
    if (!tabs.value.some(t => t.groupId === sourceGroupId)) {
      delete activeTabByGroup.value[sourceGroupId]
      removeEmptyGroup(splitRoot.value, sourceGroupId)
    }
  }

  // ── Split tree: remove empty group ──

  function removeEmptyGroup(node: SplitNode, targetGroupId: string): boolean {
    // Leaf: remove if matches the empty group
    if (!node.direction) {
      if (node.tabGroupId === targetGroupId && node.id !== 'root') {
        return false // signal removal to parent
      }
      return true
    }

    // Split node: filter children, collapse if needed
    node.children = node.children.filter(child =>
      removeEmptyGroup(child, targetGroupId)
    )

    // Collapse: if only one child remains, replace self with that child
    if (node.children.length === 1) {
      const only = node.children[0]
      node.direction = only.direction
      node.children = only.children
      node.tabGroupId = only.tabGroupId
    }

    return node.children.length > 0 || node.tabGroupId !== undefined || node.id === 'root'
  }

  // ── Split tree: resize pane ──

  function resizePane(parentId: string, ratios: [number, number]) {
    function walk(node: SplitNode) {
      if (node.id === parentId && node.children.length === 2) {
        const [r0, r1] = ratios
        const clamped0 = Math.max(0.15, Math.min(0.85, r0))
        node.children[0].ratio = clamped0
        node.children[1].ratio = 1 - clamped0
        return true
      }
      if (node.children) {
        for (const child of node.children) {
          if (walk(child)) return true
        }
      }
      return false
    }
    walk(splitRoot.value)
  }

  return {
    tabs,
    activeTabId,
    activeTabByGroup,
    activeTabForGroup,
    activeTab,
    splitRoot,
    draggingTabId,
    addTab,
    removeTab,
    setActiveTab,
    updateTabTitle,
    moveTab,
    createSplit,
    resizePane,
    toggleAILock,
    getAILockedTab
  }
})
