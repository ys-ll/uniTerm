# Tab Model Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Workspace-as-tab model with a three-type tab model (TerminalTab, SettingsTab, WorkspaceTab) where workspace tabs are only created by drag-merging terminal tabs.

**Architecture:** New `tabStore` replaces `workspaceStore` as the central state manager. `Panel.workspaceId` becomes `Panel.tabId`. `WorkspaceTabs.vue` → `TabBar.vue`, `Workspace.vue` logic splits into `TerminalTabContent.vue` + `SettingsTabContent.vue` + `WorkspaceContent.vue`. All drag-merge logic is scoped to TerminalTab only.

**Tech Stack:** Vue 3 + TypeScript + Pinia + @xterm/xterm + Wails v2

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/types/workspace.ts` | Modify | Add Tab types, update Panel (workspaceId→tabId), remove Workspace type |
| `frontend/src/stores/tabStore.ts` | Create | Central tab state: CRUD for all tab types, merge/detach, layout ops, AI lock |
| `frontend/src/stores/panelStore.ts` | Modify | `workspaceId` → `tabId`, `movePanelToWorkspace` → `movePanelToTab` |
| `frontend/src/stores/workspaceStore.ts` | Delete | Replaced by tabStore |
| `frontend/src/components/TabBar.vue` | Create | Mixed tab bar: TabItem + WorkspaceTabItem, tab reorder, panel-detach drop zone |
| `frontend/src/components/TabItem.vue` | Create | TerminalTab/SettingsTab display, AI lock (terminal only), context menu |
| `frontend/src/components/WorkspaceTabItem.vue` | Modify | Adapt to WorkspaceTab type from tabStore, remove AI lock |
| `frontend/src/components/TerminalTabContent.vue` | Create | Single terminal panel, full-screen, no header |
| `frontend/src/components/SettingsTabContent.vue` | Create | Single settings panel wrapper |
| `frontend/src/components/WorkspaceContent.vue` | Create | Multi-panel workspace: PanelGrid + drag/drop + resize (from Workspace.vue) |
| `frontend/src/components/Workspace.vue` | Delete | Logic moved to WorkspaceContent.vue |
| `frontend/src/components/WorkspaceTabs.vue` | Delete | Replaced by TabBar.vue |
| `frontend/src/components/PanelGrid.vue` | Modify | Accept layout + panelIds instead of Workspace object |
| `frontend/src/components/RenderNode.vue` | Modify | Accept layout + panelIds + tabId instead of Workspace object |
| `frontend/src/components/Panel.vue` | Modify | Minor: update emit signatures if needed |
| `frontend/src/components/PanelSplitter.vue` | Keep | No changes needed |
| `frontend/src/components/SettingsTab.vue` | Keep | No changes needed |
| `frontend/src/App.vue` | Modify | Wire tabStore, new components, update onConnect/openSettings |
| `frontend/src/services/agent.ts` | Modify | Use tabStore instead of workspaceStore |
| `frontend/src/services/terminalAgent.ts` | Modify | Use tabStore instead of workspaceStore |
| `frontend/src/composables/useTerminal.ts` | Keep | No changes needed |

---

### Task 1: Update Types

**Files:**
- Modify: `frontend/src/types/workspace.ts`

- [ ] **Step 1: Add Tab types and update Panel**

Replace the entire file content. The `Panel` type changes `workspaceId` to `tabId`. The `Workspace` type is removed. New `Tab`, `TerminalTab`, `SettingsTab`, `WorkspaceTab` types are added. `PanelLayout` and `LayoutNode` are unchanged.

```typescript
export type PanelType = 'ssh' | 'settings' | 'other'
export type PanelStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface ConnectionConfig {
  id: string
  name: string
  type: string
  host: string
  port: number
  user: string
  authType: string
  password?: string
  keyPath?: string
}

export interface Panel {
  id: string
  tabId: string
  type: PanelType
  sessionId: string | null
  title: string
  status: PanelStatus
  config: ConnectionConfig | null
}

export interface PanelLayout {
  root: LayoutNode
}

export type LayoutNode =
  | { type: 'leaf'; panelId: string }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; children: LayoutNode[]; sizes: number[] }

// ── Tab types ──

export type Tab = TerminalTab | SettingsTab | WorkspaceTab

export interface TerminalTab {
  type: 'terminal'
  id: string
  panelId: string
  name: string
}

export interface SettingsTab {
  type: 'settings'
  id: string
  panelId: string
  name: string
}

