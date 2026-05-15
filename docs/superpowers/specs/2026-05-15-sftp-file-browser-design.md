# SFTP 文件浏览器设计文档

**日期**: 2026-05-15  
**分支**: feature/local-terminal  
**范围**: 基于现有 SSH 连接实现 SFTP 文件浏览器，支持双窗格文件管理、命令行交互和 AI 集成

---

## 1. 概述

在 uniTerm 现有 SSH 终端基础上，新增 SFTP 文件浏览器功能。用户可在已有 SSH 连接上右键选择"连接 SFTP"，打开独立的 SFTP Tab。每个 SFTP Tab 包含：

- **上 3/4**：左右双窗格文件浏览器（左侧本地目录，右侧远程目录）
- **下 1/4**：交互式 SFTP 命令行终端

所有 UI 操作（点击、拖拽）均转化为 SFTP 命令发送至后端 REPL 执行，结果同步展示在 UI 和命令行中。

---

## 2. 目标

- 基于现有 SSH 连接配置，一键打开 SFTP 文件浏览器
- 双窗格浏览：本地文件系统（左）+ 远程文件系统（右）
- 支持拖拽传输：本地↔远程双向拖拽上传/下载
- 完整的 SFTP 命令行 REPL，支持 `ls`, `cd`, `get`, `put`, `mkdir`, `rm`, `mv`, `chmod` 等标准命令
- AI 可识别 SFTP 上下文并执行 SFTP 命令（非 shell 命令）
- 文件传输完全异步，不阻塞 UI 和命令行

---

## 3. 架构设计

### 3.1 Tab/Panel 类型扩展

新增 `SFTPTab` 类型：

```typescript
export interface SFTPTab {
  type: 'sftp'
  id: string
  panelId: string
  name: string
}
```

`Tab` 联合类型扩展为：
```typescript
export type Tab = TerminalTab | SettingsTab | WorkspaceTab | SFTPTab
```

`PanelType` 扩展为：
```typescript
export type PanelType = 'ssh' | 'settings' | 'other' | 'sftp'
```

### 3.2 整体布局

```
┌─────────────────────────────────────────────────┐
│  Tab Bar: [SSH: server1] [SFTP: server1]        │
├──────────────────┬──────────────────────────────┤
│  📁 本地文件      │  📁 远程文件                  │
│  ~/projects      │  /home/user/projects         │
│                  │                              │
│  file1.txt       │  file1.txt                   │
│  folder/         │  folder/                     │
│                  │                              │
│  ←── 拖拽上传    │   拖拽下载 ──→               │
├──────────────────┴──────────────────────────────┤
│  [传输进度: file.zip ████████░░ 80%]            │
├─────────────────────────────────────────────────┤
│  sftp> cd projects                              │
│  sftp> ls                                       │
│  sftp> get file.txt                             │
│  sftp> _                                        │
└─────────────────────────────────────────────────┘
```

### 3.3 入口交互

在 `Sidebar` / `ConnectionForm` 中已有 SSH 连接上右键，新增菜单项 **"连接 SFTP"**。点击后：

1. `panelStore.createPanel(config, 'sftp')` → 创建 `type='sftp'` 的 panel
2. `tabStore.createSFPTab(name, panelId)` → 创建 SFTP Tab 并激活
3. 后端 `SessionManager.Create("sftp", config)` → 基于同配置建立独立 SSH+SFTP 连接

SFTP 连接独立于原 SSH Tab，关闭 SSH Tab 不影响 SFTP Tab。

---

## 4. 后端设计

### 4.1 SFTPSession

新增 `backend/session/sftp_session.go`，`SFTPSession` 实现现有的 `Session` 接口：

```go
type SFTPSession struct {
    baseSession
    sshClient  *ssh.Client   // 独立 SSH 连接（基于同配置）
    sftpClient *sftp.Client  // github.com/pkg/sftp
    cwd        string        // 当前远程目录
    localCwd   string        // 当前本地目录
}
```

**方法实现：**

| 方法 | 行为 |
|------|------|
| `Connect(config)` | 建立 SSH 连接 → `sftp.NewClient(sshClient)` → `cwd = "/"`，`localCwd = os.Getwd()` |
| `Write(data)` | 将命令字符串交给内部 REPL 解析执行 |
| `Resize(cols, rows)` | 空实现（SFTP 无 PTY）|
| `Disconnect()` | `sftpClient.Close()` → `sshClient.Close()` |

### 4.2 REPL 命令解析器

每条命令解析为 `Command` 结构，执行后返回 `CommandResult`：

