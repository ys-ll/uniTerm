# uniTerm AI 对话框功能规格说明书

## 1. 功能概述

AI 对话框是 uniTerm 的右侧边栏组件，提供 Claude Code 式的对话交互能力。AI 助手可以在用户当前激活的终端会话中执行 shell 命令，读取命令输出，并基于输出结果继续推理，实现多轮任务自主完成或经用户确认后执行。

## 2. 界面布局

### 2.1 整体结构

```
+------------------------------------------+-----------+
|                                          |           |
|           终端主区域                      |  AI 边栏   |
|                                          |  (360px)  |
|                                          |           |
|                                          |           |
+------------------------------------------+-----------+
```

- **位置**：主窗口右侧，可折叠
- **宽度**：默认 360px，可拖动调整（范围 240px ~ 800px），折叠时宽度为 0
- **切换方式**：通过顶部工具栏 "AI" 按钮或边栏关闭按钮切换显隐

### 2.2 边栏内部结构（从上到下）

| 区域 | 说明 |
|------|------|
| 标题栏 | "AI Assistant" + 设置按钮 + 关闭按钮 |
| 模式切换 | Auto / Confirm 分段控制器 + Debug 复选框 |
| 消息列表 | 对话消息滚动区域 |
| 输入区 | 文本输入框 + Send/Stop 按钮 |
| 设置弹窗 | API Key、Base URL、Model、Protocol 配置 |

### 2.3 消息气泡样式

| 角色 | 头像文字 | 头像背景色 | 对齐方式 |
|------|----------|-----------|----------|
| user | You | #4a4a4a | 左对齐 |
| assistant | AI | #007acc | 左对齐 |
| tool | Tool | #2d8a2d | 左对齐（仅 debug 消息可见） |

## 3. 消息类型与展示规则

### 3.1 消息数据模型

```typescript
interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]       // assistant 发起工具调用时携带
  tool_call_id?: string         // tool 角色消息携带，关联对应的 tool_call
  pendingTool?: PendingTool     // 确认模式下，待用户审批的工具调用
}

interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string  // JSON 字符串
  }
}
```

### 3.2 消息过滤规则

消息列表仅展示以下消息：
- `role !== 'tool'` 的所有消息（user、assistant）
- `role === 'tool' && id.startsWith('dbg-')` 的 debug 消息

独立的 tool 执行结果消息（`role === 'tool'` 且非 debug）**不直接展示在消息列表中**，而是通过 `tool_call_id` 关联到对应的 assistant 消息的 IN/OUT 块中展示。

### 3.3 消息内容渲染

- **文本内容**：支持完整的 Markdown 渲染
  - 代码块 `` ```...``` `` → `<pre><code>`
  - 行内代码 `` `...` `` → `<code>`
  - 粗体 `**text**` → `<strong>`
  - 斜体 `*text*` → `<em>`
  - 无序列表 `- item` → `<ul><li>`
  - 有序列表 `1. item` → `<ol><li>`
  - 链接 `[text](url)` → `<a href="url">text</a>`
  - 分隔线 `---` → `<hr>`
  - HTML 特殊字符转义（`& < >`）
- **IN/OUT 工具块**：assistant 消息的 `tool_calls` 以折叠面板形式展示（见第 4 节）

## 4. 工具调用展示（IN/OUT 块）

### 4.1 展示原则

IN（输入）和 OUT（输出）必须**成对展示在同一个 assistant 消息气泡内**，不允许拆分成独立消息展示。

### 4.2 IN 块（命令输入）

- **触发条件**：`message.tool_calls?.length > 0`
- **样式**：绿色主题（背景 #1e2a1e，边框 #2d4a2d）
- **头部**："IN" 标签 + 函数名（如 `execute_command`）+ 展开/折叠箭头
- **内容**：函数参数格式化 JSON 展示
- **默认状态**：折叠

### 4.3 OUT 块（执行结果）

- **触发条件**：通过 `getToolResult(toolCallId)` 在全局消息列表中查找对应 `tool_call_id` 的 tool 消息
- **样式**：紫色主题（背景 #1e1e2a，边框 #2d2d4a）
- **头部**："OUT" 标签 + 展开/折叠箭头
- **内容**：命令执行的 stdout/stderr 输出文本
- **默认状态**：折叠
- **最大高度**：300px，超出可滚动

### 4.4 待审批状态（Confirm 模式）

当 assistant 发起工具调用且当前为 Confirm 模式时：
- 显示 `pendingTool` 区域：工具名 + 参数 + "Run" / "Skip" 按钮
- IN 块照常展示
- OUT 块不显示（尚未执行）
- 用户点击 "Run" → 执行命令 → 添加 tool 结果消息 → 自动查找并渲染 OUT 块
- 用户点击 "Skip" → 添加内容为 "User rejected this command." 的 tool 结果消息 → 渲染 OUT 块

