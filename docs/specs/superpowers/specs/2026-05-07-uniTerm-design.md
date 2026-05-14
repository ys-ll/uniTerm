# uniTerm 多标签终端工具设计文档

## 1. 项目概述

uniTerm 是一款跨平台的多标签页终端工具，支持 SSH 登录远程节点和 SFTP 文件传输。采用内置模块架构，后续可迭代添加 MySQL、Redis 等数据库客户端。

### 1.1 核心目标
- 跨平台（Windows / macOS / Linux），包体尽可能小
- 多标签页 + 分屏 + 多窗口拖拽组合
- 第一阶段 MVP：SSH + SFTP
- 内置模块形式扩展，暂不支持动态插件

### 1.2 技术栈
| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | Wails v2 | Go 后端 + Web 前端，包体小 |
| 前端 | Vue 3 | Composition API |
| UI 组件 | Element Plus | 成熟稳定，适合工具类应用 |
| 终端渲染 | xterm.js | 支持 VT100、颜色、Unicode |
| SSH/SFTP | golang.org/x/crypto/ssh + github.com/pkg/sftp | Go 标准生态 |
| 状态管理 | Pinia | 轻量级，适合跨组件状态 |
| 配置存储 | Wails runtime storage | 跨平台，无需额外依赖 |

---

## 2. 架构设计

### 2.1 架构概述

采用**标签页中心架构（Tab-Centric / Session-Based）**。核心抽象是 `Session` 接口，每个标签页对应一个 `Session` 实例，由统一的 `SessionManager` 管理生命周期。

```
┌─────────────────────────────────────────────┐
│                 前端 (Vue 3)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ AppShell │  │ TabBar   │  │ Sidebar  │  │
│  │ (分屏容器) │  │ (标签栏)  │  │(连接列表) │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       └─────────────┴─────────────┘         │
│                   │                         │
│            Wails Bindings / Events          │
│                   │                         │
└───────────────────┼─────────────────────────┘
                    │
┌───────────────────┼─────────────────────────┐
│                   ▼                         │
│            后端 (Go / Wails)                │
│  ┌─────────────────────────────────────┐   │
│  │         SessionManager              │   │
│  │  (管理所有 Session 生命周期)          │   │
│  └─────────────────────────────────────┘   │
│       │              │              │       │
│  ┌────▼────┐   ┌────▼────┐   ┌────▼────┐  │
│  │SSHSession│   │SFTP    │   │MySQL    │  │
│  │         │   │Session  │   │Session  │  │
│  │(第一阶段)│   │(第一阶段)│   │(后续迭代)│  │
│  └─────────┘   └─────────┘   └─────────┘  │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │      ConnectionStore (配置存储)       │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 2.2 前端组件结构

```
App.vue (每个窗口一个 Vue 实例)
├── WindowFrame.vue
│   ├── AppHeader.vue          # 顶部工具栏（新建连接、设置）
│   ├── Sidebar.vue            # 左侧连接列表/书签
│   │   └── ConnectionItem.vue
│   └── SplitContainer.vue     # 递归分屏容器
│       ├── TabGroup.vue       # 标签组（可拖拽排序、拖出）
│       │   ├── TabBar.vue
│       │   │   └── TabItem.vue
│       │   └── TabContent.vue
│       │       ├── TerminalTab.vue    # SSH 终端（xterm.js）
│       │       └── SftpTab.vue        # SFTP 文件管理器
│       └── SplitContainer.vue # 子分屏（水平/垂直）
```

**状态管理（Pinia）：**
- `tabStore`：当前窗口的标签列表、激活标签 ID、分屏布局状态
- `connectionStore`：保存的连接配置列表（跨窗口同步）
- `sessionStore`：Session 状态映射（ID → 状态）

### 2.3 后端 Session 接口

```go
package session

type SessionStatus string

const (
    StatusConnecting    SessionStatus = "connecting"
    StatusConnected     SessionStatus = "connected"
    StatusDisconnected  SessionStatus = "disconnected"
    StatusError         SessionStatus = "error"
)