export interface WorkspaceTab {
  type: 'workspace'
  id: string
  name: string
  panelIds: string[]
  layout: PanelLayout
  activePanelId: string | null
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npx vue-tsc --noEmit 2>&1 | head -50
```

Expected: Type errors from files still importing old types (will be fixed in subsequent tasks).

---

### Task 2: Create tabStore

**Files:**
- Create: `frontend/src/stores/tabStore.ts`

This is the core state manager. It replaces `workspaceStore.ts` entirely.

- [ ] **Step 1: Write the tabStore**

```typescript
import { defineStore } from 'pinia'
import { reactive, computed } from 'vue'
import type { Tab, TerminalTab, SettingsTab, WorkspaceTab, PanelLayout, LayoutNode } from '../types/workspace'

const tabState = reactive<{
  tabs: Tab[]
  activeTabId: string | null
  aiLockedPanelId: string | null
}>({
  tabs: [],
  activeTabId: null,
  aiLockedPanelId: null
})

let idCounter = 0
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`
}

function generateWorkspaceName(existingTabs: Tab[]): string {
  const base = 'Workspace'
  const existingNames = existingTabs.filter(t => t.type === 'workspace').map(t => t.name)
  if (!existingNames.includes(base)) return base
  let i = 2
  while (existingNames.includes(`Workspace (${i})`)) i++
  return `Workspace (${i})`
}

export const useTabStore = defineStore('tab', () => {
  const tabs = computed(() => tabState.tabs)
  const activeTabId = computed(() => tabState.activeTabId)
  const activeTab = computed(() =>
    tabState.tabs.find(t => t.id === tabState.activeTabId) || null
  )
  const aiLockedPanelId = computed(() => tabState.aiLockedPanelId)

  // ── Create tabs ──

  function createTerminalTab(name: string, panelId: string): TerminalTab {
    const tab: TerminalTab = {
      type: 'terminal',
      id: genId('term-tab'),
      panelId,
      name
    }
    tabState.tabs.push(tab)
    tabState.activeTabId = tab.id
    return tab
  }

  function createSettingsTab(name: string, panelId: string): SettingsTab {
    const tab: SettingsTab = {
      type: 'settings',
      id: genId('settings-tab'),
      panelId,
      name
    }
    tabState.tabs.push(tab)
    tabState.activeTabId = tab.id
    return tab
  }

  function createWorkspaceTab(name: string, panelIds: string[], layout: PanelLayout): WorkspaceTab {
    const tab: WorkspaceTab = {
      type: 'workspace',
      id: genId('ws-tab'),
      name,
      panelIds: [...panelIds],
      layout,
      activePanelId: panelIds[0] || null
    }
    tabState.tabs.push(tab)
    tabState.activeTabId = tab.id
    return tab
  }

  // ── Close tab ──

  function closeTab(id: string): string[] {
    const idx = tabState.tabs.findIndex(t => t.id === id)
    if (idx === -1) return []
    const removed = tabState.tabs.splice(idx, 1)[0]

    if (tabState.activeTabId === id) {
      // Activate nearest tab (prefer right, then left)
      if (tabState.tabs.length > 0) {
        const newIdx = Math.min(idx, tabState.tabs.length - 1)
        tabState.activeTabId = tabState.tabs[newIdx].id
      } else {
        tabState.activeTabId = null
      }
    }

    // Clear AI lock if locked panel was in this tab
    const removedPanelIds = removed.type === 'terminal' || removed.type === 'settings'
      ? [removed.panelId]
      : removed.type === 'workspace'
        ? removed.panelIds
        : []

    if (tabState.aiLockedPanelId && removedPanelIds.includes(tabState.aiLockedPanelId)) {
      tabState.aiLockedPanelId = null
    }

    return removedPanelIds
  }

  // ── Activate / reorder / rename ──

  function setActiveTab(id: string) {
    tabState.activeTabId = id
  }

  function moveTab(fromIdx: number, toIdx: number) {
    const [t] = tabState.tabs.splice(fromIdx, 1)
    tabState.tabs.splice(toIdx, 0, t)
  }

  function renameTab(id: string, name: string) {
    const t = tabState.tabs.find(x => x.id === id)
    if (t) t.name = name
  }

  // ── Workspace panel management ──

  function setActivePanel(tabId: string, panelId: string) {
    const t = tabState.tabs.find(x => x.id === tabId)
    if (t && t.type === 'workspace') {
      t.activePanelId = panelId
    }
  }

  function updateWorkspaceLayout(tabId: string, layout: PanelLayout) {
    const t = tabState.tabs.find(x => x.id === tabId)
    if (t && t.type === 'workspace') {
      t.layout = layout
      // Sync panelIds from layout
      t.panelIds = collectPanelIds(layout.root)
    }
  }

  // ── Merge: two terminal tabs → workspace tab ──

  function mergeToWorkspace(
    terminalTabAId: string,
    terminalTabBId: string,
    direction: 'horizontal' | 'vertical',
    insertBefore: boolean
  ): WorkspaceTab | null {
    const idxA = tabState.tabs.findIndex(t => t.id === terminalTabAId)
    const idxB = tabState.tabs.findIndex(t => t.id === terminalTabBId)
    if (idxA === -1 || idxB === -1) return null

    const tabA = tabState.tabs[idxA] as TerminalTab
    const tabB = tabState.tabs[idxB] as TerminalTab
    if (tabA.type !== 'terminal' || tabB.type !== 'terminal') return null

    const children = insertBefore
      ? [{ type: 'leaf' as const, panelId: tabA.panelId }, { type: 'leaf' as const, panelId: tabB.panelId }]
      : [{ type: 'leaf' as const, panelId: tabB.panelId }, { type: 'leaf' as const, panelId: tabA.panelId }]

    const layout: PanelLayout = {
      root: {
        type: 'split',
        direction,
        sizes: [0.5, 0.5],
        children
      }
    }

    const workspaceTab: WorkspaceTab = {
      type: 'workspace',
      id: genId('ws-tab'),
      name: generateWorkspaceName(tabState.tabs),
      panelIds: [tabA.panelId, tabB.panelId],
      layout,
      activePanelId: tabB.panelId
    }

    // Remove in reverse order to preserve indices
    const removeIdxA = tabState.tabs.findIndex(t => t.id === terminalTabAId)
    const removeIdxB = tabState.tabs.findIndex(t => t.id === terminalTabBId)
    if (removeIdxA > removeIdxB) {
      tabState.tabs.splice(removeIdxA, 1)
      tabState.tabs.splice(removeIdxB, 1)
    } else {
      tabState.tabs.splice(removeIdxB, 1)
      tabState.tabs.splice(removeIdxA, 1)
    }

    // Insert workspace tab at the position of the first removed tab
    const insertIdx = Math.min(removeIdxA, removeIdxB)
    tabState.tabs.splice(insertIdx, 0, workspaceTab)
    tabState.activeTabId = workspaceTab.id

    return workspaceTab
  }

  // ── Merge: terminal tab → existing workspace tab ──

  function addPanelToWorkspaceTab(
    terminalTabId: string,
    workspaceTabId: string,
    targetPanelId: string,
    direction: 'horizontal' | 'vertical',
    insertBefore: boolean
  ) {
    const termIdx = tabState.tabs.findIndex(t => t.id === terminalTabId)
    const wsTab = tabState.tabs.find(t => t.id === workspaceTabId)
    if (termIdx === -1 || !wsTab || wsTab.type !== 'workspace') return

    const termTab = tabState.tabs[termIdx] as TerminalTab
    if (termTab.type !== 'terminal') return

    const newPanelId = termTab.panelId

    // Remove terminal tab
    tabState.tabs.splice(termIdx, 1)

    // Add panel to workspace
    wsTab.panelIds.push(newPanelId)
    wsTab.layout = {
      root: insertPanelIntoLayout(wsTab.layout.root, targetPanelId, newPanelId, direction, insertBefore)
    }
    wsTab.activePanelId = newPanelId
    tabState.activeTabId = workspaceTabId
  }

  // ── Detach: panel from workspace → terminal tab ──

  function removePanelFromWorkspaceTab(workspaceTabId: string, panelId: string): TerminalTab | null {
    const wsTab = tabState.tabs.find(t => t.id === workspaceTabId)
    if (!wsTab || wsTab.type !== 'workspace') return null

    const wsIdx = tabState.tabs.findIndex(t => t.id === workspaceTabId)

    // Remove panel from workspace
    wsTab.panelIds = wsTab.panelIds.filter(id => id !== panelId)
    if (wsTab.activePanelId === panelId) {
      wsTab.activePanelId = wsTab.panelIds[0] || null
    }

    // Clear AI lock if needed
    if (tabState.aiLockedPanelId === panelId) {
      tabState.aiLockedPanelId = null
    }

    // Create new terminal tab for the removed panel
    const panelTitle = `Terminal` // Title will be set by caller from panelStore
    const newTerminalTab: TerminalTab = {
      type: 'terminal',
      id: genId('term-tab'),
      panelId,
      name: panelTitle
    }

    // If workspace only has 1 panel left, auto-convert to TerminalTab
    if (wsTab.panelIds.length === 1) {
      const remainingPanelId = wsTab.panelIds[0]
      const convertedTab: TerminalTab = {
        type: 'terminal',
        id: genId('term-tab'),
        panelId: remainingPanelId,
        name: `Terminal`
      }
      // Remove workspace tab and insert converted terminal tab
      tabState.tabs.splice(wsIdx, 1, convertedTab)
      // Also add the detached panel as a new terminal tab
      tabState.tabs.splice(wsIdx + 1, 0, newTerminalTab)
      tabState.activeTabId = convertedTab.id
    } else if (wsTab.panelIds.length === 0) {
      // Workspace is empty, close it
      tabState.tabs.splice(wsIdx, 1)
      tabState.tabs.push(newTerminalTab)
      tabState.activeTabId = newTerminalTab.id
    } else {
      // Update layout by removing the panel
      wsTab.layout = { root: removeFromLayout(wsTab.layout.root, panelId) }
      // Insert new terminal tab after the workspace tab
      tabState.tabs.splice(wsIdx + 1, 0, newTerminalTab)
    }

    return newTerminalTab
  }

  // ── Workspace internal: move panel to new position ──

  function movePanelInWorkspace(
    workspaceTabId: string,
    panelId: string,
    targetPanelId: string,
    direction: 'horizontal' | 'vertical',
    insertBefore: boolean
  ) {
    const wsTab = tabState.tabs.find(t => t.id === workspaceTabId)
    if (!wsTab || wsTab.type !== 'workspace' || panelId === targetPanelId) return

    // Remove panel from old position
    let tempLayout = { root: removeFromLayout(wsTab.layout.root, panelId) }
    // Insert at new position
    tempLayout = {
      root: insertPanelIntoLayout(tempLayout.root, targetPanelId, panelId, direction, insertBefore)
    }
    wsTab.layout = tempLayout
    wsTab.panelIds = collectPanelIds(tempLayout.root)
  }

  // ── AI lock ──

  function setAILockedPanel(panelId: string | null) {
    tabState.aiLockedPanelId = panelId
  }

  function getAILockedPanel(): string | null {
    return tabState.aiLockedPanelId
  }

  // ── Layout helpers ──

  function collectPanelIds(node: LayoutNode): string[] {
    if (node.type === 'leaf') return node.panelId ? [node.panelId] : []
    return node.children.flatMap(collectPanelIds)
  }

  function hasPanelInNode(node: LayoutNode, panelId: string): boolean {
    if (node.type === 'leaf') return node.panelId === panelId
    return node.children.some(child => hasPanelInNode(child, panelId))
  }

  function insertPanelIntoLayout(
    node: LayoutNode,
    targetId: string,
    newId: string,
    direction: 'horizontal' | 'vertical',
    before: boolean
  ): LayoutNode {
    if (node.type === 'leaf') {
      if (node.panelId === targetId) {
        const children = before
          ? [{ type: 'leaf' as const, panelId: newId }, node]
          : [node, { type: 'leaf' as const, panelId: newId }]
        return { type: 'split', direction, sizes: [0.5, 0.5], children }
      }
      return node
    }
    const hasTarget = node.children.some(child => hasPanelInNode(child, targetId))
    if (hasTarget) {
      return {
        ...node,
        children: node.children.map(child =>
          insertPanelIntoLayout(child, targetId, newId, direction, before)
        )
      }
    }
    return node
  }

  function removeFromLayout(node: LayoutNode, panelId: string): LayoutNode {
    if (node.type === 'leaf') {
      return node.panelId === panelId
        ? { type: 'leaf' as const, panelId: '' }
        : node
    }
    const newChildren = node.children
      .map(child => removeFromLayout(child, panelId))
      .filter(child => !(child.type === 'leaf' && child.panelId === ''))

    if (newChildren.length === 0) {
      return { type: 'leaf' as const, panelId: '' }
    }
    if (newChildren.length === 1) {
      return newChildren[0]
    }
    return { ...node, children: newChildren }
  }

  function updateNodeInTree(
    node: LayoutNode,
    oldNode: LayoutNode,
    newNode: LayoutNode
  ): LayoutNode {
    if (node === oldNode) return newNode
    if (node.type === 'leaf') return node
    return {
      ...node,
      children: node.children.map(child => updateNodeInTree(child, oldNode, newNode))
    }
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    aiLockedPanelId,
    createTerminalTab,
    createSettingsTab,
    createWorkspaceTab,
    closeTab,
    setActiveTab,
    moveTab,
    renameTab,
    setActivePanel,
    updateWorkspaceLayout,
    mergeToWorkspace,
    addPanelToWorkspaceTab,
    removePanelFromWorkspaceTab,
    movePanelInWorkspace,
    setAILockedPanel,
    getAILockedPanel,
    // Expose helpers for components
    collectPanelIds,
    insertPanelIntoLayout,
    removeFromLayout,
    updateNodeInTree
  }
})
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npx vue-tsc --noEmit 2>&1 | head -50
```

Expected: Only errors from files not yet migrated (workspaceStore imports).

---

### Task 3: Update panelStore

**Files:**
- Modify: `frontend/src/stores/panelStore.ts`

- [ ] **Step 1: Rename workspaceId → tabId and movePanelToWorkspace → movePanelToTab**

```typescript
import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { Panel, PanelStatus, ConnectionConfig } from '../types/workspace'

const panelState = reactive<{
  panels: Map<string, Panel>
}>({
  panels: new Map()
})

export const usePanelStore = defineStore('panel', () => {
  function createPanel(config: ConnectionConfig | null, type: Panel['type'] = 'ssh'): Panel {
    const id = `panel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const panel: Panel = {
      id,
      tabId: '',
      type,
      sessionId: null,
      title: config ? `${config.host} ${config.user}` : 'New Panel',
      status: 'disconnected',
      config
    }
    panelState.panels.set(id, panel)
    return panel
  }

  function removePanel(id: string) {
    panelState.panels.delete(id)
  }

  function getPanel(id: string): Panel | undefined {
    return panelState.panels.get(id)
  }

  function bindSession(panelId: string, sessionId: string) {
    const p = panelState.panels.get(panelId)
    if (p) p.sessionId = sessionId
  }

  function updateStatus(panelId: string, status: PanelStatus) {
    const p = panelState.panels.get(panelId)
    if (p) p.status = status
  }

  function updateTitle(panelId: string, title: string) {
    const p = panelState.panels.get(panelId)
    if (p) p.title = title
  }

  function movePanelToTab(panelId: string, tabId: string) {
    const p = panelState.panels.get(panelId)
    if (p) p.tabId = tabId
  }

  return {
    panels: panelState.panels,
    createPanel,
    removePanel,
    getPanel,
    bindSession,
    updateStatus,
    updateTitle,
    movePanelToTab
  }
})
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npx vue-tsc --noEmit 2>&1 | head -50
```

---

### Task 4: Create WorkspaceContent.vue

**Files:**
- Create: `frontend/src/components/WorkspaceContent.vue`

This extracts the content area logic from the current `Workspace.vue`. It receives a `WorkspaceTab` instead of a `Workspace`.

- [ ] **Step 1: Write WorkspaceContent.vue**

```vue
<template>
  <div
    class="workspace-content"
    @dragover.prevent="onWorkspaceDragOver"
    @dragleave="onWorkspaceDragLeave"
    @drop="onWorkspaceDrop"
  >
    <div v-if="dragOverArea" class="workspace-drop-hint">
      Drop terminal tab here to merge
    </div>
    <PanelGrid
      :layout="tab.layout"
      :panel-ids="tab.panelIds"
      :active-panel-id="tab.activePanelId"
      :tab-id="tab.id"
      @close-panel="closePanel"
      @toggle-ai-lock="onToggleAiLock"
      @panel-drag-start="onPanelDragStart"
      @panel-drop="onPanelDrop"
      @resize="onResize"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useTabStore } from '../stores/tabStore'
