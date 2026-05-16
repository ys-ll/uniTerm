# 移除 SFTP 命令行终端 — 设计文档

## 目标

移除 SFTP 交互式命令行终端层。所有 SFTP 界面操作通过 Wails 绑定直接调用后端 Go 函数，消除中间的文本命令解析层。

## 当前架构

```
前端 UI → sendCommand("ls /path") → SessionWrite(sid, "ls /path\n")
    → 后端 SFTPSession.Write() → 缓冲区 → handleCommand → splitArgs
    → cmdLS → emitFileTable → emitData(转义序列 JSON)
    → 前端 EventsOn("session:data") → 正则匹配 → 解析 JSON → 更新 UI
```

## 目标架构

```
前端 UI → SftpListRemote(sid, path) → 直接返回 []FileItem + cwd → 更新 UI

传输进度（实时推送）：
SftpPut → startTransfer goroutine → emitTransferProgress
    → EventsOn("session:data") → 匹配 sftp:transfer → 更新进度条
```

## 后端变更

### app.go — 新增 Wails 绑定方法

所有方法遵循统一模式：接收 sessionID → 校验 → 委托给 SFTPSession → 返回结构化数据。

| 方法 | 签名 | 说明 |
|------|------|------|
| `SftpListRemote` | `(sid, path string) ([]FileItem, string, error)` | 列出远程目录文件，返回文件列表 + 当前路径 |
| `SftpListLocal` | `(sid, path string) ([]FileItem, string, error)` | 列出本地目录文件，返回文件列表 + 当前路径 |
| `SftpChangeRemoteDir` | `(sid, path string) ([]FileItem, string, error)` | 切换远程目录并自动返回文件列表 |
| `SftpChangeLocalDir` | `(sid, path string) ([]FileItem, string, error)` | 切换本地目录并自动返回文件列表 |
| `SftpMakeDir` | `(sid, path string) error` | 创建远程目录 |
| `SftpRemove` | `(sid, path string, recursive bool) error` | 删除远程文件或目录 |
| `SftpRename` | `(sid, oldPath, newPath string) error` | 重命名远程文件 |
| `SftpChmod` | `(sid, path, mode string) error` | 修改远程文件权限 |
| `SftpGet` | `(sid, remotePath, localPath string, recursive bool) (taskID string, error)` | 下载文件/目录 |
| `SftpPut` | `(sid, localPath, remotePath string, recursive bool) (taskID string, error)` | 上传文件/目录 |

传输进度继续通过 `EventsEmit("session:data", ...)` 实时推送。

### sftp_session.go — 删除的部分

- `Write()` 实现 → 替换为空操作桩（保留空方法以满足 `Session` 接口）
- `Resize()` 实现 → 替换为空操作桩
- `handleCommand()` — 命令解析入口
- `splitArgs()` — 参数分割
- `remotePath()` / `localPath()` — 路径辅助函数（逻辑合并到 app.go 的绑定方法中）
- 全部 `cmd*` 函数：`cmdLS`、`cmdCD`、`cmdLLS`、`cmdLCD`、`cmdMkdir`、`cmdRmFile`、`cmdRmDir`、`cmdRename`、`cmdChmod`、`cmdGet`、`cmdPut`、`cmdHelp`
- `emitText()` — 终端文本输出
- `emitFileTable()` / `emitLocalTable()` — 终端表格渲染
- `SFTPFileInfo` 结构体 — 移除 emitFileTable 后不再需要
- 终端输入缓冲变量

### sftp_session.go — 保留的部分

- `Write()` / `Resize()` — 空操作桩，兼容 `Session` 接口
- `Connect()`、`Disconnect()`、`IsConnected()` — 连接管理
- `startTransfer()` — 单文件传输（异步 goroutine + 进度事件）
- `downloadDir()` / `uploadDir()` — 改为：先计算目录总大小 → 创建单个 TransferTask → 逐文件拷贝（累积进度到同一 task）→ 发射一次 start/多次 progress/一次 complete
- `transferFile()` — 改为接收已有的 `*TransferTask` 参数，向其中累积进度
- `rmRecursive()` — 递归删除
- `emitTransferStart/Progress/Complete/Event()` — 进度事件
- `TransferTask` 结构体

## 前端变更

### SFTPTabContent.vue

删除：
- 模板中的 `<div class="command-line-area">` 和 `<BaseTerminal mode="sftp">`
- `import BaseTerminal` 导入
- `import { SessionWrite } from '../../wailsjs/go/main/App'` 导入
- `sendCommand()` 辅助函数
- `quoteArg()` 辅助函数
- `.command-line-area` CSS 规则

修改：
- `sendCommand(...)` 调用 → 直接调用 Wails 绑定方法（如 `SftpListRemote(sid, path)`）
- `EventsOn('session:data')` → 仅保留 `sftp:transfer` 进度事件处理；移除 `sftp:filelist`/`sftp:locallist` 处理
- `.panes-area` CSS：`flex: 3` → `flex: 1`（文件列表占满全部空间）
- `joinPath()` 辅助函数保留

### agent.ts

- 删除 `buildSystemPrompt()` 中 SFTP 类型的分支判断
- SSH 终端上下文注入保持不变

### 不变的文件

- `BaseTerminal.vue` — 仍用于 SSH 会话
- `SFTPFileList.vue`、`SFTPPathBreadcrumb.vue`、`SFTPTransferProgress.vue` — 不变

## 数据流

### 列表/导航（直接返回）

```
onRefreshRemote() → SftpListRemote(sid, cwd) → { files, cwd } → 设置响应式变量
onRemoteNavigate(path) → SftpChangeRemoteDir(sid, path) → { files, cwd } → 设置响应式变量
```

### 变更操作（直接返回）

```
删除确认 → 遍历: SftpRemove(sid, path, recursive) → 完成后 SftpListRemote(sid, cwd)
重命名确认 → SftpRename(sid, old, new) → 完成后 SftpListRemote(sid, cwd)
新建目录确认 → SftpMakeDir(sid, path) → 完成后 SftpListRemote(sid, cwd)
修改权限确认 → SftpChmod(sid, path, mode) → 完成后 SftpListRemote(sid, cwd)
```

### 传输操作（进度通过事件推送）

**单文件传输**：
```
SftpPut(sid, local, remote, false)
    → 后端 startTransfer 创建一个 TransferTask，goroutine 发射 start/progress/complete 事件
    → 前端 EventsOn 处理器展示/更新/移除进度条
```

**目录传输（递归）**：
```
SftpPut(sid, local, remote, true)
    → 后端先遍历目录树计算总大小，创建 ONE TransferTask
    → 发射 ONE start 事件（包含总文件数和总大小）
    → 逐文件拷贝，累积更新 progress 到同一个 task
    → 全部完成后发射 ONE complete 事件
```

整个目录表现为**一条进度条**，而不是每个文件一条。

## 错误处理

所有绑定方法返回 `error`。前端用 try/catch 包裹调用，通过已有的 dialog 或内联提示展示错误信息。

## FileItem 类型

Go 与 TypeScript 之间共享的类型定义：

```go
// 后端 (sftp_session.go)
type FileItem struct {
    Name    string `json:"name"`
    Size    int64  `json:"size"`
    ModTime string `json:"modTime"`
    Mode    string `json:"mode"`
    IsDir   bool   `json:"isDir"`
}
```

```typescript
// 前端 (SFTPFileList.vue 中已有)
export interface FileItem {
  name: string
  size: number
  modTime: string
  mode: string
  isDir: boolean
}
```
