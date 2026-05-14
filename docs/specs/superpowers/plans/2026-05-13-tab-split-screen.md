# Tab Split Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement VSCode-style drag-to-split for terminal tabs with four-direction edge snapping, cross-pane tab movement, proportional resize, and AI lock per tab.

**Architecture:** Recursive `SplitNode` binary tree with `ratio`-based sizing. All operations go through `tabStore`. `SplitOverlay` handles edge snapping. `TabItem` gains an AI lock button.

**Tech Stack:** Vue 3 + Pinia + TypeScript, no new dependencies

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/types/session.ts` | Modify | Add `ratio` to SplitNode, `aiLocked` to Tab |
| `frontend/src/stores/tabStore.ts` | Rewrite | All split + AI lock operations |
| `frontend/src/components/SplitContainer.vue` | Rewrite | Recursive tree renderer + resize handles |
| `frontend/src/components/SplitOverlay.vue` | Create | Four-direction edge snap overlay |
| `frontend/src/components/TabItem.vue` | Modify | AI lock button, enhanced dragstart |
| `frontend/src/components/TabBar.vue` | Modify | Accept external tab drops |
| `frontend/src/services/terminalAgent.ts` | Modify | Use AI-locked tab for command execution |

---

### Task 1: Update Type Definitions

**Files:**
- Modify: `frontend/src/types/session.ts`

Add `ratio` to `SplitNode` and `aiLocked` to `Tab`.

- [ ] **Step 1: Add new fields**

```typescript
export interface Tab {
  id: string
  sessionId: string
  title: string
  type: 'ssh' | 'settings'
  groupId?: string
  config?: ConnectionConfig
  aiLocked?: boolean
}