import { usePanelStore } from '../stores/panelStore'
import type { WorkspaceTab, LayoutNode } from '../types/workspace'
import PanelGrid from './PanelGrid.vue'

const props = defineProps<{
  tab: WorkspaceTab
}>()

const emit = defineEmits<{
  panelDetach: [panelId: string]
}>()

const tabStore = useTabStore()
const panelStore = usePanelStore()

const dragOverArea = ref(false)

function closePanel(panelId: string) {
  const panel = panelStore.getPanel(panelId)
  tabStore.removePanelFromWorkspaceTab(props.tab.id, panelId)
  if (panel) {
    panelStore.removePanel(panel.id)
  }
}

function onToggleAiLock(panelId: string) {
  if (tabStore.aiLockedPanelId === panelId) {
    tabStore.setAILockedPanel(null)
  } else {
    tabStore.setAILockedPanel(panelId)
  }
}

function onPanelDragStart(e: DragEvent, panelId: string) {
  if (e.dataTransfer) {
    e.dataTransfer.setData('application/panel-id', panelId)
    e.dataTransfer.setData('application/source-tab-id', props.tab.id)
    e.dataTransfer.effectAllowed = 'move'
  }
}

function onPanelDrop(e: DragEvent, targetPanelId: string, targetRect?: DOMRect) {
  const draggedPanelId = e.dataTransfer?.getData('application/panel-id')
  const draggedTabId = e.dataTransfer?.getData('application/tab-id')
  const sourceTabId = e.dataTransfer?.getData('application/source-tab-id')

  // Case 1: Terminal tab dragged into workspace (from TabBar)
  if (draggedTabId && !draggedPanelId) {
    const draggedTab = tabStore.tabs.find(t => t.id === draggedTabId)
    if (!draggedTab || draggedTab.type !== 'terminal') return

    const rect = targetRect || (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const w = rect.width
    const h = rect.height

    const leftZone = x / w < 0.3
    const rightZone = x / w > 0.7
    const topZone = y / h < 0.3
    const bottomZone = y / h > 0.7

    let direction: 'horizontal' | 'vertical'
    let insertBefore: boolean

    if (leftZone) { direction = 'horizontal'; insertBefore = true }
    else if (rightZone) { direction = 'horizontal'; insertBefore = false }
    else if (topZone) { direction = 'vertical'; insertBefore = true }
    else if (bottomZone) { direction = 'vertical'; insertBefore = false }
    else { direction = 'horizontal'; insertBefore = false }

    tabStore.addPanelToWorkspaceTab(draggedTabId, props.tab.id, targetPanelId, direction, insertBefore)
    panelStore.movePanelToTab(draggedTab.panelId, props.tab.id)
    return
  }

  // Case 2: Panel reposition within same workspace or from another workspace
  if (!draggedPanelId || draggedPanelId === targetPanelId) return

  const draggedPanel = panelStore.getPanel(draggedPanelId)
  if (!draggedPanel) return

  const rect = targetRect || (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const w = rect.width
  const h = rect.height

  const leftZone = x / w < 0.3
  const rightZone = x / w > 0.7
  const topZone = y / h < 0.3
  const bottomZone = y / h > 0.7

  let direction: 'horizontal' | 'vertical'
  let insertBefore: boolean

  if (leftZone) { direction = 'horizontal'; insertBefore = true }
  else if (rightZone) { direction = 'horizontal'; insertBefore = false }
  else if (topZone) { direction = 'vertical'; insertBefore = true }
  else if (bottomZone) { direction = 'vertical'; insertBefore = false }
  else { direction = 'horizontal'; insertBefore = false }

  // If dragged from a different tab (workspace or terminal tab)
  if (sourceTabId && sourceTabId !== props.tab.id) {
    const sourceTab = tabStore.tabs.find(t => t.id === sourceTabId)
    if (sourceTab?.type === 'workspace') {
      tabStore.removePanelFromWorkspaceTab(sourceTabId, draggedPanelId)
    }
    // Add to this workspace
    props.tab.panelIds.push(draggedPanelId)
    panelStore.movePanelToTab(draggedPanelId, props.tab.id)
    const newLayout = tabStore.insertPanelIntoLayout(
      props.tab.layout.root,
      targetPanelId,
      draggedPanelId,
      direction,
      insertBefore
    )
    tabStore.updateWorkspaceLayout(props.tab.id, { root: newLayout })
  } else {
    // Same workspace reposition
    tabStore.movePanelInWorkspace(props.tab.id, draggedPanelId, targetPanelId, direction, insertBefore)
  }
}

function onWorkspaceDragOver(e: DragEvent) {
  const hasPanel = e.dataTransfer?.types.includes('application/panel-id')
  const hasTab = e.dataTransfer?.types.includes('application/tab-id')
  if (hasPanel || hasTab) {
    dragOverArea.value = true
    e.dataTransfer!.dropEffect = 'move'
  }
}

function onWorkspaceDragLeave() {
  dragOverArea.value = false
}

function onWorkspaceDrop(e: DragEvent) {
  dragOverArea.value = false
  // Handled by onPanelDrop via PanelGrid → RenderNode chain
}

function onResize(payload: { node: any, index: number, delta: number }) {
  const { node, index, delta } = payload
  if (node.type !== 'split') return

  const newSizes = [...node.sizes]
  const ratioDelta = delta / 400
  newSizes[index] = Math.max(0.1, Math.min(0.9, newSizes[index] + ratioDelta))
  newSizes[index + 1] = Math.max(0.1, Math.min(0.9, newSizes[index + 1] - ratioDelta))

  const total = newSizes.reduce((a, b) => a + b, 0)
  const normalized = newSizes.map(s => s / total)

  const newNode = { ...node, sizes: normalized }
  const newRoot = tabStore.updateNodeInTree(props.tab.layout.root, node, newNode)
  tabStore.updateWorkspaceLayout(props.tab.id, { root: newRoot })
}
</script>

<style scoped>
.workspace-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
  position: relative;
}
.workspace-drop-hint {
  position: absolute;
  inset: 20px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--accent-dim);
  border-radius: 8px;
  background: rgba(34, 211, 238, 0.04);
  color: var(--accent);
  font-size: 14px;
  font-family: var(--font-ui);
  pointer-events: none;
}
</style>
```

---

### Task 5: Create TerminalTabContent.vue

**Files:**
- Create: `frontend/src/components/TerminalTabContent.vue`

- [ ] **Step 1: Write TerminalTabContent.vue**

```vue
<template>
  <div class="terminal-tab-content">
    <Panel
      v-if="panel"
      :panel="panel"
      :show-header="false"
      :is-active="true"
      @close="handleClose"
      @toggle-ai-lock="onToggleAiLock"
    />
    <div v-else class="no-panel">Panel not found</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePanelStore } from '../stores/panelStore'
