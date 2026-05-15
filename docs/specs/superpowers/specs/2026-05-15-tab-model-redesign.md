# 标签模型重构设计文档

## 背景

当前标签栏中每个标签对应一个 Workspace，Workspace 内 Panel 通过递归 LayoutNode 树实现嵌套分屏。存在以下问题：
- Workspace 标签和 Panel 分屏逻辑耦合，拖拽交互复杂
- 所有标签统一为 Workspace，无法区分"简单单连接"和"多 Panel 分屏"两种场景
- 拖拽合并、分离、内部调整位置的交互不清晰

## 目标

引入三类标签共存于标签栏：**TerminalTab（终端标签）**、**SettingsTab（设置标签）** 和 **WorkspaceTab（Workspace 标签）**。

- TerminalTab = 单个终端 Panel，默认创建方式，无分屏能力
- SettingsTab = 单个设置 Panel，独立的标签类型
- WorkspaceTab = 包含多个终端 Panel，通过拖拽合并产生，内部 Panel 平铺分屏
- TerminalTab 和 WorkspaceTab 可通过拖拽互相转换
- 未来可扩展更多标签类型

## 关键决策

1. **默认创建 TerminalTab**：打开连接创建终端标签，打开设置创建设置标签
2. **Workspace 仅通过拖拽合并终端标签产生**：没有手动创建 Workspace 的入口
3. **Workspace 内分屏**：保持递归分屏模型（LayoutNode 树），支持 PanelSplitter 拖拽调整大小
4. **Panel 标题栏**：Workspace 内始终显示（含标题、AI 锁定按钮、关闭按钮）
5. **Workspace 标签命名**："Workspace"，同名自动加数字后缀 "Workspace (2)"、"Workspace (3)" ...
6. **AI 锁定按钮仅存在于终端标签类型上**：TerminalTab 的 TabItem 上、WorkspaceTab 内 Panel 标题栏上
7. **Panel 标题栏无右键菜单**，终端区域右键菜单为：复制 / 复制并粘贴 / 粘贴 / 问 AI

## 数据模型

### Tab

```typescript
type Tab = TerminalTab | SettingsTab | WorkspaceTab

interface TerminalTab {
  type: 'terminal'
  id: string
  panelId: string              // 关联的终端 panel
  name: string                  // 标签显示名
}

interface SettingsTab {
  type: 'settings'
  id: string
  panelId: string              // 关联的设置 panel
  name: string                  // 标签显示名
}

interface WorkspaceTab {
  type: 'workspace'
  id: string
  name: string                 // "Workspace" / "Workspace (2)" ...
  panelIds: string[]           // 包含的终端 panel id 列表
  layout: PanelLayout          // 递归分屏布局
  activePanelId: string | null // 当前聚焦的 panel
}
```

### Panel（保持不变）

```typescript
interface Panel {
  id: string
  tabId: string                // 所属 Tab 的 id
  type: 'ssh' | 'settings' | 'other'
  sessionId: string | null
  title: string
  status: PanelStatus
  config: ConnectionConfig | null
}
```

### Layout（保持不变）

```typescript
interface PanelLayout {
  root: LayoutNode
}

type LayoutNode =
  | { type: 'leaf'; panelId: string }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; children: LayoutNode[]; sizes: number[] }
```

### 状态管理

```typescript
// tabStore.ts (新)
interface TabState {
  tabs: Tab[]
  activeTabId: string | null
}

// Actions
- createTerminalTab(name: string, panelId: string): TerminalTab
- createSettingsTab(name: string, panelId: string): SettingsTab
- createWorkspaceTab(name: string, panelIds: string[], layout: PanelLayout): WorkspaceTab
- closeTab(id: string): void
- setActiveTab(id: string): void
- moveTab(fromIdx: number, toIdx: number): void
- mergeToWorkspace(tabAId: string, tabBId: string, direction, insertBefore): WorkspaceTab
- addPanelToWorkspaceTab(tabId: string, panelId: string): void
- removePanelFromWorkspaceTab(tabId: string, panelId: string): void
- updateWorkspaceLayout(tabId: string, layout: PanelLayout): void
- renameTab(id: string, name: string): void
```


## 组件层级

```
App.vue
├── TabBar.vue                    ← 替代 WorkspaceTabs
│   ├── TabItem.vue               ← TerminalTab / SettingsTab 的标签项
│   └── WorkspaceTabItem.vue      ← WorkspaceTab 的标签项
└── MainContent
    ├── TerminalTabContent.vue     ← 单终端 panel（无标题栏，全屏终端）
    │   └── Panel.vue (showHeader=false)
    ├── SettingsTabContent.vue     ← 单设置 panel
    │   └── SettingsTab.vue
    └── WorkspaceContent.vue      ← 多终端 panel 平铺
        └── PanelGrid.vue
            ├── RenderNode.vue    ← 递归渲染 layout 树
            ├── Panel.vue (showHeader=true)
            └── PanelSplitter.vue
```

标签栏同时混合显示 TerminalTab、SettingsTab 和 WorkspaceTab，通过 `Tab.type` 区分渲染。

## 交互设计

### 场景 1：打开连接/设置

- 点击/双击 Sidebar 中的 connection → 创建 TerminalTab + 终端 Panel
- 点击设置按钮 → 创建 SettingsTab + settings Panel
- 标签栏新增对应的标签项