type Session interface {
    ID() string
    Type() string                    // "ssh" | "sftp" | "mysql" | "redis" ...
    Title() string                   // 标签页显示标题
    Status() SessionStatus           // 当前状态

    Connect(config ConnectionConfig) error
    Disconnect() error
    IsConnected() bool

    // 数据通道（SSH 使用，其他类型可返回错误）
    Write(data []byte) error
    SetOnDataCallback(cb func([]byte))
    SetOnStatusChangeCallback(cb func(SessionStatus))
}

type ConnectionConfig struct {
    ID       string
    Name     string            // 显示名称
    Type     string            // "ssh" | "sftp" | "mysql" | "redis"
    Host     string
    Port     int
    User     string
    AuthType string            // "password" | "key" | "agent"
    Password string            // 如选择保存（建议后续用 keychain）
    KeyPath  string            // 私钥路径
}
```

**SessionManager：**

```go
type SessionManager struct {
    sessions map[string]Session
    mu       sync.RWMutex
}

func (sm *SessionManager) Create(sessionType string, config ConnectionConfig) (Session, error)
func (sm *SessionManager) Close(sessionID string) error
func (sm *SessionManager) Get(sessionID string) (Session, bool)
func (sm *SessionManager) List() []SessionInfo
```

### 2.4 多窗口与分屏设计

**多窗口机制：**
- Wails 后端通过 `runtime.WindowNew()` 创建新窗口，每个窗口加载同一套前端代码
- 每个窗口是一个独立的 Vue 应用实例，拥有独立的 `tabStore`
- 后端 `SessionManager` 是全局单例，所有窗口共享
- `connectionStore` 跨窗口同步：通过 Wails Events 广播变更

**拖拽交互：**
- 标签页在**同窗口内**：在 `TabGroup` 之间拖拽重组，通过 HTML5 Drag and Drop API 实现
- 标签页**拖出窗口**：前端捕获 `dragend` 事件，通知后端创建新窗口，将 Session 绑定到新窗口的标签页
- 标签页**拖入窗口**：前端将 Session 从原窗口解绑，绑定到目标窗口的 `TabGroup`
- 窗口关闭时若仍有活跃 Session：提示用户"是否关闭所有连接？"或"迁移到其他窗口"

**分屏实现：**
- 使用递归的 `SplitContainer` 组件，支持水平/垂直分割
- 每个叶子节点是一个 `TabGroup`
- 分屏比例可拖拽调整，状态保存在 `tabStore` 中

---

## 3. 数据流

### 3.1 SSH 连接典型流程

```
用户点击"连接"
    │
    ▼
前端: connectionStore 保存配置 → tabStore 新建标签
    │
    ▼
Wails Binding: SessionManager.Create("ssh", config)
    │
    ▼
后端: 新建 SSHSession → 异步 goroutine Connect()
    │
    ├─ 成功 ──► Event "session:status" {id, "connected"}
    │            前端: 标签状态更新，渲染 xterm.js，发送初始化命令
    │
    └─ 失败 ──► Event "session:status" {id, "error", errorMsg}
                 前端: 标签显示错误信息，提供"重试"按钮
```

### 3.2 终端输入/输出流程

```
用户在 xterm.js 输入字符
    │
    ▼
前端: xterm.onData(data) → Wails Binding: Session.Write(sessionID, data)
    │
    ▼
后端: SSHSession.Write(data) → 写入 SSH channel
    │
    ▼
SSH 服务端返回数据
    │
    ▼
后端: Session.onDataCallback(data) → Event "session:data" {id, data}
    │
    ▼