import { useTabStore } from '../stores/tabStore'
import type { TerminalTab } from '../types/workspace'
import Panel from './Panel.vue'

const props = defineProps<{
  tab: TerminalTab
}>()

const emit = defineEmits<{
  close: [tabId: string]
}>()

const panelStore = usePanelStore()
const tabStore = useTabStore()

const panel = computed(() => panelStore.getPanel(props.tab.panelId))

function handleClose(panelId: string) {
  emit('close', props.tab.id)
}

function onToggleAiLock(panelId: string) {
  if (tabStore.aiLockedPanelId === panelId) {
    tabStore.setAILockedPanel(null)
  } else {
    tabStore.setAILockedPanel(panelId)
  }
}
</script>

<style scoped>
.terminal-tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
}
.no-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
```

---

### Task 6: Create SettingsTabContent.vue

**Files:**
- Create: `frontend/src/components/SettingsTabContent.vue`

- [ ] **Step 1: Write SettingsTabContent.vue**

```vue
<template>
  <div class="settings-tab-content">
    <SettingsTab />
  </div>
</template>

<script setup lang="ts">
import SettingsTab from './SettingsTab.vue'
</script>

<style scoped>
.settings-tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
}
</style>
```

---

### Task 7: Update PanelGrid and RenderNode

**Files:**
- Modify: `frontend/src/components/PanelGrid.vue`
- Modify: `frontend/src/components/RenderNode.vue`

These need to accept individual props instead of a `Workspace` object.

- [ ] **Step 1: Update PanelGrid.vue**

Change from accepting `workspace: Workspace` to individual layout props:

```vue
<template>
  <div class="panel-grid">
    <RenderNode
      :node="layout.root"
      :panel-ids="panelIds"
      :active-panel-id="activePanelId"
      :tab-id="tabId"
      @close-panel="$emit('closePanel', $event)"
      @toggle-ai-lock="$emit('toggleAiLock', $event)"
      @panel-drag-start="(e, id) => $emit('panelDragStart', e, id)"
      @panel-drop="(e, id, rect) => $emit('panelDrop', e, id, rect)"
      @resize="$emit('resize', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { PanelLayout } from '../types/workspace'
