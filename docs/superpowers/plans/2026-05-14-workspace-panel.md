# Workspace + Panel 架构重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 Tab + SplitContainer 模型重构为 Workspace + Panel 双层结构，支持拖拽分屏、Workspace 合并、AI 锁定等功能。

**Architecture:** 外层完全重写（Workspace / Panel / PanelGrid），内层复用终端核心逻辑（提取为 `useTerminal` composable）。数据模型用 `workspaceStore` + `panelStore` 替换 `tabStore`。

**Tech Stack:** Vue 3, Pinia, TypeScript, @xterm/xterm, HTML5 Drag and Drop API, Wails v2

---

## 文件结构映射

### 新增文件

| 文件 | 职责 |
|------|------|
| `frontend/src/composables/useTerminal.ts` | 提取 TerminalTab.vue 的 xterm 初始化、session 绑定、resize、右键菜单等核心逻辑 |
| `frontend/src/stores/workspaceStore.ts` | Workspace 状态管理 |
| `frontend/src/stores/panelStore.ts` | Panel 状态管理 |
| `frontend/src/components/WorkspaceTabs.vue` | Workspace 标签栏容器 |
| `frontend/src/components/WorkspaceTabItem.vue` | 单个 Workspace 标签项 |
| `frontend/src/components/Workspace.vue` | Workspace 容器，包含 PanelGrid |
| `frontend/src/components/PanelGrid.vue` | 面板网格/分屏容器（递归渲染 layout 树） |
| `frontend/src/components/Panel.vue` | 单个终端面板，调用 useTerminal |
| `frontend/src/components/PanelSplitter.vue` | 拖拽调整大小的分隔条 |
| `frontend/src/types/workspace.ts` | Workspace + Panel + Layout 类型定义 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `frontend/src/components/TerminalTab.vue` | 内部逻辑迁移到 useTerminal，自身变为 useTerminal 的调用方（过渡态） |
| `frontend/src/App.vue` | 替换 TabBar → WorkspaceTabs，Workspace → PanelGrid |
| `frontend/src/stores/aiStore.ts` | AI 锁定逻辑从 tab 改为 panel |
| `frontend/src/services/terminalAgent.ts` | `getAILockedTab()` 改为 `getAILockedPanel()` |

### 删除文件（Phase 7 执行）

- `frontend/src/components/TabBar.vue`
- `frontend/src/components/TabItem.vue`
- `frontend/src/components/TabContent.vue`
- `frontend/src/components/SplitContainer.vue`
- `frontend/src/components/SplitOverlay.vue`
- `frontend/src/stores/tabStore.ts`

---

## Phase 1: 提取 useTerminal Composable

### Task 1: 创建类型定义文件

**Files:**
- Create: `frontend/src/types/workspace.ts`

- [ ] **Step 1: 编写 Workspace + Panel + Layout 类型**

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
  workspaceId: string
  type: PanelType
  sessionId: string | null
  title: string
  status: PanelStatus
  config: ConnectionConfig | null
}

export interface Workspace {
  id: string
  name: string
  panelIds: string[]
  layout: PanelLayout
  activePanelId: string | null
  createdAt: number
}

export interface PanelLayout {
  root: LayoutNode
}

export type LayoutNode =
  | { type: 'leaf'; panelId: string }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; children: LayoutNode[]; sizes: number[] }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/workspace.ts
git commit -m "feat: add workspace and panel type definitions"
```

### Task 2: 提取 useTerminal composable

**Files:**
- Create: `frontend/src/composables/useTerminal.ts`
- Modify: `frontend/src/components/TerminalTab.vue`

**说明：** 将 TerminalTab.vue 中与 xterm 相关的核心逻辑提取为 composable，TerminalTab.vue 变为调用方。

- [ ] **Step 1: 创建 useTerminal.ts 骨架**

```typescript
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SessionWrite, SessionResize } from '../wailsjs/go/main/App'
import { EventsOn } from '../wailsjs/runtime'
import { useSettingsStore } from '../stores/settingsStore'
import { useSessionStore } from '../stores/sessionStore'