```go
type CommandResult struct {
    TextOutput string       // 纯文本输出（显示在 xterm）
    FileList   []FileInfo   // 远程文件列表（给右侧 UI）
    LocalList  []FileInfo   // 本地文件列表（给左侧 UI）
    CWD        string       // 远程当前路径变更
    LocalCWD   string       // 本地当前路径变更
}

type FileInfo struct {
    Name    string    `json:"name"`
    Size    int64     `json:"size"`
    ModTime time.Time `json:"modTime"`
    Mode    os.FileMode `json:"mode"`
    IsDir   bool      `json:"isDir"`
}
```

**支持命令集：**

| 命令 | 作用 | 触发 UI 更新 |
|------|------|-------------|
| `ls [path]` | 列出远程文件 | `FileList` + `CWD` |
| `cd <path>` | 切换远程目录 | `CWD` |
| `pwd` | 显示远程路径 | - |
| `lls [path]` | 列出本地文件 | `LocalList` + `LocalCWD` |
| `lcd <path>` | 切换本地目录 | `LocalCWD` |
| `lpwd` | 显示本地路径 | - |
| `get <remote> [local]` | 下载文件 | 启动异步传输 |
| `put <local> [remote]` | 上传文件 | 启动异步传输 |
| `mkdir <path>` | 创建远程目录 | - |
| `rm <path>` | 删除远程文件 | - |
| `rmdir <path>` | 删除远程目录 | - |
| `mv <old> <new>` | 重命名/移动 | - |
| `chmod <mode> <path>` | 修改权限 | - |
| `help` | 显示帮助 | - |

### 4.3 输出与事件通道

复用现有事件，新增三个 SFTP 专用事件：

- **`session:sftp:filelist`** — `{"id": "...", "files": [...], "cwd": "/home/user"}`
- **`session:sftp:locallist`** — `{"id": "...", "files": [...], "localCwd": "C:\\Users\\..."}`
- **`session:sftp:transfer`** — `{"id": "...", "taskId": "...", "type": "progress|complete", "progress": 1024000, "total": 2048000, "error": ""}`

REPL 执行 `ls` 时，同时 emit `session:data`（文本表格）和 `session:sftp:filelist`（结构化数据）。

### 4.4 SessionManager 扩展

在 `Create` 中增加 `case "sftp"`：

```go
case "sftp":
    s = NewSFTPSession(config.ID)
```

`App.go` 中 `CreateSession` 已支持任意 `sessionType`，无需修改。

新增 Wails 绑定方法供文件对话框使用：
- `OpenFileDialog()` → 打开文件选择对话框，返回路径
- `SaveFileDialog(defaultName)` → 打开保存对话框，返回路径

---

## 5. 前端设计

### 5.1 组件结构

```
frontend/src/components/
├── SFTPTabContent.vue       # SFTP Tab 容器（上下分栏）
├── SFTPFileList.vue         # 文件列表（复用，通过 mode 区分本地/远程）
├── SFTPCommandLine.vue      # 命令行终端（xterm）
├── SFTPPathBreadcrumb.vue   # 路径面包屑
└── SFTPTransferProgress.vue # 传输进度条
```

### 5.2 SFTPTabContent.vue

上下分栏布局：

```vue
<div class="sftp-tab">
  <div class="panes-area">          <!-- flex: 3 -->
    <div class="local-pane">
      <SFTPPathBreadcrumb :path="localCwd" />
      <SFTPFileList mode="local" :files="localFiles" />
    </div>
    <div class="remote-pane">
      <SFTPPathBreadcrumb :path="cwd" />
      <SFTPFileList mode="remote" :files="remoteFiles" />
    </div>
  </div>
  <SFTPTransferProgress :tasks="transferTasks" />
  <div class="command-line-area">   <!-- flex: 1 -->
    <SFTPCommandLine :sessionId="panel.sessionId" />
  </div>
</div>
```

### 5.3 SFTPFileList.vue

通过 `mode: 'local' | 'remote'` prop 区分：

| 属性 | local | remote |
|------|-------|--------|
| 数据来源 | Go `os` API（通过 Wails 绑定）| REPL `ls` 返回的 JSON |
| 路径状态 | `localCwd` | `cwd` |
| `cd` 实现 | 本地目录切换（直接 `os.Chdir`）| 发送 `cd` 命令到 REPL |

#### 表格列定义

Element Plus `el-table`，5 列：

| 列 | 说明 |
|----|------|
| 名称 | 文件夹/文件图标 + 文件名（`..` 作为第一行）|
| 权限 | `-rw-r--r--` 格式 |
| 修改时间 | `YYYY-MM-DD HH:mm` |
| 类型 | `文件` / `目录` / `符号链接` |
| 大小 | 字节数，目录显示 `-` |