import RenderNode from './RenderNode.vue'

defineProps<{
  layout: PanelLayout
  panelIds: string[]
  activePanelId: string | null
  tabId: string
}>()

defineEmits<{
  closePanel: [panelId: string]
  toggleAiLock: [panelId: string]
  panelDragStart: [e: DragEvent, panelId: string]
  panelDrop: [e: DragEvent, targetPanelId: string, rect: DOMRect]
  resize: [payload: { node: any, index: number, delta: number }]
}>()
</script>

<style scoped>
.panel-grid {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
```

- [ ] **Step 2: Update RenderNode.vue**

Change props from `workspace: Workspace` to individual props. Replace `workspaceStore.setActivePanel` with `tabStore.setActivePanel`. Replace `workspace.activePanelId` with `activePanelId`. Replace `workspace.panelIds.length` with `panelIds.length`.

Key changes in `<script setup>`:

```typescript
import { usePanelStore } from '../stores/panelStore'
import { useTabStore } from '../stores/tabStore'
import type { LayoutNode } from '../types/workspace'

const props = defineProps<{
  node: LayoutNode
  panelIds: string[]
  activePanelId: string | null
  tabId: string
}>()

const panelStore = usePanelStore()
const tabStore = useTabStore()

const isMultiPanel = computed(() => props.panelIds.length > 1)

function onPanelClick(panelId: string) {
  tabStore.setActivePanel(props.tabId, panelId)
}
```

Remove the `useWorkspaceStore` import. Update the `isMultiPanel` computed to use `props.panelIds.length`.

---

### Task 8: Create TabItem.vue

**Files:**
- Create: `frontend/src/components/TabItem.vue`

For TerminalTab and SettingsTab. TerminalTab shows AI lock button, SettingsTab does not.

- [ ] **Step 1: Write TabItem.vue**

```vue
<template>
  <div
    class="tab-item"
    :class="{ active: isActive, 'ai-locked': isAILocked }"
    @click="$emit('activate', tab.id)"
    draggable="true"
    @dragstart="onDragStart"
    @contextmenu="onContextMenu"
  >
    <span class="tab-name">{{ tab.name }}</span>
    <button
      v-if="tab.type === 'terminal'"
      class="tab-ai-lock"
      :class="{ locked: isAILocked }"
      @click.stop="$emit('toggleAiLock', tab.panelId)"
      :title="isAILocked ? 'AI locked' : 'Lock AI'"
    >AI</button>
    <button
      v-if="isActive || showClose"
      class="tab-close"
      @click.stop="$emit('close', tab.id)"
    >×</button>

    <Teleport to="body">
      <div
        v-show="contextMenuVisible"
        ref="menuRef"
        class="tab-context-menu"
        :style="contextMenuStyle"
        @click.stop
      >
        <div class="menu-item" @click="renameTab">{{ t('tab.rename') }}</div>
        <div class="menu-divider" />
        <div class="menu-item" @click="closeTab">{{ t('tab.close') }}</div>
        <div class="menu-item" @click="closeOther">{{ t('tab.closeOther') }}</div>
        <div class="menu-item" @click="closeRight">{{ t('tab.closeRight') }}</div>
        <div class="menu-item" @click="closeLeft">{{ t('tab.closeLeft') }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTabStore } from '../stores/tabStore'
import { useI18n } from '../i18n'
import type { TerminalTab, SettingsTab } from '../types/workspace'

const props = defineProps<{
  tab: TerminalTab | SettingsTab
  isActive: boolean
  showClose?: boolean
}>()

const emit = defineEmits<{
  activate: [id: string]
  close: [id: string]
  toggleAiLock: [panelId: string]
}>()

const tabStore = useTabStore()
const { t } = useI18n()

const contextMenuVisible = ref(false)
const contextMenuStyle = ref({ left: '0px', top: '0px' })

const isAILocked = computed(() => {
  if (props.tab.type !== 'terminal') return false
  return tabStore.aiLockedPanelId === props.tab.panelId
})

function onDragStart(e: DragEvent) {
  // Terminal tabs set application/tab-id for merge operations
  // Settings tabs only set this for reordering
  e.dataTransfer?.setData('application/tab-id', props.tab.id)
  if (props.tab.type === 'terminal') {
    e.dataTransfer?.setData('application/tab-type', 'terminal')
  }
  e.dataTransfer!.effectAllowed = 'move'
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  window.dispatchEvent(new CustomEvent('global:close-context-menus'))
  contextMenuStyle.value = { left: e.clientX + 'px', top: e.clientY + 'px' }
  contextMenuVisible.value = true
}

function closeContextMenu() {
  contextMenuVisible.value = false
}

function closeTab() {
  emit('close', props.tab.id)
  closeContextMenu()
}

function closeOther() {
  const allTabs = tabStore.tabs
  const currentIdx = allTabs.findIndex(t => t.id === props.tab.id)
  const others = allTabs.filter((_, i) => i !== currentIdx)
  others.forEach(t => emit('close', t.id))
  closeContextMenu()
}

function closeRight() {
  const allTabs = tabStore.tabs
  const currentIdx = allTabs.findIndex(t => t.id === props.tab.id)
  allTabs.slice(currentIdx + 1).forEach(t => emit('close', t.id))
  closeContextMenu()
}

function closeLeft() {
  const allTabs = tabStore.tabs
  const currentIdx = allTabs.findIndex(t => t.id === props.tab.id)
  allTabs.slice(0, currentIdx).forEach(t => emit('close', t.id))
  closeContextMenu()
}

function renameTab() {
  const name = prompt('Rename tab:', props.tab.name)
  if (name) {
    tabStore.renameTab(props.tab.id, name)
  }
  closeContextMenu()
}

onMounted(() => {
  window.addEventListener('global:close-context-menus', closeContextMenu)
  document.addEventListener('click', closeContextMenu)
})

onUnmounted(() => {
  window.removeEventListener('global:close-context-menus', closeContextMenu)
  document.removeEventListener('click', closeContextMenu)
})
</script>

<style scoped>
.tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  user-select: none;
  border-bottom: 2px solid transparent;
  position: relative;
}
.tab-item.active {
  border-bottom-color: var(--accent);
  background: var(--bg-surface);
}
.tab-item.ai-locked {
  box-shadow: inset 3px 0 0 var(--warning, #f59e0b);
}
.tab-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab-ai-lock {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  opacity: 0;
}
.tab-item:hover .tab-ai-lock,
.tab-item.active .tab-ai-lock,
.tab-ai-lock.locked {
  opacity: 1;
}
.tab-ai-lock:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.tab-ai-lock.locked {
  color: var(--warning, #f59e0b);
}
.tab-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
}
.tab-close:hover {
  color: var(--text-primary);
}
</style>

<style>
.tab-context-menu {
  position: fixed;
  z-index: 99999;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  min-width: 180px;
  padding: 4px;
  backdrop-filter: blur(8px);
}
.tab-context-menu .menu-item {
  padding: 7px 14px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  border-radius: var(--radius-sm);
  transition: all 0.1s ease;
}
.tab-context-menu .menu-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.tab-context-menu .menu-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px 6px;
}
</style>
```

---

### Task 9: Update WorkspaceTabItem.vue

**Files:**
- Modify: `frontend/src/components/WorkspaceTabItem.vue`

Adapt to use `WorkspaceTab` from tabStore instead of `Workspace`. Remove AI lock button (AI lock is on panels inside workspace).

- [ ] **Step 1: Rewrite WorkspaceTabItem.vue**

Replace `workspace: Workspace` prop with `tab: WorkspaceTab`. All references to `props.workspace` become `props.tab`. Replace `workspaceStore` with `tabStore`. Remove `isSingleSSHPanel` and `isAILocked` computed properties (AI lock is on panels, not the workspace tab). Remove the AI lock button from the template. Keep the context menu.

Key changes:

```typescript
import { useTabStore } from '../stores/tabStore'
import type { WorkspaceTab } from '../types/workspace'