## 5. 交互流程

### 5.1 正常对话流程（Auto 模式）

```
用户输入 → 添加 user 消息 → 调用 LLM → 流式接收 assistant 回复
    → assistant 需要执行命令？
        → 是：添加 assistant 消息（含 tool_calls）→ 立即执行命令
            → 添加 tool 结果消息 → 再次调用 LLM（循环，最多 10 轮）
        → 否：回复完成，结束
```

### 5.2 确认模式流程（Confirm 模式）

```
用户输入 → 添加 user 消息 → 调用 LLM → 流式接收 assistant 回复
    → assistant 需要执行命令？
        → 是：添加 assistant 消息（含 tool_calls + pendingTool）→ 暂停等待用户
            → 用户点击 "Run" → 执行命令 → 添加 tool 结果 → 自动继续 LLM 调用
            → 用户点击 "Skip" → 添加拒绝结果 → 不自动继续（需用户再次输入）
        → 否：回复完成，结束
```

### 5.3 前置检查

发起 AI 请求前必须检查：
- 当前是否有激活的终端标签页（`tabStore.activeTab?.sessionId` 存在）
- 若无，不调用 LLM，直接回复提示："请先在主窗口中打开一个终端会话，这样我才能执行命令。"

### 5.4 停止机制

- **Stop 按钮**：仅在 `isRunning === true` 时显示，点击后设置 `stopRequested = true`
- **中断点**：
  - LLM 流式接收时（跳过后续 chunk）
  - 工具调用执行前（不执行命令）
  - 执行后下一次循环开始时

## 6. 执行模式

| 模式 | 说明 | 用户交互 |
|------|------|----------|
| **Auto** (autonomous) | AI 自动执行命令，无需确认 | 用户只需发送初始指令，AI 自主完成多轮执行 |
| **Confirm** | AI 每执行一条命令前需用户确认 | 显示 pendingTool 区域，用户点击 Run/Skip 决定 |

模式切换通过边栏顶部分段控制器实时切换，不影响历史消息。

## 7. LLM 协议支持

### 7.1 支持的协议

| 协议 | 说明 |
|------|------|
| OpenAI | 标准 OpenAI Chat Completions API 格式 |
| Anthropic | 通过后端转换为 Anthropic Messages API 格式 |

### 7.2 请求流程

```
前端 (OpenAI 格式) → Go 后端 ChatCompletion → LLM 服务商
                                    ↓
前端 ←  OpenAI 格式响应  ← 后端协议转换（Anthropic 时）
```

前端统一使用 OpenAI 格式构造请求（含 `tool_calls`、`tool_call_id`、`tools` 等字段），后端根据 `protocol` 配置决定：
- `openai`：直接转发
- `anthropic`：转换为 Anthropic Messages API 格式

### 7.3 Anthropic 协议转换要点

后端 `chatAnthropic` 需要处理以下映射：

| OpenAI 格式 | Anthropic 格式 |
|------------|---------------|
| `role: 'assistant' + content + tool_calls` | `role: 'assistant' + content blocks [text, tool_use...]` |
| `role: 'tool' + content + tool_call_id` | `role: 'user' + content blocks [tool_result]` |
| `tools` 数组 | `tools` 数组（`input_schema` 替代 `parameters`） |

### 7.4 工具定义

当前仅支持一个工具：`execute_command`

```json
{
  "type": "function",
  "function": {
    "name": "execute_command",
    "description": "Execute a shell command in the active terminal session and return its output.",
    "parameters": {
      "type": "object",
      "properties": {
        "command": { "type": "string", "description": "..." }
      },
      "required": ["command"]
    }
  }
}
```

## 8. 终端集成

### 8.1 命令执行机制

AI 通过 `SessionWrite` 向当前激活终端会话发送命令，通过 `EventsOn('session:data')` 监听终端输出，使用**标记位（marker）机制**判断命令执行完成。

### 8.2 Marker 机制

1. 生成唯一标记：`__AI_DONE_${timestamp}_${random}__`
2. 发送命令格式：` _='${marker}';${command};echo "$_"`
3. 监听终端输出，查找标记出现位置：
   - **第一次出现**：pty 回显（命令行本身的 echo），忽略
   - **第二次出现**：命令执行后的 `echo` 输出，表示命令完成
4. 截取两次标记之间的内容作为命令输出
5. **超时**：15 秒无响应则返回已收集的输出

### 8.3 终端可见性控制

- 命令本身会显示在终端窗口中（pty echo 不可避免）
- 使用简短变量名 `_` 和紧凑格式，尽量减少视觉干扰
- 标记值本身不应对用户可读输出造成显著影响

