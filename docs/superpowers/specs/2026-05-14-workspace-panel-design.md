# Workspace + Panel 架构重构设计文档

## 背景

当前标签页和分屏逻辑采用 Tab + SplitContainer 的混合模型：
- TabBar 管理一组标签页
- 每个标签页内可通过 SplitContainer 进行分屏
- 分屏后的子节点可继续嵌套分屏

这个模型的痛点：
- 标签页和分屏两个维度交织，数据模型复杂
- 标签页之间重叠堆叠，不能同时看到多个连接的内容
- 分屏操作不够直观（需要特殊的 split overlay UI）

## 目标

引入 Workspace + Panel 的双层概念：
- **Workspace = 标签页**：一个 Workspace 对应一个传统意义上的"标签页"
- **Workspace 之间平铺不重叠**：任何时候只有一个 Workspace 占据内容区
- **Workspace 内 Panel 可分屏**：一个 Workspace 内包含 1~N 个 Panel，Panel 可水平/垂直分屏
- **Panel = 独立连接**：每个 Panel 承载一个独立的 session（SSH 连接）
- **标签可拖动重组**：WorkspaceTab 可以拖拽重新排序，也可以拖拽到另一个 Workspace 形成分屏，或从 Workspace 拖出形成新标签

## 关键决策

1. **双击 connection 默认行为**：新建一个 Workspace（新开一个标签页）
2. **分屏数量**：不做限制，和现有 SplitContainer 一样支持无限嵌套分屏
3. **分屏交互**：拖拽 Panel 标题栏到另一个 Panel 的表面区域（1/2 区域）自动分屏
4. **单 Panel 简化**：当 Workspace 只有一个 Panel 时，Workspace 内部不显示任何 Panel chrome（标题栏、关闭按钮等），标签名就是 Panel 的连接名
5. **多 Panel 标题栏**：每个 Panel 顶部有独立标题栏，显示连接名 + 关闭按钮
6. **无历史兼容包袱**：每次打开应用布局全新，不需要兼容旧 store 数据

## 数据模型

### Workspace

```typescript
interface Workspace {
  id: string
  name: string                    // 标签页显示名称
  panelIds: string[]              // 该 workspace 内的所有 panel id（扁平数组）
  layout: PanelLayout             // 面板的网格/分屏布局描述
  createdAt: number
  activePanelId: string | null    // 当前聚焦的 panel
}

// Panel 布局描述（支持嵌套分屏）
interface PanelLayout {
  root: LayoutNode
}

type LayoutNode =
  | { type: 'leaf'; panelId: string }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; children: LayoutNode[]; sizes: number[] }
```

### Panel

```typescript
interface Panel {
  id: string
  workspaceId: string
  type: 'ssh' | 'settings' | 'other'   // panel 类型，只有 ssh 类型可参与分屏合并
  sessionId: string | null             // 关联的 backend session（ssh 类型时有效）
  title: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  config: ConnectionConfig | null      // 连接配置（用于重连）
}
```

### 状态管理（Pinia Store）

```typescript
// workspaceStore.ts
interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
}

// Actions
- createWorkspace(name: string): Workspace
- closeWorkspace(id: string): void
- setActiveWorkspace(id: string): void
- moveWorkspace(fromIdx: number, toIdx: number): void
- addPanelToWorkspace(workspaceId: string, panel: Panel): void
- removePanelFromWorkspace(workspaceId: string, panelId: string): void
- setActivePanel(workspaceId: string, panelId: string): void
- updateLayout(workspaceId: string, layout: LayoutNode): void

// panelStore.ts
interface PanelState {
  panels: Map<string, Panel>
}

// Actions
- createPanel(config: ConnectionConfig): Panel
- removePanel(id: string): void
- bindSession(panelId: string, sessionId: string): void
- updateStatus(panelId: string, status: PanelStatus): void
- movePanelToWorkspace(panelId: string, fromWorkspaceId: string, toWorkspaceId: string): void
```

**关键设计点**：
- `panelStore` 持有所有 panel，workspace 通过 `panelId` 引用，不直接持有 panel 对象（避免数据不一致）
- 关闭 workspace 时，连带删除其下所有 panel（同时断开 session）
- `workspaceStore.addPanelToWorkspace` 内部自动更新 workspace 的 `layout` 和 `panelIds`（如果是第一个 panel，layout = leaf；如果是第二个，自动拆分为 horizontal split）

