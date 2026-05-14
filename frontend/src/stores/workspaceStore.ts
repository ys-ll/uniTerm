import { defineStore } from 'pinia'
import { reactive, computed } from 'vue'
import type { Workspace, PanelLayout, LayoutNode } from '../types/workspace'

const workspaceState = reactive<{
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  aiLockedPanelId: string | null
}>({
  workspaces: [],
  activeWorkspaceId: null,
  aiLockedPanelId: null
})

export const useWorkspaceStore = defineStore('workspace', () => {
  const activeWorkspace = computed(() =>
    workspaceState.workspaces.find(w => w.id === workspaceState.activeWorkspaceId) || null
  )

  function createWorkspace(name: string, initialPanelId?: string): Workspace {
    const id = `workspace-${Date.now()}`
    const workspace: Workspace = {
      id,
      name,
      panelIds: initialPanelId ? [initialPanelId] : [],
      layout: initialPanelId
        ? { root: { type: 'leaf', panelId: initialPanelId } }
        : { root: { type: 'leaf', panelId: '' } },
      activePanelId: initialPanelId || null,
      createdAt: Date.now()
    }
    workspaceState.workspaces.push(workspace)
    workspaceState.activeWorkspaceId = id
    return workspace
  }

  function closeWorkspace(id: string) {
    const idx = workspaceState.workspaces.findIndex(w => w.id === id)
    if (idx === -1) return
    workspaceState.workspaces.splice(idx, 1)
    if (workspaceState.activeWorkspaceId === id) {
      workspaceState.activeWorkspaceId = workspaceState.workspaces[0]?.id || null
    }
  }

  function setActiveWorkspace(id: string) {
    workspaceState.activeWorkspaceId = id
  }

  function moveWorkspace(fromIdx: number, toIdx: number) {
    const [w] = workspaceState.workspaces.splice(fromIdx, 1)
    workspaceState.workspaces.splice(toIdx, 0, w)
  }

  function addPanelToWorkspace(workspaceId: string, panelId: string) {
    const w = workspaceState.workspaces.find(x => x.id === workspaceId)
    if (!w) return

    w.panelIds.push(panelId)

    if (w.panelIds.length === 1) {
      w.layout = { root: { type: 'leaf', panelId } }
      w.activePanelId = panelId
    } else if (w.panelIds.length === 2) {
      // Auto split horizontally when adding second panel
      const firstId = w.panelIds[0]
      w.layout = {
        root: {
          type: 'split',
          direction: 'horizontal',
          sizes: [0.5, 0.5],
          children: [
            { type: 'leaf', panelId: firstId },
            { type: 'leaf', panelId }
          ]
        }
      }
    } else {
      // For 3+ panels, need explicit layout update via updateLayout
      // Default: append as horizontal split of last leaf
      w.layout = { root: appendToLayout(w.layout.root, panelId) }
    }

    if (!w.activePanelId) w.activePanelId = panelId
  }

  function removePanelFromWorkspace(workspaceId: string, panelId: string) {
    const w = workspaceState.workspaces.find(x => x.id === workspaceId)
    if (!w) return

    w.panelIds = w.panelIds.filter(pid => pid !== panelId)

    if (w.panelIds.length === 0) {
      closeWorkspace(workspaceId)
      return
    }

    // Remove panel from layout tree
    w.layout = { root: removeFromLayout(w.layout.root, panelId) }

    // If only one panel left, simplify to single leaf
    if (w.panelIds.length === 1) {
      w.layout = { root: { type: 'leaf', panelId: w.panelIds[0] } }
    }

    if (w.activePanelId === panelId) {
      w.activePanelId = w.panelIds[0] || null
    }

    // Clear AI lock if removed panel was locked
    if (workspaceState.aiLockedPanelId === panelId) {
      workspaceState.aiLockedPanelId = null
    }
  }

  function setActivePanel(workspaceId: string, panelId: string) {
    const w = workspaceState.workspaces.find(x => x.id === workspaceId)
    if (w) w.activePanelId = panelId
  }

  function updateLayout(workspaceId: string, layout: PanelLayout) {
    const w = workspaceState.workspaces.find(x => x.id === workspaceId)
    if (w) w.layout = layout
  }

  function renameWorkspace(id: string, name: string) {
    const w = workspaceState.workspaces.find(x => x.id === id)
    if (w) w.name = name
  }

  function setAILockedPanel(panelId: string | null) {
    workspaceState.aiLockedPanelId = panelId
  }

  function getAILockedPanel() {
    return workspaceState.aiLockedPanelId
  }

  // Helper: append panelId to layout tree (default horizontal)
  function appendToLayout(node: LayoutNode, panelId: string): LayoutNode {
    if (node.type === 'leaf') {
      return {
        type: 'split',
        direction: 'horizontal',
        sizes: [0.5, 0.5],
        children: [node, { type: 'leaf', panelId }]
      }
    }
    // Append to last child
    const newChildren = [...node.children]
    newChildren[newChildren.length - 1] = appendToLayout(
      newChildren[newChildren.length - 1],
      panelId
    )
    return { ...node, children: newChildren }
  }

  // Helper: remove panelId from layout tree
  function removeFromLayout(node: LayoutNode, panelId: string): LayoutNode {
    if (node.type === 'leaf') {
      return node.panelId === panelId
        ? { type: 'leaf', panelId: '' }
        : node
    }
    const newChildren = node.children
      .map(child => removeFromLayout(child, panelId))
      .filter(child => !(child.type === 'leaf' && child.panelId === ''))

    if (newChildren.length === 1) {
      return newChildren[0]
    }
    return { ...node, children: newChildren }
  }

  return {
    workspaces: computed(() => workspaceState.workspaces),
    activeWorkspaceId: computed(() => workspaceState.activeWorkspaceId),
    activeWorkspace,
    aiLockedPanelId: computed(() => workspaceState.aiLockedPanelId),
    createWorkspace,
    closeWorkspace,
    setActiveWorkspace,
    moveWorkspace,
    addPanelToWorkspace,
    removePanelFromWorkspace,
    setActivePanel,
    updateLayout,
    renameWorkspace,
    setAILockedPanel,
    getAILockedPanel
  }
})