前端: sessionStore 收到数据 → xterm.write(data) 渲染
```

### 3.3 通信方式总结

| 方向 | 机制 | 场景 |
|------|------|------|
| 前端 → 后端 | Wails Bindings (同步/异步) | 创建连接、发送数据、关闭会话、读取配置 |
| 后端 → 前端 | Wails Events (异步推送) | 连接状态变更、终端输出、配置变更广播 |

---

## 4. 存储方案

| 数据类型 | 存储方式 | 说明 |
|---------|---------|------|
| 连接配置（主机/端口/用户名等）| Wails runtime storage (JSON 文件) | 跨窗口共享，应用启动时加载 |
| SSH 私钥路径 | 存储路径字符串 | **不存储密钥内容**，用户自行管理私钥文件 |
| 密码/密钥短语 | 暂不入存储 | 第一期每次连接时手动输入；后续可接入 OS keychain |
| 窗口布局/分屏状态 | 每个窗口独立存储 | 恢复时按上次布局重建 |
| 会话历史/日志 | 暂不入存储 | MVP 范围外，后续按需添加 |

**配置存储路径：** Wails 自动管理，Windows 下在 `%APPDATA%/uniTerm/`，macOS 在 `~/Library/Application Support/uniTerm/`，Linux 在 `~/.config/uniTerm/`。

---

## 5. 错误处理

| 场景 | 处理方式 |
|------|---------|
| 连接失败（网络/认证/主机不可达） | Session 状态变为 `error`，标签页内显示错误信息 + "重试"按钮 |
| 连接意外断开 | 自动重连（最多 3 次，间隔 2s），失败后标记为 `disconnected` |
| 后端未捕获异常 | Wails 框架自动捕获并记录，前端显示通用错误 Toast |
| SFTP 文件操作失败 | 前端 Toast 提示具体错误（权限不足、文件不存在、路径过长等） |
| 窗口关闭时仍有活跃 Session | 弹窗提示："是否关闭所有连接？" 或 "迁移到其他窗口" |
| 分屏拖拽异常 | 回退到上一次有效布局状态 |

---

## 6. 扩展路径

后续添加新客户端类型（如 MySQL、Redis）时，只需三步：

1. **后端**：新建 `MySQLSession`，实现 `Session` 接口
   - `Connect()` → 建立数据库连接
   - `Write()` → 发送 SQL 查询或命令
   - `SetOnDataCallback()` → 接收查询结果

2. **前端**：新建 `MySQLTab.vue`
   - 替代 `TerminalTab.vue` 中的 xterm.js
   - 使用表格、编辑器展示 SQL 结果和数据库结构

3. **注册**：在 `SessionManager.Create()` 的 switch 中增加 `case "mysql"`

`Session` 接口的通用设计（`Write` / `OnData`）同样适用于数据库客户端——数据以字节流或 JSON 形式传输即可。

---

## 7. 项目结构（预期）

```
uniTerm/
├── wails.json
├── main.go
├── frontend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── components/
│   │   │   ├── AppHeader.vue
│   │   │   ├── Sidebar.vue
│   │   │   ├── SplitContainer.vue
│   │   │   ├── TabGroup.vue
│   │   │   ├── TabBar.vue
│   │   │   ├── TabItem.vue
│   │   │   ├── TabContent.vue
│   │   │   ├── TerminalTab.vue
│   │   │   └── SftpTab.vue
│   │   ├── stores/
│   │   │   ├── tabStore.ts
│   │   │   ├── connectionStore.ts
│   │   │   └── sessionStore.ts
│   │   └── types/
│   │       └── session.ts
│   └── package.json
├── backend/
│   ├── app.go
│   ├── session/
│   │   ├── session.go          # Session 接口
│   │   ├── manager.go          # SessionManager
│   │   ├── ssh_session.go      # SSH 实现
│   │   └── sftp_session.go     # SFTP 实现
│   └── store/
│       └── connection_store.go # 连接配置存储
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-05-07-uniTerm-design.md
```

---

## 8. 非功能性需求

- **包体大小**：产物控制在 20MB 以内（Wails + Go 的可执行文件通常 10-15MB）
- **启动速度**：冷启动 < 2s
- **内存占用**：单个 SSH 连接 < 50MB，整体应用 < 200MB
- **响应延迟**：终端输入到显示 < 50ms（本地网络环境下）
- **并发连接**：支持至少 20 个并发 Session