## 9. 配置管理

### 9.1 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| apiKey | string | '' | LLM API 密钥 |
| baseURL | string | 'https://api.openai.com/v1' | API 基础地址 |
| model | string | 'gpt-4o' | 模型名称 |
| protocol | 'openai' \| 'anthropic' | 'anthropic' | API 协议类型 |

### 9.2 持久化

- 配置存储在 `localStorage`，key 为 `uniterm:ai-config`
- 设置弹窗中修改后点击 "Save" 才写入 localStorage

### 9.3 Debug 模式

- 通过边栏顶部 "Debug" 复选框开关
- 开启后，在对话中插入 debug 消息（id 前缀 `dbg-`）
- Debug 消息在消息列表中可见，但**不传入 LLM conversation**
- 用于排查请求体、响应内容、执行流程等问题

## 10. 错误处理

### 10.1 错误场景

| 场景 | 处理方式 |
|------|----------|
| 无 API Key | 抛出错误，显示 "API key not configured" |
| LLM 请求失败 | debug 日志记录，assistant 消息追加错误信息 |
| JSON 解析失败 | debug 日志记录，抛出解析错误 |
| API 返回错误 | debug 日志记录，抛出 API 错误 |
| 无激活终端会话 | 直接回复提示，不调用 LLM |
| 命令执行超时 | 返回已收集输出，exitCode = -1 |
| 命令执行异常 | 添加错误内容的 tool 结果消息，继续对话 |

### 10.2 错误展示

- LLM 层面的错误：以 `[Error: ...]` 形式追加到 assistant 消息内容中
- 执行层面的错误：以 `[Error executing command: ...]` 形式作为 tool 结果内容

## 11. Session 管理（对话历史）

### 11.1 概念

- **Session**：一次完整的 AI 对话上下文，包含一组消息（messages）和元数据
- **当前 Session**：用户正在交互的对话，消息实时展示在边栏中
- **历史 Session**：已结束的对话，保存在 localStorage 中，可随时加载继续

### 11.2 数据模型

```typescript
interface AISession {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  messages: AIMessage[]
}
```

### 11.3 行为规则

| 场景 | 行为 |
|------|------|
| 应用启动 | 自动创建新 Session（名称为 "New Chat"），清空之前未保存的当前对话 |
| 手动新建 | 将当前对话保存为历史 Session（如已有消息），然后创建新 Session |
| 加载历史 | 选择历史 Session 后，将其消息加载到当前对话中，可继续发送消息 |
| 消息更新 | 每次添加消息时自动更新当前 Session 的 `messages` 和 `updatedAt` |
| 持久化 | 所有历史 Session 存储在 `localStorage`，key 为 `uniterm:ai-sessions` |

### 11.4 UI 设计

在边栏标题栏下方、模式切换上方增加 Session 选择区域：

```
┌─ AI Assistant ─┐
│ [New Chat ▼]   │  ← Session 下拉选择器
│                │
│  Auto  Confirm │  ← 模式切换（原位置下移）
│                │
```

- **下拉选择器**：
  - 当前 Session 名称展示
  - 下拉列表显示所有历史 Session（按 updatedAt 倒序）
  - 顶部固定项：「+ New Chat」（新建会话）
  - 每个历史项右侧显示删除按钮（hover 时出现）
- **新建 Session**：点击「+ New Chat」或发送第一条消息时自动创建

### 11.5 实现要点

- `aiStore` 中增加 `sessions` 数组、`currentSessionId`、相关操作方法
- `addMessage` 时同步更新当前 session 的 messages
- 切换 session 时替换 `messages` 数组，触发 UI 重新渲染
- 新建 session 时生成唯一 id（`session-${Date.now()}`），名称为 "New Chat"
- 加载历史 session 后，用户发送新消息即继续该对话
- 删除历史 session 时从数组中移除，若删除的是当前加载的 session，则自动新建一个

### 11.6 Session 自动命名

| 规则 | 说明 |
|------|------|
| 命名来源 | 取当前 session 中第一条 `role === 'user'` 的消息内容作为标题 |
| 长度限制 | 最多显示前 20 个字符，超出截断并加 "..." |
| 时间戳 | 下拉列表中每个 session 右侧显示最后更新时间（`updatedAt`）的相对时间，如 "2分钟前" |
| 默认名称 | 没有用户消息时显示 "New Chat" |
| 更新时机 | 每次添加消息时检查，若 session 尚无用户消息且当前添加的是 user 消息，则自动更新名称 |

## 12. 输入交互

### 12.1 换行与发送

| 按键 | 行为 |
|------|------|
| **Enter** | 发送消息 |
| **Shift + Enter** | 在输入框中插入换行符 |
| **Ctrl + Enter** | 发送消息（备选） |