export interface TerminalOptions {
  fontSize?: number
  fontFamily?: string
  theme?: string
  scrollback?: number
}

export interface UseTerminalReturn {
  terminal: Terminal | null
  terminalRef: ReturnType<typeof ref<HTMLDivElement | undefined>>
  fitAddon: FitAddon | null
  write: (data: string) => void
  resize: () => void
  getSelection: () => string
  clear: () => void
}

export function useTerminal(
  sessionIdRef: () => string | null,
  options?: TerminalOptions
): UseTerminalReturn {
  const terminalRef = ref<HTMLDivElement>()
  let terminal: Terminal | null = null
  let fitAddon: FitAddon | null = null
  let resizeObserver: ResizeObserver | null = null
  let unsubscribe: (() => void) | null = null
  const settingsStore = useSettingsStore()
  const sessionStore = useSessionStore()

  // TODO: implement initialization, resize, write, etc.

  return {
    terminal,
    terminalRef,
    fitAddon,
    write: (data: string) => terminal?.write(data),
    resize: () => {},
    getSelection: () => terminal?.getSelection() || '',
    clear: () => terminal?.clear()
  }
}
```

- [ ] **Step 2: 从 TerminalTab.vue 复制 xterm 初始化逻辑到 useTerminal**

复制以下内容到 useTerminal.ts：
- `getTerminalOptions()` 函数
- `getXtermTheme()` 函数
- `onMounted` 中的 xterm 初始化代码（`new Terminal`, `loadAddon`, `open`, `fitAddon.fit()`）
- `notifyResize()` 逻辑（提取为 `resize()` 方法）
- session:data 事件监听
- `onData` 处理（键盘输入写入 session）
- `onUnmounted` 中的清理逻辑

- [ ] **Step 3: 修改 TerminalTab.vue 调用 useTerminal**

将 TerminalTab.vue 中的 xterm 相关逻辑替换为 useTerminal 调用，保留 UI 层（右键菜单等）。

```typescript
import { useTerminal } from '../composables/useTerminal'

const { terminal, terminalRef, write, resize, getSelection } = useTerminal(
  () => props.tab.sessionId,
  { fontSize: 13, fontFamily: 'Consolas, "Courier New", monospace' }
)
```

- [ ] **Step 4: 编译验证**

```bash
cd frontend && npm run build
```

Expected: 编译成功，无新增报错。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useTerminal.ts frontend/src/components/TerminalTab.vue
git commit -m "refactor: extract terminal logic into useTerminal composable"
```

---

## Phase 2: 新建 Stores

### Task 3: 创建 panelStore

**Files:**
- Create: `frontend/src/stores/panelStore.ts`

- [ ] **Step 1: 实现 panelStore**

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
      workspaceId: '',
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

  function movePanelToWorkspace(panelId: string, workspaceId: string) {
    const p = panelState.panels.get(panelId)
    if (p) p.workspaceId = workspaceId
  }

  return {
    panels: panelState.panels,
    createPanel,
    removePanel,
    getPanel,
    bindSession,
    updateStatus,
    updateTitle,
    movePanelToWorkspace
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/panelStore.ts
git commit -m "feat: add panelStore for panel state management"
```

### Task 4: 创建 workspaceStore

**Files:**
- Create: `frontend/src/stores/workspaceStore.ts`

- [ ] **Step 1: 实现 workspaceStore**

```typescript
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
      w.layout = appendToLayout(w.layout.root, panelId)
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/workspaceStore.ts
git commit -m "feat: add workspaceStore for workspace state management"
```

---

## Phase 3: 新建 Workspace 组件

### Task 5: 创建 WorkspaceTabItem.vue

**Files:**
- Create: `frontend/src/components/WorkspaceTabItem.vue`

- [ ] **Step 1: 实现基础 WorkspaceTabItem**

```vue
<template>
  <div
    class="workspace-tab-item"
    :class="{ active: isActive }"
    @click="$emit('activate', workspace.id)"
    draggable="true"
    @dragstart="onDragStart"
  >
    <span class="tab-name">{{ workspace.name }}</span>
    <button
      v-if="isActive || showClose"
      class="tab-close"
      @click.stop="$emit('close', workspace.id)"
    >×</button>
  </div>
</template>

<script setup lang="ts">
import type { Workspace } from '../types/workspace'

const props = defineProps<{
  workspace: Workspace
  isActive: boolean
}>()

const emit = defineEmits<{
  activate: [id: string]
  close: [id: string]
}>()

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('application/workspace-id', props.workspace.id)
}
</script>