const props = defineProps<{
  tab: WorkspaceTab
  isActive: boolean
  showClose?: boolean
}>()

const tabStore = useTabStore()
```

Remove `isSingleSSHPanel` and `isAILocked` computed. Remove AI lock button from template.

Drag start sets both `application/tab-id` and `application/workspace-id` (the latter for internal panel reposition + backward compat):

```typescript
function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('application/tab-id', props.tab.id)
  e.dataTransfer?.setData('application/workspace-id', props.tab.id)
  e.dataTransfer?.setData('application/tab-type', 'workspace')
  e.dataTransfer!.effectAllowed = 'move'
}
```

Update `closeOther`, `closeRight`, `closeLeft` to use `tabStore.tabs` instead of `workspaceStore.workspaces`.

---

### Task 10: Create TabBar.vue

**Files:**
- Create: `frontend/src/components/TabBar.vue`

Replaces `WorkspaceTabs.vue`. Renders a mixed list of `TabItem` and `WorkspaceTabItem`. Handles tab reordering via drag-and-drop. Handles panel detach (panel dragged from workspace to tab bar).

- [ ] **Step 1: Write TabBar.vue**

```vue
<template>
  <div
    class="tab-bar"
    :class="{ 'drag-over': dragOverTabs }"
    @dragover.prevent="onTabsDragOver"
    @dragleave="onTabsDragLeave"
    @drop="onTabsDrop"
  >
    <div class="tabs-list" ref="tabsListRef">
      <template v-for="tab in tabs" :key="tab.id">
        <TabItem
          v-if="tab.type === 'terminal' || tab.type === 'settings'"
          :tab="tab"
          :is-active="tab.id === activeTabId"
          @activate="setActiveTab"
          @close="closeTab"
          @toggle-ai-lock="onToggleAiLock"
          @dragstart="onTabDragStart($event, tab.id)"
          @dragover.prevent
          @drop="onTabDrop($event, tab.id)"
        />
        <WorkspaceTabItem
          v-else-if="tab.type === 'workspace'"
          :tab="tab"
          :is-active="tab.id === activeTabId"
          @activate="setActiveTab"
          @close="closeTab"
          @dragstart="onTabDragStart($event, tab.id)"
          @dragover.prevent
          @drop="onTabDrop($event, tab.id)"
        />
      </template>
    </div>
    <div v-if="dragOverTabs" class="tabs-drop-hint">
      Drop to create new terminal tab
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTabStore } from '../stores/tabStore'
import { usePanelStore } from '../stores/panelStore'
import TabItem from './TabItem.vue'
import WorkspaceTabItem from './WorkspaceTabItem.vue'