### 场景 2：拖拽合并（终端标签 → 终端标签）

1. 拖拽终端标签 A 到终端标签 B 的内容区域
2. 目标面板显示半透明 drop zone overlay，分为左/右/上/下四个 1/2 区域
3. 根据 drop 位置决定分屏方向：
   - 左半区 → 水平分屏（A 在左）
   - 右半区 → 水平分屏（A 在右）
   - 上半区 → 垂直分屏（A 在上）
   - 下半区 → 垂直分屏（A 在下）
4. 删除标签 A 和标签 B，创建新 WorkspaceTab，包含 A 和 B 的 panel
5. WorkspaceTab 名为 "Workspace"，若已存在同名则自动加数字后缀

### 场景 3：拖拽合并（终端标签 → Workspace 标签）

1. 拖拽终端标签到 Workspace 内容区域
2. 鼠标经过某个 panel 时，该 panel 表面显示半透明 drop zone overlay（左/右/上/下 1/2 区域）
3. 根据 drop 位置决定插入方向和位置：
   - 左半区 → 水平分屏，插入目标 panel 左侧
   - 右半区 → 水平分屏，插入目标 panel 右侧
   - 上半区 → 垂直分屏，插入目标 panel 上方
   - 下半区 → 垂直分屏，插入目标 panel 下方
4. 终端标签删除，其 panel 合并到目标 Workspace 的 layout 中

### 场景 4：从 Workspace 分离 panel

1. 拖拽 Workspace 内的 panel 标题栏到标签栏空白区域
2. panel 从 Workspace 的 layout 中移除，创建新的 TerminalTab 插入到标签栏
3. 如果分离后 Workspace 只剩 1 个 panel → WorkspaceTab 删除，该 panel 自动转为 TerminalTab

### 场景 5：Workspace 内部 panel 调整位置

1. 拖拽 Workspace 内某个 panel 的标题栏到另一个 panel 的表面区域
2. 目标 panel 显示半透明 drop zone overlay（左/右/上/下 1/2 区域），和场景 2/3 一致的交互
3. 根据 drop 位置将该 panel 从原位置移除，插入到目标 panel 的对应方向
4. 如果调整后只剩 1 个 panel → WorkspaceTab 自动转为 TerminalTab

### 场景 6：标签栏操作

- 点击 TerminalTab → 激活，显示单终端 Panel 内容
- 点击 SettingsTab → 激活，显示设置页面
- 点击 WorkspaceTab → 激活，显示多终端 Panel 平铺视图
- 拖拽标签 → 标签栏内重新排序（TerminalTab、SettingsTab 和 WorkspaceTab 均支持）
- 设置标签不可拖拽合并到 Workspace

### 场景 7：Panel 操作

- 点击 Panel → 聚焦（activePanelId）
- 拖拽 PanelSplitter → 调整相邻 panel 比例（节流处理）
- 双击 PanelSplitter → 均分空间
- 关闭 Panel → 从 Workspace 移除。若 Workspace 变为单 panel → 自动转为 TerminalTab

### 场景 8：AI 锁定

- TerminalTab：AI 锁定按钮在 TabItem 上，锁定后该 tab 对应的 panel 成为 AI 执行目标
- SettingsTab：无 AI 锁定按钮
- WorkspaceTab：AI 锁定按钮在每个 panel 标题栏上，用户可选择锁定某个具体 panel
- 未锁定：AI 命令发送到 activePanel
- 已锁定：AI 命令始终发送到被锁定的 panel
- 锁定的 panel 关闭时，自动解除锁定

### 场景 9：右键菜单

**TerminalTab / SettingsTab 右键菜单：**
- 关闭 / 关闭其他 / 关闭右侧 / 关闭左侧 / 重命名

**WorkspaceTab 右键菜单：**
- 关闭 / 关闭其他 / 关闭右侧 / 关闭左侧 / 重命名

**终端区域右键菜单：**
- 复制 / 复制并粘贴 / 粘贴 / 问 AI

### 场景 10：Workspace 标签命名

- 新建 WorkspaceTab 时，默认名称为 "Workspace"
- 若已存在名为 "Workspace" 的 tab，则依次尝试 "Workspace (2)"、"Workspace (3)" ...
- 用户可通过右键菜单重命名任意标签

### 场景 11：设置标签行为

- 设置标签是独立的标签类型，不支持拖拽合并到 Workspace
- 拖拽 TerminalTab 到 SettingsTab 内容区域不触发合并
- 设置标签在标签栏内支持拖拽排序
- 设置页面打开时，检测是否已有设置标签存在，若有则直接激活而非创建新标签

## 组件复用策略

- 复用现有 `Panel.vue`、`PanelGrid.vue`、`RenderNode.vue`、`PanelSplitter.vue`
- 复用现有 `useTerminal.ts` composable
- 现有 `WorkspaceTabs.vue` → 重构为 `TabBar.vue`
- 现有 `WorkspaceTabItem.vue` → 拆分为 `TabItem.vue` + `WorkspaceTabItem.vue`
- 新建 `TerminalTabContent.vue`、`SettingsTabContent.vue`、`WorkspaceContent.vue`
- 删除 `Workspace.vue`（逻辑合并到 Content 组件中）
- 现有 `workspaceStore.ts` → 重构为 `tabStore.ts`（统一管理三类 tab）
- 现有 `panelStore.ts` → Panel 的 `workspaceId` 改为 `tabId`