实现方式：监听 `keydown` 事件，检查 `event.shiftKey`，若为 true 则不做拦截允许默认换行行为；否则 `preventDefault` 并触发发送。

## 13. 工具调用展示（IN/OUT 块）

### 13.1 展示原则

IN（输入）和 OUT（输出）必须**成对展示在同一个 assistant 消息气泡内**，不允许拆分成独立消息展示。

### 13.2 IN 块（命令输入）

- **触发条件**：`message.tool_calls?.length > 0`
- **样式**：绿色主题（背景 #1e2a1e，边框 #2d4a2d）
- **头部**："IN" 标签 + 函数名（如 `execute_command`）+ 展开/折叠箭头
- **内容**：**仅显示命令文本**，不展示完整 JSON
  - 解析 `arguments` JSON，提取 `command` 字段的值
  - 以 `<code>` 格式展示纯命令文本
  - 示例：`{"command": "kubectl get nodes -o wide"}` → 展示为 `kubectl get nodes -o wide`
- **默认状态**：折叠

### 13.3 OUT 块（执行结果）

- **触发条件**：通过 `getToolResult(toolCallId)` 在全局消息列表中查找对应 `tool_call_id` 的 tool 消息
- **样式**：紫色主题（背景 #1e1e2a，边框 #2d2d4a）
- **头部**："OUT" 标签 + 展开/折叠箭头
- **内容**：命令执行的 stdout/stderr 输出文本
- **默认状态**：折叠
- **最大高度**：300px，超出可滚动

### 13.4 待审批状态（Confirm 模式）

当 assistant 发起工具调用且当前为 Confirm 模式时：
- 显示 `pendingTool` 区域：工具名 + **仅显示 command 命令文本** + "Run" / "Skip" 按钮
  - 解析 `pendingTool.arguments`，提取 `command` 字段的值展示
  - 不展示完整 JSON
- IN 块照常展示（仅显示命令文本）
- OUT 块不显示（尚未执行）
- 用户点击 "Run" → 执行命令 → 添加 tool 结果消息 → 自动查找并渲染 OUT 块
- 用户点击 "Skip" → 添加内容为 "User rejected this command." 的 tool 结果消息 → 渲染 OUT 块

## 14. 系统提示词

AI 的系统提示词定义了助手的行为准则：

- 在终端中执行 shell 命令辅助用户完成任务
- 执行命令前始终解释即将做什么
- 优先使用标准 Unix 工具（ls, cat, grep, find 等）
- 文件编辑使用 sed, awk, echo 重定向等
- 潜在破坏性操作需警告用户
- 适当使用 `&&` 或 `;` 链式执行多条命令
- 输出过长时总结关键发现

## 15. 消息渲染实现

### 15.1 Markdown 支持

使用正则表达式实现轻量级 Markdown 渲染，支持的语法按处理顺序：

1. HTML 实体转义：`& < >`
2. 标题：`^#{1,6} (.*)$` → `<h1>` ~ `<h6>`
3. 表格：`|` 分隔的行块 → `<table>`（含表头 `<th>` 和数据行 `<td>`）
4. 代码块：`` ```...``` `` → `<pre><code>...</code></pre>`
5. 粗体：`\*\*(.*?)\*\*` → `<strong>$1</strong>`
6. 斜体：`\*(.*?)\*` → `<em>$1</em>`
7. 无序列表：逐行匹配 `^- (.*)$` → `<li>$1</li>`，每组包裹 `<ul>...</ul>`
8. 有序列表：逐行匹配 `^\d+\. (.*)$` → `<li>$1</li>`，每组包裹 `<ol>...</ol>`
9. 链接：`\[([^\]]+)\]\(([^)]+)\)` → `<a href="$2" target="_blank">$1</a>`
10. 行内代码：`` `([^`]+)` `` → `<code>$1</code>`
11. 分隔线：`^---+` → `<hr>`
12. 换行符保留：`\n` → `<br>`，但**块级元素标签（`h1`-`h6`、`pre`、`table`、`ul`、`ol`、`hr` 等）前后的 `<br>` 会被移除**，避免空行过多

渲染结果通过 `v-html` 绑定到消息气泡的文本区域。

AI 的系统提示词定义了助手的行为准则：

- 在终端中执行 shell 命令辅助用户完成任务
- 执行命令前始终解释即将做什么
- 优先使用标准 Unix 工具（ls, cat, grep, find 等）
- 文件编辑使用 sed, awk, echo 重定向等
- 潜在破坏性操作需警告用户
- 适当使用 `&&` 或 `;` 链式执行多条命令
- 输出过长时总结关键发现