const tabStore = useTabStore()
const panelStore = usePanelStore()
const tabs = computed(() => tabStore.tabs)
const activeTabId = computed(() => tabStore.activeTabId)

const dragOverTabs = ref(false)

function setActiveTab(id: string) {
  tabStore.setActiveTab(id)
}

function closeTab(id: string) {
  const panelIds = tabStore.closeTab(id)
  panelIds.forEach(pid => panelStore.removePanel(pid))
}

function onToggleAiLock(panelId: string) {
  if (tabStore.aiLockedPanelId === panelId) {
    tabStore.setAILockedPanel(null)
  } else {
    tabStore.setAILockedPanel(panelId)
  }
}

function onTabDragStart(e: DragEvent, tabId: string) {
  // Data is set in TabItem/WorkspaceTabItem, this is for reordering detection
}

function onTabDrop(e: DragEvent, targetTabId: string) {
  e.stopPropagation()
  const draggedTabId = e.dataTransfer?.getData('application/tab-id')
  const draggedPanelId = e.dataTransfer?.getData('application/panel-id')

  if (draggedTabId && draggedTabId !== targetTabId) {
    // Tab reordering
    const fromIdx = tabs.value.findIndex(t => t.id === draggedTabId)
    const toIdx = tabs.value.findIndex(t => t.id === targetTabId)
    if (fromIdx !== -1 && toIdx !== -1) {
      tabStore.moveTab(fromIdx, toIdx)
    }
  }
}

function onTabsDragOver(e: DragEvent) {
  const hasPanel = e.dataTransfer?.types.includes('application/panel-id')
  const hasTab = e.dataTransfer?.types.includes('application/tab-id')
  if (hasPanel || hasTab) {
    dragOverTabs.value = true
    e.dataTransfer!.dropEffect = 'move'
  }
}

function onTabsDragLeave(e: DragEvent) {
  const el = e.currentTarget as HTMLElement
  const relatedTarget = e.relatedTarget as HTMLElement | null
  if (!relatedTarget || !el.contains(relatedTarget)) {
    dragOverTabs.value = false
  }
}

function onTabsDrop(e: DragEvent) {
  dragOverTabs.value = false
  const panelId = e.dataTransfer?.getData('application/panel-id')
  const sourceTabId = e.dataTransfer?.getData('application/source-tab-id')

  if (!panelId) return

  const panel = panelStore.getPanel(panelId)
  if (!panel) return

  // Remove panel from its workspace tab
  if (sourceTabId) {
    tabStore.removePanelFromWorkspaceTab(sourceTabId, panelId)
  }

  // Create a new terminal tab for the detached panel
  const tab = tabStore.createTerminalTab(panel.title, panelId)
  panelStore.movePanelToTab(panelId, tab.id)
}
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  height: 40px;
  background: var(--bg-base);
  border-bottom: 1px solid var(--border-subtle);
  position: relative;
  transition: background 0.15s, border-color 0.15s;
}
.tab-bar.drag-over {
  background: var(--accent-subtle);
  border-bottom-color: var(--accent-dim);
}
.tabs-list {
  display: flex;
  flex: 1;
  overflow-x: auto;
}
.tabs-drop-hint {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: var(--accent);
  font-family: var(--font-ui);
  pointer-events: none;
}
</style>
```

---

### Task 11: Update agent.ts and terminalAgent.ts

**Files:**
- Modify: `frontend/src/services/agent.ts`
- Modify: `frontend/src/services/terminalAgent.ts`

Replace `useWorkspaceStore` with `useTabStore`.

- [ ] **Step 1: Update agent.ts**

Replace import:
```typescript
import { useTabStore } from '../stores/tabStore'
```

Replace `getActivePanel()`:
```typescript
function getActivePanel() {
  const tabStore = useTabStore()
  const panelStore = usePanelStore()

  const lockedPanelId = tabStore.getAILockedPanel()
  if (lockedPanelId) {
    return panelStore.getPanel(lockedPanelId)
  }

  const activeTab = tabStore.activeTab
  if (!activeTab) return undefined

  if (activeTab.type === 'terminal' || activeTab.type === 'settings') {
    return panelStore.getPanel(activeTab.panelId)
  }

  if (activeTab.type === 'workspace' && activeTab.activePanelId) {
    return panelStore.getPanel(activeTab.activePanelId)
  }

  return undefined
}
```

Remove `useWorkspaceStore` import.

- [ ] **Step 2: Update terminalAgent.ts**

Replace import:
```typescript
import { useTabStore } from '../stores/tabStore'
```

Replace the panel lookup logic in `executeCommand()`:
```typescript
const tabStore = useTabStore()
const panelStore = usePanelStore()