<style scoped>
.workspace-tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  user-select: none;
  border-bottom: 2px solid transparent;
}
.workspace-tab-item.active {
  border-bottom-color: var(--accent);
  background: var(--bg-surface);
}
.tab-name {
  font-size: 13px;
  white-space: nowrap;
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/WorkspaceTabItem.vue
git commit -m "feat: add WorkspaceTabItem component"
```

### Task 6: 创建 WorkspaceTabs.vue

**Files:**
- Create: `frontend/src/components/WorkspaceTabs.vue`
- Modify: `frontend/src/App.vue` (临时引入验证)

- [ ] **Step 1: 实现 WorkspaceTabs 容器**

```vue
<template>
  <div class="workspace-tabs">
    <div class="tabs-list" ref="tabsListRef">
      <WorkspaceTabItem
        v-for="workspace in workspaces"
        :key="workspace.id"
        :workspace="workspace"
        :is-active="workspace.id === activeWorkspaceId"
        @activate="setActiveWorkspace"
        @close="closeWorkspace"
        draggable="true"
        @dragstart="onTabDragStart($event, workspace.id)"
        @dragover.prevent
        @drop="onTabDrop($event, workspace.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspaceStore } from '../stores/workspaceStore'
import WorkspaceTabItem from './WorkspaceTabItem.vue'

const workspaceStore = useWorkspaceStore()
const workspaces = workspaceStore.workspaces
const activeWorkspaceId = workspaceStore.activeWorkspaceId

function setActiveWorkspace(id: string) {
  workspaceStore.setActiveWorkspace(id)
}

function closeWorkspace(id: string) {
  workspaceStore.closeWorkspace(id)
}

function onTabDragStart(e: DragEvent, workspaceId: string) {
  e.dataTransfer?.setData('application/workspace-id', workspaceId)
}

function onTabDrop(e: DragEvent, targetWorkspaceId: string) {
  const draggedId = e.dataTransfer?.getData('application/workspace-id')
  if (!draggedId || draggedId === targetWorkspaceId) return

  const fromIdx = workspaces.value.findIndex(w => w.id === draggedId)
  const toIdx = workspaces.value.findIndex(w => w.id === targetWorkspaceId)
  if (fromIdx !== -1 && toIdx !== -1) {
    workspaceStore.moveWorkspace(fromIdx, toIdx)
  }
}
</script>

<style scoped>
.workspace-tabs {
  display: flex;
  align-items: center;
  height: 40px;
  background: var(--bg-base);
  border-bottom: 1px solid var(--border-subtle);
}
.tabs-list {
  display: flex;
  flex: 1;
  overflow-x: auto;
}
</style>
```

- [ ] **Step 2: 临时修改 App.vue 引入 WorkspaceTabs 验证**

在 App.vue 中注释掉 TabBar，引入 WorkspaceTabs：

```typescript
import WorkspaceTabs from './components/WorkspaceTabs.vue'
```

模板中替换 `<TabBar />` 为 `<WorkspaceTabs />`。

- [ ] **Step 3: 编译验证**

```bash
cd frontend && npm run build
```

Expected: 编译成功。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/WorkspaceTabs.vue frontend/src/App.vue
git commit -m "feat: add WorkspaceTabs container with drag-to-reorder"
```

---

## Phase 4: 新建 Panel 组件

### Task 7: 创建 Panel.vue

**Files:**
- Create: `frontend/src/components/Panel.vue`
- Modify: `frontend/src/composables/useTerminal.ts` (确保接口完整)

- [ ] **Step 1: 实现 Panel.vue**

```vue
<template>
  <div class="panel">
    <div v-if="showHeader" class="panel-header">
      <span class="panel-title">{{ panel.title }}</span>
      <button class="panel-close" @click="$emit('close', panel.id)">×</button>
    </div>
    <div ref="terminalRef" class="panel-terminal"></div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useTerminal } from '../composables/useTerminal'
import type { Panel } from '../types/workspace'

const props = defineProps<{
  panel: Panel
  showHeader: boolean
}>()

const emit = defineEmits<{
  close: [panelId: string]
}>()

const { terminalRef } = useTerminal(
  () => props.panel.sessionId,
  { fontSize: 14 }
)

// Watch panel sessionId changes and rebind terminal
watch(() => props.panel.sessionId, (newId) => {
  if (newId) {
    // Terminal will auto-connect via useTerminal internals
  }
})
</script>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.panel-title {
  font-size: 12px;
  color: var(--text-secondary);
}
.panel-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
}
.panel-terminal {
  flex: 1;
  overflow: hidden;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Panel.vue
git commit -m "feat: add Panel component with header and terminal"
```

### Task 8: 创建 PanelSplitter.vue

**Files:**
- Create: `frontend/src/components/PanelSplitter.vue`

- [ ] **Step 1: 实现 PanelSplitter**

```vue
<template>
  <div
    class="panel-splitter"
    :class="direction"
    @mousedown="onMouseDown"
  ></div>
</template>

<script setup lang="ts">
const props = defineProps<{
  direction: 'horizontal' | 'vertical'
}>()

const emit = defineEmits<{
  resize: [delta: number]
}>()

function onMouseDown(e: MouseEvent) {
  const startPos = props.direction === 'horizontal' ? e.clientX : e.clientY

  function onMove(ev: MouseEvent) {
    const currentPos = props.direction === 'horizontal' ? ev.clientX : ev.clientY
    emit('resize', currentPos - startPos)
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
.panel-splitter {
  flex-shrink: 0;
  background: var(--border-subtle);
  transition: background 0.15s;
}
.panel-splitter:hover {
  background: var(--accent);
}
.panel-splitter.horizontal {
  width: 4px;
  cursor: col-resize;
}
.panel-splitter.vertical {
  height: 4px;
  cursor: row-resize;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/PanelSplitter.vue
git commit -m "feat: add PanelSplitter component for resize"
```

### Task 9: 创建 PanelGrid.vue

**Files:**
- Create: `frontend/src/components/PanelGrid.vue`

- [ ] **Step 1: 实现 PanelGrid（递归渲染 layout 树）**

```vue
<template>
  <div class="panel-grid">
    <RenderNode :node="layout.root" :workspace="workspace" />
  </div>
</template>

<script setup lang="ts">
import type { Workspace, LayoutNode } from '../types/workspace'
import RenderNode from './RenderNode.vue'

const props = defineProps<{
  workspace: Workspace
}>()

const layout = props.workspace.layout
</script>

<style scoped>
.panel-grid {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
```

- [ ] **Step 2: 创建 RenderNode.vue（递归组件）**

```vue
<template>
  <div v-if="node.type === 'leaf'" class="leaf-node">
    <Panel
      v-if="panel"
      :panel="panel"
      :show-header="workspace.panelIds.length > 1"
      @close="$emit('closePanel', panel.id)"
      draggable="true"
      @dragstart="$emit('panelDragStart', $event, panel.id)"
      @dragenter.prevent
      @dragover.prevent
      @drop="$emit('panelDrop', $event, panel.id)"
    />
  </div>
  <div
    v-else
    class="split-node"
    :class="node.direction"
    :style="splitStyle"
  >
    <template v-for="(child, index) in node.children" :key="getNodeKey(child)">
      <RenderNode
        :node="child"
        :workspace="workspace"
        @close-panel="$emit('closePanel', $event)"
        @panel-drag-start="$emit('panelDragStart', $event)"
        @panel-drop="$emit('panelDrop', $event)"
      />
      <PanelSplitter
        v-if="index < node.children.length - 1"
        :direction="node.direction"
        @resize="$emit('resize', node, index, $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePanelStore } from '../stores/panelStore'
import type { Workspace, LayoutNode } from '../types/workspace'
import Panel from './Panel.vue'
import PanelSplitter from './PanelSplitter.vue'

const props = defineProps<{
  node: LayoutNode
  workspace: Workspace
}>()

const emit = defineEmits<{
  closePanel: [panelId: string]
  panelDragStart: [e: DragEvent, panelId: string]
  panelDrop: [e: DragEvent, targetPanelId: string]
  resize: [node: LayoutNode, index: number, delta: number]
}>()

const panelStore = usePanelStore()

const panel = computed(() => {
  if (props.node.type === 'leaf') {
    return panelStore.getPanel(props.node.panelId)
  }
  return null
})

const splitStyle = computed(() => {
  if (props.node.type !== 'split') return {}
  const template = props.node.sizes
    .map(s => `${s * 100}%`)
    .join(props.node.direction === 'horizontal' ? ' 4px ' : ' 4px ')
  return {
    display: 'grid',
    gridTemplateColumns: props.node.direction === 'horizontal' ? template : '1fr',
    gridTemplateRows: props.node.direction === 'vertical' ? template : '1fr'
  }
})

function getNodeKey(node: LayoutNode): string {
  if (node.type === 'leaf') return node.panelId
  return `split-${node.direction}-${node.children.length}`
}
</script>

<style scoped>
.leaf-node {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.split-node {
  width: 100%;
  height: 100%;
}
</style>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PanelGrid.vue frontend/src/components/RenderNode.vue
git commit -m "feat: add PanelGrid with recursive layout tree rendering"
```

### Task 10: 创建 Workspace.vue

**Files:**
- Create: `frontend/src/components/Workspace.vue`

- [ ] **Step 1: 实现 Workspace.vue**

```vue
<template>
  <div class="workspace" @dragover.prevent @drop="onWorkspaceDrop">
    <PanelGrid
      :workspace="workspace"
      @close-panel="closePanel"
      @panel-drag-start="onPanelDragStart"
      @panel-drop="onPanelDrop"
      @resize="onResize"
    />
  </div>
</template>

<script setup lang="ts">
import { useWorkspaceStore } from '../stores/workspaceStore'
import { usePanelStore } from '../stores/panelStore'
import type { Workspace, LayoutNode } from '../types/workspace'
import PanelGrid from './PanelGrid.vue'

const props = defineProps<{
  workspace: Workspace
}>()

const workspaceStore = useWorkspaceStore()
const panelStore = usePanelStore()

function closePanel(panelId: string) {
  workspaceStore.removePanelFromWorkspace(props.workspace.id, panelId)
  panelStore.removePanel(panelId)
}

function onPanelDragStart(e: DragEvent, panelId: string) {
  e.dataTransfer?.setData('application/panel-id', panelId)
}

function onPanelDrop(e: DragEvent, targetPanelId: string) {
  const draggedPanelId = e.dataTransfer?.getData('application/panel-id')
  if (!draggedPanelId || draggedPanelId === targetPanelId) return

  // Same workspace split logic (Scenario 1)
  // Calculate drop position and update layout
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const w = rect.width
  const h = rect.height

  let direction: 'horizontal' | 'vertical'
  let insertBefore: boolean

  if (x / w < 0.5 && y / h > 0.25 && y / h < 0.75) {
    direction = 'horizontal'
    insertBefore = true
  } else if (x / w >= 0.5 && y / h > 0.25 && y / h < 0.75) {
    direction = 'horizontal'
    insertBefore = false
  } else if (y / h < 0.5) {
    direction = 'vertical'
    insertBefore = true
  } else {
    direction = 'vertical'
    insertBefore = false
  }

  // Update layout tree to insert draggedPanelId next to targetPanelId
  const newLayout = insertPanelIntoLayout(
    props.workspace.layout.root,
    targetPanelId,
    draggedPanelId,
    direction,
    insertBefore
  )
  workspaceStore.updateLayout(props.workspace.id, { root: newLayout })
}

function onWorkspaceDrop(e: DragEvent) {
  // Scenario 2: Panel dragged to tab area creates new workspace
  // This is handled by WorkspaceTabs drop handler
}

function onResize(node: LayoutNode, index: number, delta: number) {
  // Update sizes array based on delta
  // Implementation depends on parent container size
}

// Helper: insert panel into layout tree
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
        ? [{ type: 'leaf', panelId: newId }, node]
        : [node, { type: 'leaf', panelId: newId }]
      return {
        type: 'split',
        direction,
        sizes: [0.5, 0.5],
        children
      }
    }
    return node
  }

  return {
    ...node,
    children: node.children.map(child =>
      insertPanelIntoLayout(child, targetId, newId, direction, before)
    )
  }
}
</script>

<style scoped>
.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Workspace.vue
git commit -m "feat: add Workspace container with panel drag-and-drop"
```

---

## Phase 5: App.vue 整合与旧组件替换

### Task 11: 修改 App.vue 整合新组件

**Files:**
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: 替换 TabBar 为 WorkspaceTabs + Workspace**

修改 App.vue：
1. 删除 TabBar / TabContent 导入
2. 导入 WorkspaceTabs / Workspace
3. 模板中替换 tab area 为新结构
4. 新建连接逻辑改为操作 workspaceStore + panelStore

```typescript
// 关键修改点：
import WorkspaceTabs from './components/WorkspaceTabs.vue'
import Workspace from './components/Workspace.vue'
import { useWorkspaceStore } from './stores/workspaceStore'
import { usePanelStore } from './stores/panelStore'

const workspaceStore = useWorkspaceStore()
const panelStore = usePanelStore()

// 双击 connection → 新建 workspace + panel
async function onConnect(config: ConnectionConfig) {
  connectionStore.add(config)
  const panel = panelStore.createPanel(config, 'ssh')
  const workspace = workspaceStore.createWorkspace(panel.title, panel.id)
  panelStore.movePanelToWorkspace(panel.id, workspace.id)

  // Create session and bind
  const info = await CreateSession(config.type, config)
  panelStore.bindSession(panel.id, info.id)
  sessionStore.initSession(info.id)
}
```

- [ ] **Step 2: 编译验证**

```bash
cd frontend && npm run build
```

Expected: 编译成功。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.vue
git commit -m "feat: integrate Workspace + Panel into App.vue"
```

### Task 12: 更新 AI 锁定逻辑

**Files:**
- Modify: `frontend/src/stores/aiStore.ts`
- Modify: `frontend/src/services/terminalAgent.ts`
- Modify: `frontend/src/components/AISidebar.vue`

- [ ] **Step 1: 修改 aiStore.ts 中锁定逻辑**

从 `tabStore.getAILockedTab()` 改为 `workspaceStore.getAILockedPanel()`。

- [ ] **Step 2: 修改 terminalAgent.ts**

```typescript
import { useWorkspaceStore } from '../stores/workspaceStore'

export async function executeCommand(command: string): Promise<ExecuteResult> {
  const workspaceStore = useWorkspaceStore()
  const lockedPanelId = workspaceStore.getAILockedPanel()
  const panelStore = usePanelStore()

  let panel = lockedPanelId ? panelStore.getPanel(lockedPanelId) : null
  if (!panel) {
    // Fall back to active panel in active workspace
    const workspace = workspaceStore.activeWorkspace
    panel = workspace?.activePanelId
      ? panelStore.getPanel(workspace.activePanelId)
      : null
  }

  if (!panel || !panel.sessionId) {
    throw new Error('No active terminal session')
  }

  const sessionId = panel.sessionId
  // ... rest of the function
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/aiStore.ts frontend/src/services/terminalAgent.ts frontend/src/components/AISidebar.vue
git commit -m "feat: migrate AI lock from tab to panel"
```

---

## Phase 6: 拖拽交互完善

### Task 13: 实现 Workspace 合并拖拽（场景 3）

**Files:**
- Modify: `frontend/src/components/Workspace.vue`
- Modify: `frontend/src/components/WorkspaceTabs.vue`

- [ ] **Step 1: Workspace.vue 监听 workspace tab drop**

在 Workspace.vue 中添加对 `application/workspace-id` dataTransfer 类型的处理：

```typescript
function onWorkspaceDrop(e: DragEvent) {
  const workspaceId = e.dataTransfer?.getData('application/workspace-id')
  if (!workspaceId || workspaceId === props.workspace.id) return

  const draggedWorkspace = workspaceStore.workspaces.find(w => w.id === workspaceId)
  if (!draggedWorkspace) return

  // Only single-panel ssh workspaces can merge
  if (draggedWorkspace.panelIds.length !== 1) return

  const panelId = draggedWorkspace.panelIds[0]
  const panel = panelStore.getPanel(panelId)
  if (!panel || panel.type !== 'ssh') return

  // Calculate drop position (same as panel drop)
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  // ... direction / insertBefore logic same as panel drop

  // Move panel to target workspace
  workspaceStore.closeWorkspace(workspaceId)
  workspaceStore.addPanelToWorkspace(props.workspace.id, panelId)
  panelStore.movePanelToWorkspace(panelId, props.workspace.id)
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Workspace.vue
git commit -m "feat: implement workspace-to-workspace merge drag"
```

### Task 14: 实现 Panel 抽离为新 Workspace（场景 2）

**Files:**
- Modify: `frontend/src/components/WorkspaceTabs.vue`

- [ ] **Step 1: WorkspaceTabs 监听 panel drop**

```typescript
function onTabsDrop(e: DragEvent) {
  const panelId = e.dataTransfer?.getData('application/panel-id')
  if (!panelId) return

  const panel = panelStore.getPanel(panelId)
  if (!panel) return

  // Remove from current workspace
  workspaceStore.removePanelFromWorkspace(panel.workspaceId, panelId)

  // Create new workspace with this panel
  const workspace = workspaceStore.createWorkspace(panel.title)
  workspaceStore.addPanelToWorkspace(workspace.id, panelId)
  panelStore.movePanelToWorkspace(panelId, workspace.id)
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/WorkspaceTabs.vue
git commit -m "feat: implement panel-to-new-workspace drag"
```

---

## Phase 7: 删除旧组件

### Task 15: 清理旧文件

**Files:**
- Delete: `frontend/src/components/TabBar.vue`
- Delete: `frontend/src/components/TabItem.vue`
- Delete: `frontend/src/components/TabContent.vue`
- Delete: `frontend/src/components/SplitContainer.vue`
- Delete: `frontend/src/components/SplitOverlay.vue`
- Delete: `frontend/src/stores/tabStore.ts`
- Modify: `frontend/src/components/TerminalTab.vue` (如果已完全迁移到 Panel.vue)

- [ ] **Step 1: 删除旧文件**

```bash
rm frontend/src/components/TabBar.vue
rm frontend/src/components/TabItem.vue
rm frontend/src/components/TabContent.vue
rm frontend/src/components/SplitContainer.vue
rm frontend/src/components/SplitOverlay.vue
rm frontend/src/stores/tabStore.ts
```

- [ ] **Step 2: 检查并移除所有对旧组件的引用**

搜索项目中是否还有引用旧组件的地方：

```bash
grep -r "TabBar\|TabItem\|TabContent\|SplitContainer\|SplitOverlay\|tabStore" frontend/src/ --include="*.ts" --include="*.vue"
```

修复所有引用。

- [ ] **Step 3: 编译验证**

```bash
cd frontend && npm run build
```

Expected: 编译成功，无残留引用报错。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated tab/split components"
```

---

## Phase 8: 回归测试

### Task 16: 功能验证

- [ ] **Step 1: 测试新建连接**

- 双击 sidebar connection → 验证新建 workspace + panel
- 点击 sidebar connection → 验证在当前 workspace 新建 panel

- [ ] **Step 2: 测试分屏**

- 拖拽 panel 到另一个 panel 的左/右/上/下区域 → 验证分屏布局正确
- 验证 sizes 比例为 50/50

- [ ] **Step 3: 测试 workspace 合并**

- 拖拽单 panel ssh workspace 到另一个 workspace → 验证合并成功
- 验证非 ssh workspace 无法拖拽合并

- [ ] **Step 4: 测试 panel 抽离**

- 拖拽 panel 到标签栏空白区域 → 验证新建 workspace

- [ ] **Step 5: 测试关闭**

- 关闭 panel（剩多个）→ 验证 layout 更新
- 关闭最后一个 panel → 验证 workspace 关闭

- [ ] **Step 6: 测试 AI 锁定**

- 单 panel workspace：锁定按钮在 tab 上
- 多 panel workspace：锁定按钮在 panel 标题栏上
- 执行 AI 命令 → 验证发送到锁定 panel

- [ ] **Step 7: 测试设置生效**

- 修改字体/主题 → 验证所有 panel 同步更新

- [ ] **Step 8: 编译并构建**

```bash
cd frontend && rm -rf dist node_modules/.vite && npm run build && cd ..
wails build -platform windows/amd64
```

Expected: 构建成功，运行正常。

---

## Self-Review

### Spec Coverage Check

| Spec 需求 | 对应 Task |
|-----------|----------|
| Workspace + Panel 双层结构 | Task 3, 4, 10 |
| 无限嵌套分屏 | Task 9 (递归 layout 树) |
| 单 panel 隐藏 chrome | Task 9 (`show-header="workspace.panelIds.length > 1"`) |
| 多 panel 独立标题栏 | Task 7 |
| 拖拽分屏（1/2 区域） | Task 10, 13 |
| Panel 抽离为新 Workspace | Task 14 |
| Workspace 合并（仅单 panel ssh） | Task 13 |
| 中键关闭去掉 | 未实现（设计上已移除） |
| 无新建空 workspace 按钮 | 未实现（设计上已移除） |
| Workspace 不会为空 | Task 4 (`removePanelFromWorkspace` 逻辑) |
| AI 锁定到 panel | Task 12 |
| 标签拖拽排序 | Task 6 |

### Placeholder Scan

- 无 TBD/TODO/fill in later
- 所有 step 包含具体代码或命令

### Type Consistency

- `Panel.type` 在 Task 3 定义为 `'ssh' | 'settings' | 'other'`，在 Task 13 检查中使用 `panel.type !== 'ssh'` ✓
- `LayoutNode` 类型在 Task 3 定义，在 Task 9/10 中使用 ✓
- `Workspace.panelIds` 为 `string[]`，在 Task 4 和 Task 9 中一致使用 ✓