## 组件层级

### 新增/重命名组件

| 当前组件 | 新组件 | 说明 |
|---------|--------|------|
| TabBar.vue | WorkspaceTabs.vue | 标签栏，管理 Workspace 列表 |
| TabItem.vue | WorkspaceTabItem.vue | 单个 workspace 标签项 |
| TerminalTab.vue | useTerminal.ts (composable) | 提取终端核心逻辑为可复用 composable |
| - | Panel.vue | 单个终端面板（调用 useTerminal） |
| SplitContainer.vue | PanelGrid.vue | 面板网格/分屏容器 |
| - | Workspace.vue | Workspace 容器，包含 PanelGrid |
| - | PanelSplitter.vue | 拖拽调整大小的分隔条 |

### 组件层级

```
App.vue
├── Sidebar.vue
├── MainContent
│   ├── WorkspaceTabs.vue (标签栏)
│   │   └── WorkspaceTabItem.vue
│   └── Workspace.vue (当前激活的 workspace)
│       └── PanelGrid.vue
│           ├── Panel.vue (单 panel 时无标题栏)
│           ├── PanelSplitter.vue
│           └── Panel.vue
└── AISidebar.vue
```

### 核心复用策略

- `TerminalTab.vue` 的 xterm 初始化、session 绑定、resize、右键菜单等核心逻辑提取为 `useTerminal.ts` composable
- `Panel.vue` 调用 `useTerminal.ts`，只负责渲染标题栏和容器布局
- 旧组件（TabBar/TabItem/SplitContainer/TabContent）直接删除，不需要共存过渡期

## 交互设计

### 1. 新建连接

- 点击 Sidebar 中的 connection → 在 active Workspace 中新建一个 Panel 并连接（如果没有 active Workspace，则自动新建一个）
- 双击 connection → 新建一个 Workspace，内含一个 Panel

### 2. 分屏操作（场景 1）

- 拖拽 Panel 标题栏到另一个 Panel 的表面区域
- 目标 Panel 显示半透明 overlay，按拖放位置分为四个区域：
  - 拖到左半区 → 水平分屏（新 panel 在左）
  - 拖到右半区 → 水平分屏（新 panel 在右）
  - 拖到上半区 → 垂直分屏（新 panel 在上）
  - 拖到下半区 → 垂直分屏（新 panel 在下）
- `drop` 触发：将目标 leaf 替换为 split，按 drop 位置决定 direction 和 children 顺序

### 3. Panel 抽离为新 Workspace（场景 2）

- 拖拽 Panel 标题栏到 WorkspaceTabs.vue 的空白区域
- `drop` 触发：新建一个 Workspace，把该 Panel 移入，layout = leaf
- 原 Workspace 中移除该 Panel，如果只剩一个 Panel 则恢复为单 panel 模式

### 4. Workspace 合并为分屏（场景 3）

- **只有单 panel 且 panel 类型为 `ssh` 的 Workspace 可以拖拽合并**
- 非 ssh 类型的 panel（如全局设置等）所在的 Workspace 不允许拖拽合并
- 拖拽符合条件的 WorkspaceTab 到另一个 Workspace 的内容区域（PanelGrid 区域）
- 目标 Workspace 显示和场景 1 相同的四个 drop zone（左/右/上/下各占 1/2）
- `drop` 触发：
  - 将被拖拽 Workspace 下的 Panel 移动到目标 Workspace 中
  - 按 drop 位置插入到目标 Workspace 的 layout 中
  - 关闭被拖拽的 Workspace（标签页消失）
- 多 panel 的 Workspace 不支持拖拽合并（避免破坏已有分屏布局）
- 例如：单 panel ssh 类型的 Workspace A 拖到单 panel ssh 类型的 Workspace B 的右半区 → Workspace A 消失，Workspace B 变成水平分屏（A 的 panel 在右，B 的 panel 在左）

### 5. Workspace 标签操作

- 点击 WorkspaceTab → 切换 Workspace
- 拖拽 WorkspaceTab → 重新排序
- 右键 WorkspaceTab → 关闭 / 关闭其他 / 关闭右侧 / 关闭左侧 / 重命名