#### 行选择与交互

- **单击**：选中单行，取消其他选中
- **Ctrl + 单击**：切换当前行的选中状态（多选）
- **Shift + 单击**：选中从上次点击位置到当前行的连续范围
- **双击目录**：进入子目录（本地直接切换，远程发送 `cd` 命令）
- **双击文件**：远程区域触发下载，本地区域尝试用系统默认程序打开
- **点击 ".." 行**：返回上级目录

#### 右键菜单

**单文件右键菜单**：

| 菜单项 | 说明 |
|--------|------|
| 下载文件 | 下载到对面窗格的当前目录 |
| 发送到本地目录 | 仅远程文件可用，下载到左侧本地目录 |
| 发送到远程目录 | 仅本地文件可用，上传到右侧远程目录 |
| 修改名称 | 弹出输入框，发送 `mv old new` |
| 移动 | 弹出路径输入框，发送 `mv old path/` |
| 删除 | 确认对话框后发送 `rm path`（目录发送 `rmdir`）|
| 刷新 | 重新执行 `ls` 刷新当前列表 |
| 新建目录 | 弹出输入框，发送 `mkdir name` |
| 修改权限 | 弹出输入框（如 `755`），发送 `chmod mode path` |

**单目录右键菜单**：与文件菜单相同，但**隐藏"下载文件"**，替换为**"进入目录"**（发送 `cd` 命令）。

**批量右键菜单**：

- 选中项**全为文件** → 展示文件右键菜单
- 选中项**包含目录** → 展示目录右键菜单（"进入目录"置灰不可用）
- **批量操作时置灰不可用**：修改名称、修改权限（仅支持单个文件/目录操作）
- 批量删除：确认对话框显示 `确定删除选中的 N 个文件/目录？`
- 批量下载/发送：依次对每个选中项启动传输任务

#### 筛选功能

文件列表上方提供一个搜索输入框：
- 输入时实时过滤当前已加载的文件列表
- 支持模糊匹配（文件名包含搜索文本，不区分大小写）
- **纯前端处理**，不发送 SFTP 命令到后端
- 筛选仅影响显示，不改变实际的 `ls` 结果

### 5.4 拖拽传输

HTML5 Drag & Drop：

- **本地 → 远程**：`dragstart` 携带 `{type: 'local', path: '/abs/path'}` → 远程区域 `drop` → 触发 `put localPath remoteCwd/basename`
- **远程 → 本地**：`dragstart` 携带 `{type: 'remote', path: '/remote/path'}` → 本地区域 `drop` → 触发 `get remotePath localCwd/basename`
- 拖拽过程中目标区域显示边框高亮

### 5.5 SFTPCommandLine.vue

基于 xterm，复用 `useTerminal` 核心逻辑但移除 SSH 特有的重连机制。

- 自定义主题（与 SSH 终端一致）
- 后端 REPL 输出 `sftp> ` 作为提示符
- 用户输入通过 `SessionWrite` 发送到后端
- 接收 `session:data` 事件显示输出

### 5.6 tabStore / panelStore 扩展

`tabStore` 新增：
```typescript
function createSFPTab(name: string, panelId: string): SFTPTab
```

`panelStore.createPanel` 已支持 `type` 参数，直接传 `'sftp'`。

### 5.7 AI 上下文集成

修改 `agent.ts` 中的 `buildSystemPrompt()`：

```typescript
const activePanel = getActivePanel()
if (activePanel?.type === 'sftp') {
  parts.push('This is an SFTP command line session.')
  parts.push('Available commands: ls, cd, pwd, get, put, mkdir, rm, rmdir, mv, chmod, lls, lcd, lpwd, help')
  parts.push('Current remote path: ' + (sftpTab?.currentPath || '/'))
  parts.push('Current local path: ' + (sftpTab?.localCurrentPath || '.'))
}
```

`getActivePanel()` 已处理两种场景：
1. 有 AI 锁定时，返回锁定的 panel
2. 无 AI 锁定时，返回当前激活 tab 的 panel

两种场景下只要 panel type 为 `'sftp'`，AI 都会收到 SFTP 上下文提示。

---

## 6. 数据流

### 6.1 用户浏览远程目录

```
用户双击 "projects" 行（右侧远程）
  ↓
SFTPFileList 发送 SFTPWrite(sessionId, "cd projects")
  ↓
后端 REPL: sftpClient.Stat("projects") 确认目录 → sftpClient.RealPath(".") 获取新路径
  ↓
emit session:data         → "sftp> cd projects\n"
emit session:sftp:filelist → {files: [...], cwd: "/home/user/projects"}
  ↓
前端: xterm 显示命令输出
      右侧 SFTPFileList 更新文件列表
      右侧 PathBreadcrumb 更新路径
```