const lockedPanelId = tabStore.getAILockedPanel()
let panel = lockedPanelId ? panelStore.getPanel(lockedPanelId) : null

if (!panel) {
  const activeTab = tabStore.activeTab
  if (activeTab?.type === 'terminal' || activeTab?.type === 'settings') {
    panel = panelStore.getPanel(activeTab.panelId)
  } else if (activeTab?.type === 'workspace' && activeTab.activePanelId) {
    panel = panelStore.getPanel(activeTab.activePanelId)
  }
}
```

Remove `useWorkspaceStore` import.

---

### Task 12: Wire Up App.vue

**Files:**
- Modify: `frontend/src/App.vue`

This is the main integration point. Replace workspaceStore with tabStore, replace old components with new ones.

- [ ] **Step 1: Update App.vue template**

Replace:
```html
<WorkspaceTabs />
<Workspace
  v-if="workspaceStore.activeWorkspace"
  :workspace="workspaceStore.activeWorkspace"
/>
```

With:
```html
<TabBar />
<template v-if="activeTab">
  <TerminalTabContent
    v-if="activeTab.type === 'terminal'"
    :tab="activeTab"
    @close="closeTab"
  />
  <SettingsTabContent
    v-else-if="activeTab.type === 'settings'"
    :tab="activeTab"
  />
  <WorkspaceContent
    v-else-if="activeTab.type === 'workspace'"
    :tab="activeTab"
  />
</template>
```

- [ ] **Step 2: Update App.vue script**

Replace imports:
```typescript
import TabBar from './components/TabBar.vue'
import TerminalTabContent from './components/TerminalTabContent.vue'
import SettingsTabContent from './components/SettingsTabContent.vue'
import WorkspaceContent from './components/WorkspaceContent.vue'
import { useTabStore } from './stores/tabStore'
```

Remove imports: `Workspace`, `WorkspaceTabs`, `useWorkspaceStore`.

Add:
```typescript
const tabStore = useTabStore()
const activeTab = computed(() => tabStore.activeTab)
```

Update `onConnect()`:
```typescript
async function onConnect(config: ConnectionConfig) {
  connectionStore.add(config)
  const panel = panelStore.createPanel(config, 'ssh')
  const displayTitle = config.name
    ? `${config.name} (${config.host})`
    : `${config.user}@${config.host}`
  panel.title = displayTitle
  const tab = tabStore.createTerminalTab(displayTitle, panel.id)
  panelStore.movePanelToTab(panel.id, tab.id)

  try {
    const info = await CreateSession(config.type, config)
    panelStore.bindSession(panel.id, info.id)
    sessionStore.initSession(info.id)
  } catch (e) {
    console.error('Failed to create session:', e)
    tabStore.closeTab(tab.id)
    panelStore.removePanel(panel.id)
  }
}
```

Update `openSettings()`:
```typescript
function openSettings() {
  // Check if settings tab already exists
  const existingTab = tabStore.tabs.find(t => t.type === 'settings')
  if (existingTab) {
    tabStore.setActiveTab(existingTab.id)
    return
  }

  const panel = panelStore.createPanel(null, 'settings')
  panel.title = t('settings.title')
  const tab = tabStore.createSettingsTab(t('settings.title'), panel.id)
  panelStore.movePanelToTab(panel.id, tab.id)
}
```

Add `closeTab()`:
```typescript
function closeTab(tabId: string) {
  const panelIds = tabStore.closeTab(tabId)
  panelIds.forEach(pid => panelStore.removePanel(pid))
}
```

- [ ] **Step 3: Add missing computed import**

Ensure `computed` is imported from `vue` in App.vue.

---

### Task 13: Clean Up Old Files

**Files:**
- Delete: `frontend/src/stores/workspaceStore.ts`
- Delete: `frontend/src/components/Workspace.vue`
- Delete: `frontend/src/components/WorkspaceTabs.vue`

- [ ] **Step 1: Delete old files**

```bash
rm frontend/src/stores/workspaceStore.ts
rm frontend/src/components/Workspace.vue
rm frontend/src/components/WorkspaceTabs.vue
```

- [ ] **Step 2: Clean up unused imports**

Search for any remaining references to `workspaceStore` or the deleted components:

```bash
cd frontend && grep -r "workspaceStore" src/ --include="*.ts" --include="*.vue" 2>/dev/null
cd frontend && grep -r "WorkspaceTabs\|from.*Workspace\.vue" src/ --include="*.ts" --include="*.vue" 2>/dev/null
```

Expected: No results (all references should have been migrated).

---

### Task 14: Build and Verify

**Files:**
- No specific files, verification step

- [ ] **Step 1: Clean frontend cache and build**

```bash
cd frontend && rm -rf dist node_modules/.vite && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Launch wails dev**

```bash
cd .. && wails dev
```

Expected: App launches. Verify the following manually:

1. Double-click a connection → creates a TerminalTab, terminal renders full-screen
2. Click Settings → creates a SettingsTab, settings page renders
3. Click a TerminalTab → it activates and shows the terminal
4. Click a SettingsTab → it activates and shows settings
5. Close a tab → it closes and the next tab activates
6. Drag a TerminalTab to another TerminalTab's content → merge into WorkspaceTab with drop zone overlay
7. Drag a TerminalTab into a WorkspaceTab's panel → merge with drop zone overlay
8. Drag a Workspace panel header to the tab bar → detach as TerminalTab
9. Drag panel within workspace → reposition with drop zone overlay
10. AI lock button appears on TerminalTab (hover) and on workspace panel headers
11. Right-click tab → context menu (Close, Close Other, Close Right, Close Left, Rename)
12. Right-click terminal → context menu (Copy, Copy & Paste, Paste, Ask AI)
13. Settings tab cannot be dragged into a workspace

- [ ] **Step 3: Fix any issues found during manual testing**

Common issues to watch for:
- Panel not rendering (check panelStore.getPanel returns the panel)
- Terminal half-screen (check CSS height chain: tab-content → panel → panel-terminal → xterm)
- Drag not working (check dataTransfer types match between dragstart and dragover handlers)
- AI lock not working (check agent.ts getActivePanel uses tabStore)

---