### 6. Panel 操作

- 点击 Panel → 聚焦（activePanelId）
- 拖拽 PanelSplitter → 调整大小（实时计算 sizes 比例，节流 16ms）
- 双击 PanelSplitter → 均分空间
- 关闭 Panel → 从 workspace 中移除。Workspace 不会出现空状态：如果关闭后只剩一个 Panel，自动恢复为单 panel 模式（无标题栏）；如果是关闭最后一个 Panel，关闭整个 Workspace

### 7. AI 助理锁定

AI 助理的执行目标需要明确绑定到某个 Panel 的 session：

- **单 panel 的 workspace**：AI 锁定按钮显示在 WorkspaceTab 上，锁定后该 workspace 对应的 panel 成为 AI 执行目标
- **多 panel 的 workspace**：AI 锁定按钮显示在每个 Panel 的标题栏上，用户可选择锁定某个具体 panel
- **未锁定时**：AI 命令发送到 activePanel（当前聚焦的 panel）
- **锁定时**：AI 命令始终发送到被锁定的 panel，即使切换到其他 workspace
- 一个时刻只能锁定一个 panel（全局唯一）
- 锁定 panel 关闭时，自动解除锁定

### 8. 单 / 多 Panel UI 切换

```typescript
// PanelGrid.vue 渲染逻辑
function renderLayout(node: LayoutNode): VNode {
  if (node.type === 'leaf') {
    const panel = panelStore.get(node.panelId)
    const isSingle = workspace.panelIds.length === 1

    if (isSingle) {
      // 单 panel：直接渲染终端，无标题栏
      return <PanelContent panel={panel} showHeader={false} />
    } else {
      // 多 panel：渲染带标题栏的 panel
      return <Panel panel={panel} showHeader={true} />
    }
  }

  // split 节点：递归渲染 children
  return <SplitContainer direction={node.direction} sizes={node.sizes}>
    {node.children.map(child => renderLayout(child))}
  </SplitContainer>
}
```

**Workspace 标签名规则**：
- 单 panel：`panel.title`（如 `172.22.1.71 root`）
- 多 panel：取第一个 panel 名 + `(${n})`（如 `172.22.1.71 root (3)`）

## 技术实现要点

### 1. 布局计算

PanelGrid 使用 CSS Grid 或 Flex 实现嵌套分屏布局：
- 根据 `PanelLayout` 树递归渲染
- 每个 split 节点渲染一个 flex/grid 容器
- leaf 节点渲染 Panel 组件

### 2. 拖拽实现

- 使用 HTML5 Drag and Drop API
- Panel 拖拽时显示 ghost 预览

### 3. 后端 Session 生命周期

- Panel 创建 → 创建 session → 绑定 sessionId
- Panel 关闭 → 断开 session
- Workspace 切换 → 不关闭 session，保持后台连接

## 迁移计划

### Phase 1: 提取终端逻辑
- [ ] 将 TerminalTab.vue 的终端核心逻辑提取为 useTerminal.ts composable
- [ ] 验证 TerminalTab.vue 调用 useTerminal.ts 后功能不变

### Phase 2: 新建 Workspace 体系
- [ ] 新建 workspaceStore.ts + panelStore.ts
- [ ] 新建 WorkspaceTabs.vue + WorkspaceTabItem.vue
- [ ] 新建 Workspace.vue + PanelGrid.vue + Panel.vue + PanelSplitter.vue

### Phase 3: 实现拖拽交互
- [ ] 实现 Panel 分屏拖拽（场景 1）
- [ ] 实现 Panel 抽离为新 Workspace（场景 2）
- [ ] 实现 WorkspaceTab 拖拽排序（场景 3）
- [ ] 实现 PanelSplitter 大小调整

### Phase 4: 替换旧组件
- [ ] App.vue 中替换 TabBar → WorkspaceTabs
- [ ] 删除 TabBar.vue / TabItem.vue / SplitContainer.vue / TabContent.vue / SplitOverlay.vue
- [ ] 删除 tabStore.ts

### Phase 5: 回归测试
- [ ] 测试新建连接、分屏、关闭、重连
- [ ] 测试 AI 助理绑定到 activePanel
- [ ] 测试设置（字体、主题）全局生效