### 6.2 AI 执行命令

数据流与 6.1 相同，只是输入来源从用户点击变为 AI 生成的命令字符串。

### 6.3 拖拽上传

```
用户将本地文件 "report.pdf" 拖到右侧远程区域
  ↓
SFTPFileList 计算目标路径: remoteCwd + "/report.pdf"
  ↓
发送 SFTPWrite(sessionId, "put /local/path/report.pdf /remote/cwd/report.pdf")
  ↓
后端 REPL 解析 → 启动异步传输 goroutine
  ↓
立即返回: "sftp> put report.pdf\nTransfer started: report.pdf\n"
  ↓
传输 goroutine 持续 emit:
  session:sftp:transfer {type:"progress", taskId:"...", progress:1024, total:4096}
  session:sftp:transfer {type:"complete", taskId:"...", error:""}
  ↓
前端: 进度条更新 → 完成后自动发送 "ls" 刷新文件列表
```

---

## 7. 文件传输（异步）

### 7.1 传输模型

所有文件传输在独立的 Go goroutine 中执行，REPL 主线程不阻塞。

```go
type TransferTask struct {
    ID         string
    Type       string // "upload" | "download"
    LocalPath  string
    RemotePath string
    Progress   int64
    Total      int64
    Status     string // "pending" | "running" | "done" | "error"
}

func (s *SFTPSession) startTransfer(task *TransferTask) {
    go func() {
        task.Status = "running"
        // 分块读写，每 64KB 推送一次进度
        buf := make([]byte, 64*1024)
        for {
            n, err := src.Read(buf)
            if n > 0 {
                dst.Write(buf[:n])
                task.Progress += int64(n)
                s.emitTransferProgress(task)
            }
            if err == io.EOF { break }
            if err != nil { task.Status = "error"; break }
        }
        if task.Status != "error" { task.Status = "done" }
        s.emitTransferComplete(task)
    }()
}
```

### 7.2 并发限制

同时最多允许 **3 个活跃传输任务**。超出限制的进入队列等待。用户可通过命令行 `jobs` 查看队列（后续扩展）。

### 7.3 传输完成后的自动刷新

传输完成后，后端自动执行一次 `ls` 刷新远程文件列表，确保 UI 同步。

---

## 8. 命令集参考

| 命令 | 参数 | 说明 |
|------|------|------|
| `ls [path]` | 可选路径，默认当前目录 | 列出远程文件 |
| `cd <path>` | 目标目录 | 切换远程目录 |
| `pwd` | 无 | 显示远程当前路径 |
| `lls [path]` | 可选路径，默认当前目录 | 列出本地文件 |
| `lcd <path>` | 目标目录 | 切换本地目录 |
| `lpwd` | 无 | 显示本地当前路径 |
| `get <remote> [local]` | 远程路径，可选本地路径 | 下载文件 |
| `put <local> [remote]` | 本地路径，可选远程路径 | 上传文件 |
| `mkdir <path>` | 目录路径 | 创建远程目录 |
| `rm <path>` | 文件路径 | 删除远程文件 |
| `rmdir <path>` | 目录路径 | 删除远程目录 |
| `mv <old> <new>` | 旧路径，新路径 | 重命名或移动 |
| `chmod <mode> <path>` | 权限（如 755），路径 | 修改权限 |
| `help` | 无 | 显示命令帮助 |

---

## 9. 错误处理

| 场景 | 行为 |
|------|------|
| 未知命令 | xterm 显示 `Unknown command: xxx. Type 'help' for usage.` |
| 文件/目录不存在 | xterm 显示 `No such file or directory: /path` |
| 权限不足 | xterm 显示 `Permission denied: /path` |
| 传输失败（网络中断）| 进度条变红，xterm 显示 `Transfer failed: ...` |
| 同名文件覆盖 | 默认覆盖（标准 FTP 行为）|
| SSH 连接断开 | `session:status` → disconnected，两侧文件列表显示"连接已断开" |
| 本地路径无效 | xterm 显示 `Local path not found: /path` |

---

## 10. 未决事项

以下功能不在本次实现范围内，可后续扩展：

- 断点续传
- 目录递归上传/下载
- 文件内容在线编辑（双击文本文件直接编辑）
- 文件权限可视化修改（右键属性对话框）
- 传输队列管理（`jobs`, `cancel` 命令）
- SFTP 连接复用（与原 SSH Tab 共享底层连接）