export interface SplitNode {
  id: string
  direction: 'horizontal' | 'vertical' | null
  children: SplitNode[]
  tabGroupId?: string
  ratio: number   // proportion in parent (0-1), default 0.5
}
```

---

### Task 2: Rewrite tabStore with Split + AI Lock Operations

**Files:**
- Modify: `frontend/src/stores/tabStore.ts`

Replace the existing `splitTab` and `removeTabFromSplit` with a complete set of split tree operations. Add `draggingTabId` ref and `toggleAILock`.

- [ ] **Step 1: Rewrite tabStore**

```typescript
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

  // ── Tab basics ──

  function addTab(tab: Tab, groupId: string = 'default') {
    tab.groupId = groupId
    tabs.value.push(tab)
    activeTabId.value = tab.id
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
      activeTabId.value = sameGroupTabs.length > 0
        ? sameGroupTabs[0].id
        : (tabs.value.length > 0 ? tabs.value[0].id : null)
    }
    if (groupId && !tabs.value.some(t => t.groupId === groupId)) {
      removeEmptyGroup(splitRoot.value, groupId)
    }
  }

  function setActiveTab(tabId: string) {
    activeTabId.value = tabId
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
      // Unlock any other locked tab
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

    if (sourceGroupId && !tabs.value.some(t => t.groupId === sourceGroupId)) {
      removeEmptyGroup(splitRoot.value, sourceGroupId)
    }
  }

  // ── Split tree: create split via edge drag ──

  function createSplit(
    tabId: string,
    direction: 'horizontal' | 'vertical',
    edge: 'top' | 'bottom' | 'left' | 'right'
  ) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab) return

    const sourceGroupId = tab.groupId || 'default'
    const newGroupId = `group-${Date.now()}`

    // Move tab to new group
    tab.groupId = newGroupId
    activeTabId.value = tabId

    // Find leaf node with sourceGroupId and replace with split
    function replace(node: SplitNode): boolean {
      if (!node.direction && node.tabGroupId === sourceGroupId) {
        const existingLeaf = { ...node }

        const newLeaf = newNode({ tabGroupId: newGroupId, ratio: 0.5 })
        existingLeaf.ratio = 0.5

        node.direction = direction
        node.tabGroupId = undefined

        // Edge determines child order
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
  }

  // ── Split tree: remove empty group ──

  function removeEmptyGroup(node: SplitNode, targetGroupId: string): boolean {
    // Leaf: remove if matches
    if (!node.direction) {
      if (node.tabGroupId === targetGroupId && node.id !== 'root') {
        return false // signal removal to parent
      }
      return true
    }

    // Split node: filter children
    node.children = node.children.filter(child =>
      removeEmptyGroup(child, targetGroupId)
    )

    // Collapse: one child left → replace self with child
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
```

---

### Task 3: Rewrite SplitContainer.vue

**Files:**
- Rewrite: `frontend/src/components/SplitContainer.vue`

Recursive renderer with flex-based ratio sizing, resize handles, and SplitOverlay integration.

- [ ] **Step 1: Implement resizable split container**

```vue
<template>
  <div
    ref="el"
    class="split-container"
    :class="{ 'horizontal': node.direction === 'horizontal', 'vertical': node.direction === 'vertical' }"
  >
    <template v-if="node.direction">
      <div class="split-child" :style="{ flex: children[0].ratio }">
        <SplitContainer :node="children[0]" />
      </div>
      <div
        class="split-handle"
        :class="{ 'handle-h': node.direction === 'horizontal', 'handle-v': node.direction === 'vertical' }"
        @mousedown="onResizeStart($event, node.id, children[0].ratio)"
      />
      <div class="split-child" :style="{ flex: children[1].ratio }">
        <SplitContainer :node="children[1]" />
      </div>
    </template>
    <template v-else>
      <TabGroup :group-id="node.tabGroupId || 'default'" />
      <SplitOverlay :container-el="el" :node-id="node.id" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SplitNode } from '../types/session'
import { useTabStore } from '../stores/tabStore'
import TabGroup from './TabGroup.vue'
import SplitOverlay from './SplitOverlay.vue'

const props = defineProps<{ node: SplitNode }>()
const tabStore = useTabStore()
const el = ref<HTMLDivElement>()

const children = computed(() => props.node.children)

function onResizeStart(e: MouseEvent, parentId: string, startRatio: number) {
  const container = (e.currentTarget as HTMLElement).parentElement
  if (!container) return

  e.preventDefault()
  const isHorizontal = props.node.direction === 'horizontal'
  const startPos = isHorizontal ? e.clientX : e.clientY
  const containerSize = isHorizontal ? container.offsetWidth : container.offsetHeight

  function onMove(ev: MouseEvent) {
    const delta = isHorizontal ? (ev.clientX - startPos) : (ev.clientY - startPos)
    const deltaRatio = delta / containerSize
    const newRatio = startRatio + deltaRatio
    tabStore.resizePane(parentId, [newRatio, 1 - newRatio])
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>

<style scoped>
.split-container {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
}

.split-container.horizontal {
  flex-direction: row;
}

.split-container.vertical {
  flex-direction: column;
}

.split-container > .split-container {
  flex: 1;
}

.split-child {
  overflow: hidden;
  display: flex;
}

.split-handle {
  flex-shrink: 0;
  z-index: 10;
  background: transparent;
  transition: background 0.15s;
  position: relative;
}

.split-handle:hover {
  background: var(--accent);
}

.handle-h {
  width: 4px;
  cursor: col-resize;
}

.handle-v {
  height: 4px;
  cursor: row-resize;
}
</style>
```

---

### Task 4: Create SplitOverlay.vue

**Files:**
- Create: `frontend/src/components/SplitOverlay.vue`

Four edge drop zones with green translucent preview. Only active when `draggingTabId` is set.

- [ ] **Step 1: Implement overlay component**

```vue
<template>
  <div v-if="tabStore.draggingTabId" class="split-overlay">
    <div
      class="edge-zone top"
      :class="{ active: activeZone === 'top' }"
      @dragover.prevent="onEdgeOver('top')"
      @dragleave="onEdgeLeave"
      @drop.prevent="onDrop('top')"
    />
    <div
      class="edge-zone bottom"
      :class="{ active: activeZone === 'bottom' }"
      @dragover.prevent="onEdgeOver('bottom')"
      @dragleave="onEdgeLeave"
      @drop.prevent="onDrop('bottom')"
    />
    <div
      class="edge-zone left"
      :class="{ active: activeZone === 'left' }"
      @dragover.prevent="onEdgeOver('left')"
      @dragleave="onEdgeLeave"
      @drop.prevent="onDrop('left')"
    />
    <div
      class="edge-zone right"
      :class="{ active: activeZone === 'right' }"
      @dragover.prevent="onEdgeOver('right')"
      @dragleave="onEdgeLeave"
      @drop.prevent="onDrop('right')"
    />
    <div
      class="center-zone"
      @dragover.prevent="onCenterOver"
      @drop.prevent="onCenterDrop"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useTabStore } from '../stores/tabStore'

const tabStore = useTabStore()
const activeZone = ref<string | null>(null)

function onEdgeOver(zone: string) {
  activeZone.value = zone
}

function onEdgeLeave() {
  activeZone.value = null
}

function getDirection(edge: string): 'horizontal' | 'vertical' {
  return (edge === 'left' || edge === 'right') ? 'horizontal' : 'vertical'
}

function onDrop(edge: string) {
  const tabId = tabStore.draggingTabId
  if (!tabId) return
  tabStore.createSplit(tabId, getDirection(edge), edge as any)
  tabStore.draggingTabId = null
  activeZone.value = null
}

function onCenterOver() {
  activeZone.value = null
}

function onCenterDrop() {
  // Drop in center = move tab to this group (handled by TabBar drop)
  // The overlay doesn't handle this directly
}

const props = defineProps<{
  containerEl?: HTMLDivElement | null
  nodeId: string
}>()
</script>

<style scoped>
.split-overlay {
  position: absolute;
  inset: 0;
  pointer-events: all;
  z-index: 100;
}

.edge-zone {
  position: absolute;
  z-index: 101;
  transition: background 0.15s;
  border-radius: 0;
}

.edge-zone.top {
  top: 0;
  left: 0;
  right: 0;
  height: 50px;
}

.edge-zone.bottom {
  bottom: 0;
  left: 0;
  right: 0;
  height: 50px;
}

.edge-zone.left {
  top: 50px;
  bottom: 50px;
  left: 0;
  width: 50px;
}

.edge-zone.right {
  top: 50px;
  bottom: 50px;
  right: 0;
  width: 50px;
}

.edge-zone.active {
  background: rgba(52, 211, 153, 0.18);
  border: 2px solid rgba(52, 211, 153, 0.5);
}

.center-zone {
  position: absolute;
  top: 50px;
  left: 50px;
  right: 50px;
  bottom: 50px;
  z-index: 100;
}
</style>
```

---

### Task 5: Enhance TabItem.vue with AI Lock

**Files:**
- Modify: `frontend/src/components/TabItem.vue`

Add AI lock button (visible on hover, always visible when locked). Enhance `dragstart`.

- [ ] **Step 1: Add AI lock button and enhanced drag**

Replace the template section to add the lock button next to the close button:

```vue
<template>
  <div
    class="tab-item"
    :class="{ active: isActive, error: status === 'error', 'ai-locked': aiLocked }"
    draggable="true"
    @click="$emit('activate')"
    @dragstart="onDragStart"
    @dragend="$emit('dragend')"
    @contextmenu="onContextMenu"
  >
    <span class="tab-title">{{ title }}</span>
    <button
      v-if="type === 'ssh'"
      class="tab-lock"
      :class="{ locked: aiLocked }"
      @click.stop="onToggleLock"
      :title="aiLocked ? 'AI已锁定到此终端' : '锁定AI到此终端'"
    >
      <el-icon><Lock v-if="aiLocked" /><Unlock v-else /></el-icon>
    </button>
    <button class="tab-close" @click.stop="$emit('close')">
      <el-icon><Close /></el-icon>
    </button>
    <!-- ... context menu unchanged ... -->
  </div>
</template>
```

Add to script:

```typescript
import { Lock, Unlock } from '@element-plus/icons-vue'
import { useTabStore } from '../stores/tabStore'

const tabStore = useTabStore()

const props = defineProps<{
  title: string
  isActive: boolean
  status: SessionStatus
  tabId: string
  type: 'ssh' | 'settings'
  aiLocked: boolean
}>()

function onDragStart(e: DragEvent) {
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', props.tabId)
    e.dataTransfer.effectAllowed = 'move'
  }
  tabStore.draggingTabId = props.tabId
  emit('dragstart', props.tabId)
}

function onToggleLock() {
  tabStore.toggleAILock(props.tabId)
}
```

Add CSS for locked tab highlight (in `<style scoped>`, a golden accent):

```css
.tab-item.ai-locked {
  box-shadow: inset 3px 0 0 var(--warning, #f59e0b);
}

.tab-item.ai-locked .tab-lock {
  opacity: 1;
  color: var(--warning, #f59e0b);
}

.tab-lock {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: var(--text-disabled);
  cursor: pointer;
  opacity: 0;
  transition: all 0.1s ease;
}

.tab-item:hover .tab-lock {
  opacity: 0.6;
}

.tab-lock:hover {
  opacity: 1 !important;
  color: var(--text-primary);
}
```

---

### Task 6: Enhance TabBar.vue for External Drops

**Files:**
- Modify: `frontend/src/components/TabBar.vue`

Accept tab drops from other groups. When a tab is dropped on the bar area, call `store.moveTab()`.

- [ ] **Step 1: Update onDrop to handle external tabs**

In the existing `onDrop` function, before the within-group reorder logic, handle the cross-group case:

```typescript
function onDrop(e: DragEvent) {
  e.preventDefault()
  const tabId = e.dataTransfer?.getData('text/plain')
  if (!tabId) {
    dropTargetIndex.value = -1
    return
  }

  const tab = tabStore.tabs.find(t => t.id === tabId)
  if (!tab) {
    dropTargetIndex.value = -1
    return
  }

  // Cross-group move: just change groupId, tree cleanup handles the rest
  if (tab.groupId !== props.groupId) {
    tabStore.moveTab(tabId, props.groupId)
    dropTargetIndex.value = -1
    return
  }

  // Within-group reorder (existing logic unchanged)
  // ...
}
```

Also update `onDragEnd` to also clear `tabStore.draggingTabId`:

```typescript
function onDragEnd() {
  tabStore.draggingTabId = null
  draggingId.value = null
  dropTargetIndex.value = -1
}
```

---

### Task 7: Update terminalAgent.ts for AI Lock

**Files:**
- Modify: `frontend/src/services/terminalAgent.ts`

Check for AI-locked tab before using active tab's session.

- [ ] **Step 1: Use locked tab when available**

In `executeCommand()`, replace the sessionId lookup:

```typescript
export async function executeCommand(command: string): Promise<ExecuteResult> {
  const tabStore = useTabStore()

  // Check for AI-locked tab first
  const lockedTab = tabStore.getAILockedTab()
  const sessionId = lockedTab?.sessionId || tabStore.activeTab?.sessionId

  if (!sessionId) throw new Error('No active terminal session')

  // ... rest of function unchanged ...
}
```

---

## Verification

1. **Build check:** Run `cd frontend && npx vite build` — should compile without errors.
2. **Wails dev:** Run `wails dev` — app should start with the new split system.
3. **UI tests:**
   - Drag a tab to the right edge → new horizontal split appears
   - Drag a tab to the bottom edge → new vertical split appears
   - Drag a tab from one pane to another's tab bar → tab moves
   - Drag the resize handle between panes → proportional resize
   - Close last tab in a pane → pane collapses, sibling expands
   - Click AI lock on a tab → golden highlight, lock icon visible
   - Click AI lock again → unlock, AI returns to active tab
4. **AI integration:** With a tab locked, send AI a command → verify it runs in the locked tab's terminal.
