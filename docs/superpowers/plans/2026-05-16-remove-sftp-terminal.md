# 移除 SFTP 命令行终端 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 SFTP 命令行的终端层，前端直接调用后端 Wails 绑定方法，消除中间的文本命令解析。

**Architecture:** 在 sftp_session.go 中删除 handleCommand/splitArgs/所有 cmd* 函数/emitText/emitFileTable/emitLocalTable；新增直接方法供 app.go 的 Wails 绑定调用；前端 SFTPTabContent 移除 BaseTerminal 和 SessionWrite，改为直接调用绑定方法；传输进度保留 event 推送，目录传输作为一个整体任务。

**Tech Stack:** Go (Wails v2.12), Vue 3 + TypeScript, xterm.js (保留给 SSH)

---

### Task 1: 重写 sftp_session.go — 删除命令行解析层，新增直接方法

**Files:**
- Modify: `backend/session/sftp_session.go` (全文件替换)

#### 1.1 删除不需要的 import

删除 `"encoding/json"`, `"strconv"`, `"strings"`（命令行解析相关，不再需要）。保留 `"fmt"`, `"io"`, `"os"`, `"path"`, `"path/filepath"`, `"sync"`, `"time"`, `"github.com/pkg/sftp"`, `"golang.org/x/crypto/ssh"`。

#### 1.2 重写 SFTPSession 结构体和构造函数

保持不变（结构体和 NewSFTPSession 无需改动）。

#### 1.3 修改 Connect — 移除 emitText("sftp> ")

将第 93 行的 `s.emitText("sftp> ")` 删除（不再需要终端提示符）。

#### 1.4 将 Write/Resize 改为空操作

Write 和 Resize 必须保留以满足 Session 接口，但实现改为空操作：

```go
func (s *SFTPSession) Write(data []byte) error {
    return nil
}

func (s *SFTPSession) Resize(cols, rows int) error {
    return nil
}
```

#### 1.5 删除 SFTPFileInfo 结构体（第 130-136 行）

替换为新的 FileItem 结构体（供直接返回使用）：

```go
type FileItem struct {
    Name    string `json:"name"`
    Size    int64  `json:"size"`
    ModTime string `json:"modTime"`
    Mode    string `json:"mode"`
    IsDir   bool   `json:"isDir"`
}
```

#### 1.6 保留 TransferTask 结构体（第 139-147 行）

不变。

#### 1.7 删除以下全部函数

- `splitArgs()` (149-170)
- `handleCommand()` (172-214)
- `remotePath()` (216-221)
- `localPath()` (223-228)
- `cmdLS()` (230-242)
- `cmdCD()` (244-266)
- `cmdLLS()` (268-280)
- `cmdLCD()` (282-304)
- `cmdMkdir()` (306-318)
- `cmdRmFile()` (320-346)
- `rmRecursive()` (348-367) — 移到下面"保留的函数"区域
- `cmdRmDir()` (369-400)
- `cmdRename()` (402-415)
- `cmdChmod()` (417-434)
- `cmdGet()` (436-470)
- `cmdPut()` (472-506)
- `cmdHelp()` (508-527)
- `emitText()` (731-733)
- `emitFileTable()` (735-762)
- `emitLocalTable()` (764-801)

#### 1.8 重写 startTransfer — 去掉末尾的 cmdLS/cmdLLS 调用

```go
func (s *SFTPSession) startTransfer(task *TransferTask) {
    go func() {
        task.Status = "running"
        s.emitTransferStart(task)
        var src io.Reader
        var dst io.Writer

        if task.Type == "download" {
            remoteFile, e := s.sftpClient.Open(task.RemotePath)
            if e != nil {
                task.Status = "error"
                s.emitTransferEvent(task, e)
                return
            }
            defer remoteFile.Close()
            fi, _ := remoteFile.Stat()
            if fi != nil {
                task.Total = fi.Size()
            }
            src = remoteFile
            localFile, e := os.Create(task.LocalPath)
            if e != nil {
                task.Status = "error"
                s.emitTransferEvent(task, e)
                return
            }
            defer localFile.Close()
            dst = localFile
        } else {
            localFile, e := os.Open(task.LocalPath)
            if e != nil {
                task.Status = "error"
                s.emitTransferEvent(task, e)
                return
            }
            defer localFile.Close()
            fi, _ := localFile.Stat()
            if fi != nil {
                task.Total = fi.Size()
            }
            src = localFile
            remoteFile, e := s.sftpClient.Create(task.RemotePath)
            if e != nil {
                task.Status = "error"
                s.emitTransferEvent(task, e)
                return
            }
            defer remoteFile.Close()
            dst = remoteFile
        }

        buf := make([]byte, 64*1024)
        for {
            n, e := src.Read(buf)
            if n > 0 {
                dst.Write(buf[:n])
                task.Progress += int64(n)
                s.emitTransferProgress(task)
            }
            if e == io.EOF {
                break
            }
            if e != nil {
                task.Status = "error"
                s.emitTransferEvent(task, e)
                return
            }
        }
        task.Status = "done"
        s.emitTransferComplete(task)
    }()
}
```

移除了末尾的 `if task.Type == "upload" { s.cmdLS(nil) } else { s.cmdLLS(nil) }`。

#### 1.9 新增：计算目录总大小的辅助方法

```go
func (s *SFTPSession) dirSizeRemote(dir string) (int64, error) {
    infos, err := s.sftpClient.ReadDir(dir)
    if err != nil {
        return 0, err
    }
    var total int64
    for _, fi := range infos {
        if fi.IsDir() {
            sz, err := s.dirSizeRemote(path.Join(dir, fi.Name()))
            if err != nil {
                return 0, err
            }
            total += sz
        } else {
            total += fi.Size()
        }
    }
    return total, nil
}

func (s *SFTPSession) dirSizeLocal(dir string) (int64, error) {
    entries, err := os.ReadDir(dir)
    if err != nil {
        return 0, err
    }
    var total int64
    for _, e := range entries {
        if e.IsDir() {
            sz, err := s.dirSizeLocal(filepath.Join(dir, e.Name()))
            if err != nil {
                return 0, err
            }
            total += sz
        } else {
            fi, err := e.Info()
            if err != nil {
                return 0, err
            }
            total += fi.Size()
        }
    }
    return total, nil
}
```

#### 1.10 重写 downloadDir — 使用累计进度（单个 TransferTask）

```go
func (s *SFTPSession) downloadDir(remoteDir, localDir string, task *TransferTask) error {
    if err := os.MkdirAll(localDir, 0755); err != nil {
        return err
    }
    infos, err := s.sftpClient.ReadDir(remoteDir)
    if err != nil {
        return err
    }
    for _, fi := range infos {
        rp := path.Join(remoteDir, fi.Name())
        lp := filepath.Join(localDir, fi.Name())
        if fi.IsDir() {
            if err := s.downloadDir(rp, lp, task); err != nil {
                return err
            }
        } else {
            if err := s.transferFile(task, rp, lp, "download"); err != nil {
                return err
            }
        }
    }
    return nil
}
```

#### 1.11 重写 uploadDir — 使用累计进度

```go
func (s *SFTPSession) uploadDir(localDir, remoteDir string, task *TransferTask) error {
    if err := s.sftpClient.MkdirAll(remoteDir); err != nil {
        return err
    }
    entries, err := os.ReadDir(localDir)
    if err != nil {
        return err
    }
    for _, entry := range entries {
        rp := path.Join(remoteDir, entry.Name())
        lp := filepath.Join(localDir, entry.Name())
        if entry.IsDir() {
            if err := s.uploadDir(lp, rp, task); err != nil {
                return err
            }
        } else {
            if err := s.transferFile(task, lp, rp, "upload"); err != nil {
                return err
            }
        }
    }
    return nil
}
```

#### 1.12 重写 transferFile — 接收已有的 *TransferTask，向其中累积进度

```go
func (s *SFTPSession) transferFile(task *TransferTask, localPath, remotePath, tfType string) error {
    if tfType == "download" {
        src, err := s.sftpClient.Open(remotePath)
        if err != nil {
            return err
        }
        defer src.Close()
        dst, err := os.Create(localPath)
        if err != nil {
            return err
        }
        defer dst.Close()
        buf := make([]byte, 64*1024)
        for {
            n, e := src.Read(buf)
            if n > 0 {
                dst.Write(buf[:n])
                task.Progress += int64(n)
                s.emitTransferProgress(task)
            }
            if e != nil {
                break
            }
        }
    } else {
        src, err := os.Open(localPath)
        if err != nil {
            return err
        }
        defer src.Close()
        dst, err := s.sftpClient.Create(remotePath)
        if err != nil {
            return err
        }
        defer dst.Close()
        buf := make([]byte, 64*1024)
        for {
            n, e := src.Read(buf)
            if n > 0 {
                dst.Write(buf[:n])
                task.Progress += int64(n)
                s.emitTransferProgress(task)
            }
            if e != nil {
                break
            }
        }
    }
    return nil
}
```

#### 1.13 保留 rmRecursive（从删除区移至保留区）

```go
func (s *SFTPSession) rmRecursive(p string) error {
    fi, err := s.sftpClient.Stat(p)
    if err != nil {
        return err
    }
    if fi.IsDir() {
        infos, err := s.sftpClient.ReadDir(p)
        if err != nil {
            return err
        }
        for _, info := range infos {
            childPath := path.Join(p, info.Name())
            if err := s.rmRecursive(childPath); err != nil {
                return err
            }
        }
        return s.sftpClient.RemoveDirectory(p)
    }
    return s.sftpClient.Remove(p)
}
```

#### 1.14 新增：供 App 调用的公开方法

```go
// ListRemote lists remote files at dir. Returns files, cwd, error.
func (s *SFTPSession) ListRemote(dir string) ([]FileItem, string, error) {
    if dir == "" {
        dir = s.cwd
    } else if !path.IsAbs(dir) {
        dir = path.Join(s.cwd, dir)
    }
    infos, err := s.sftpClient.ReadDir(dir)
    if err != nil {
        return nil, "", err
    }
    files := make([]FileItem, 0, len(infos))
    for _, fi := range infos {
        files = append(files, FileItem{
            Name:    fi.Name(),
            Size:    fi.Size(),
            ModTime: fi.ModTime().Format(time.RFC3339),
            Mode:    fi.Mode().String(),
            IsDir:   fi.IsDir(),
        })
    }
    return files, dir, nil
}

// ListLocal lists local files at dir. Returns files, cwd, error.
func (s *SFTPSession) ListLocal(dir string) ([]FileItem, string, error) {
    if dir == "" {
        dir = s.localCwd
    } else if !filepath.IsAbs(dir) {
        dir = filepath.Join(s.localCwd, dir)
    }
    entries, err := os.ReadDir(dir)
    if err != nil {
        return nil, "", err
    }
    files := make([]FileItem, 0, len(entries))
    for _, e := range entries {
        fi, _ := e.Info()
        var size int64
        var mode os.FileMode
        var modTime time.Time
        if fi != nil {
            size = fi.Size()
            mode = fi.Mode()
            modTime = fi.ModTime()
        }
        files = append(files, FileItem{
            Name:    e.Name(),
            Size:    size,
            ModTime: modTime.Format(time.RFC3339),
            Mode:    mode.String(),
            IsDir:   e.IsDir(),
        })
    }
    return files, dir, nil
}

// ChangeRemoteDir changes remote working directory and returns new file list.
func (s *SFTPSession) ChangeRemoteDir(dir string) ([]FileItem, string, error) {
    target := dir
    if !path.IsAbs(dir) {
        target = path.Join(s.cwd, dir)
    }
    fi, err := s.sftpClient.Stat(target)
    if err != nil {
        return nil, "", fmt.Errorf("no such directory: %s", target)
    }
    if !fi.IsDir() {
        return nil, "", fmt.Errorf("not a directory: %s", target)
    }
    real, _ := s.sftpClient.RealPath(target)
    s.mu.Lock()
    s.cwd = real
    s.mu.Unlock()
    return s.ListRemote(real)
}

// ChangeLocalDir changes local working directory and returns new file list.
func (s *SFTPSession) ChangeLocalDir(dir string) ([]FileItem, string, error) {
    target := dir
    if !filepath.IsAbs(dir) {
        target = filepath.Join(s.localCwd, dir)
    }
    fi, err := os.Stat(target)
    if err != nil {
        return nil, "", fmt.Errorf("no such directory: %s", target)
    }
    if !fi.IsDir() {
        return nil, "", fmt.Errorf("not a directory: %s", target)
    }
    abs, _ := filepath.Abs(target)
    s.mu.Lock()
    s.localCwd = abs
    s.mu.Unlock()
    return s.ListLocal(abs)
}

// MakeDir creates a remote directory.
func (s *SFTPSession) MakeDir(dir string) error {
    p := dir
    if !path.IsAbs(p) {
        p = path.Join(s.cwd, p)
    }
    return s.sftpClient.Mkdir(p)
}

// Remove removes a remote file or directory.
func (s *SFTPSession) Remove(p string, recursive bool) error {
    if !path.IsAbs(p) {
        p = path.Join(s.cwd, p)
    }
    if recursive {
        return s.rmRecursive(p)
    }
    fi, err := s.sftpClient.Stat(p)
    if err != nil {
        return err
    }
    if fi.IsDir() {
        // Check if empty
        infos, err := s.sftpClient.ReadDir(p)
        if err != nil {
            return err
        }
        if len(infos) > 0 {
            return fmt.Errorf("directory not empty (%d items), use recursive=true", len(infos))
        }
        return s.sftpClient.RemoveDirectory(p)
    }
    return s.sftpClient.Remove(p)
}

// Rename renames a remote file.
func (s *SFTPSession) Rename(oldName, newName string) error {
    old := oldName
    if !path.IsAbs(old) {
        old = path.Join(s.cwd, old)
    }
    newPath := newName
    if !path.IsAbs(newPath) {
        newPath = path.Join(s.cwd, newPath)
    }
    return s.sftpClient.Rename(old, newPath)
}

// Chmod changes permissions on a remote file.
func (s *SFTPSession) Chmod(p string, mode os.FileMode) error {
    if !path.IsAbs(p) {
        p = path.Join(s.cwd, p)
    }
    return s.sftpClient.Chmod(p, mode)
}

// Get starts a download. Returns task ID for progress tracking.
func (s *SFTPSession) Get(remotePath, localPath string, recursive bool) (string, error) {
    rp := remotePath
    if !path.IsAbs(rp) {
        rp = path.Join(s.cwd, rp)
    }
    lp := localPath
    if !filepath.IsAbs(lp) {
        lp = filepath.Join(s.localCwd, lp)
    }
    if recursive {
        total, err := s.dirSizeRemote(rp)
        if err != nil {
            return "", err
        }
        task := &TransferTask{
            ID:         fmt.Sprintf("dl-%d", time.Now().UnixNano()),
            Type:       "download",
            LocalPath:  lp,
            RemotePath: rp,
            Total:      total,
            Status:     "running",
        }
        s.emitTransferStart(task)
        go func() {
            if err := s.downloadDir(rp, lp, task); err != nil {
                task.Status = "error"
                s.emitTransferEvent(task, err)
                return
            }
            task.Status = "done"
            s.emitTransferComplete(task)
        }()
        return task.ID, nil
    }
    task := &TransferTask{
        ID:         fmt.Sprintf("dl-%d", time.Now().UnixNano()),
        Type:       "download",
        LocalPath:  lp,
        RemotePath: rp,
        Status:     "pending",
    }
    s.startTransfer(task)
    return task.ID, nil
}

// Put starts an upload. Returns task ID for progress tracking.
func (s *SFTPSession) Put(localPath, remotePath string, recursive bool) (string, error) {
    lp := localPath
    if !filepath.IsAbs(lp) {
        lp = filepath.Join(s.localCwd, lp)
    }
    rp := remotePath
    if !path.IsAbs(rp) {
        rp = path.Join(s.cwd, rp)
    }
    if recursive {
        total, err := s.dirSizeLocal(lp)
        if err != nil {
            return "", err
        }
        task := &TransferTask{
            ID:         fmt.Sprintf("ul-%d", time.Now().UnixNano()),
            Type:       "upload",
            LocalPath:  lp,
            RemotePath: rp,
            Total:      total,
            Status:     "running",
        }
        s.emitTransferStart(task)
        go func() {
            if err := s.uploadDir(lp, rp, task); err != nil {
                task.Status = "error"
                s.emitTransferEvent(task, err)
                return
            }
            task.Status = "done"
            s.emitTransferComplete(task)
        }()
        return task.ID, nil
    }
    task := &TransferTask{
        ID:         fmt.Sprintf("ul-%d", time.Now().UnixNano()),
        Type:       "upload",
        LocalPath:  lp,
        RemotePath: rp,
        Status:     "pending",
    }
    s.startTransfer(task)
    return task.ID, nil
}
```

#### 1.15 保留 emitTransfer* 函数

`emitTransferStart`, `emitTransferProgress`, `emitTransferComplete`, `emitTransferEvent` 保持不变。

- [ ] **Step 1: 用 Write 工具写入完整的 sftp_session.go 文件**
- [ ] **Step 2: 运行 `go build ./...` 验证编译**
- [ ] **Step 3: 运行 `git add backend/session/sftp_session.go && git commit -m "refactor(sftp): remove command-line parsing, add direct API methods"`**

---

### Task 2: 在 app.go 中新增 Wails 绑定方法

**Files:**
- Modify: `app.go`

#### 2.1 新增导入

在 import 中增加 `"strconv"`, `"os"`, `"path/filepath"`。

#### 2.2 新增 FileItem 导出类型（如需）

Wails 要求绑定方法的参数和返回值类型能被 JSON 序列化。FileItem 已在 sftp_session.go 中定义，可用于返回值。

#### 2.3 新增 10 个 Wails 绑定方法

在 app.go 末尾（ChatCompletion 方法之后）新增：

```go
// SFTP direct API methods — called from frontend without terminal layer

func (a *App) SftpListRemote(sessionID, dir string) ([]session.FileItem, string, error) {
    s, ok := a.sessionManager.Get(sessionID)
    if !ok {
        return nil, "", fmt.Errorf("session not found: %s", sessionID)
    }
    sftp, ok := s.(*session.SFTPSession)
    if !ok {
        return nil, "", fmt.Errorf("session is not SFTP")
    }
    return sftp.ListRemote(dir)
}

func (a *App) SftpListLocal(sessionID, dir string) ([]session.FileItem, string, error) {
    s, ok := a.sessionManager.Get(sessionID)
    if !ok {
        return nil, "", fmt.Errorf("session not found: %s", sessionID)
    }
    sftp, ok := s.(*session.SFTPSession)
    if !ok {
        return nil, "", fmt.Errorf("session is not SFTP")
    }
    return sftp.ListLocal(dir)
}

func (a *App) SftpChangeRemoteDir(sessionID, dir string) ([]session.FileItem, string, error) {
    s, ok := a.sessionManager.Get(sessionID)
    if !ok {
        return nil, "", fmt.Errorf("session not found: %s", sessionID)
    }
    sftp, ok := s.(*session.SFTPSession)
    if !ok {
        return nil, "", fmt.Errorf("session is not SFTP")
    }
    return sftp.ChangeRemoteDir(dir)
}

func (a *App) SftpChangeLocalDir(sessionID, dir string) ([]session.FileItem, string, error) {
    s, ok := a.sessionManager.Get(sessionID)
    if !ok {
        return nil, "", fmt.Errorf("session not found: %s", sessionID)
    }
    sftp, ok := s.(*session.SFTPSession)
    if !ok {
        return nil, "", fmt.Errorf("session is not SFTP")
    }
    return sftp.ChangeLocalDir(dir)
}

func (a *App) SftpMakeDir(sessionID, dir string) error {
    s, ok := a.sessionManager.Get(sessionID)
    if !ok {
        return fmt.Errorf("session not found: %s", sessionID)
    }
    sftp, ok := s.(*session.SFTPSession)
    if !ok {
        return fmt.Errorf("session is not SFTP")
    }
    return sftp.MakeDir(dir)
}

func (a *App) SftpRemove(sessionID, path string, recursive bool) error {
    s, ok := a.sessionManager.Get(sessionID)
    if !ok {
        return fmt.Errorf("session not found: %s", sessionID)
    }
    sftp, ok := s.(*session.SFTPSession)
    if !ok {
        return fmt.Errorf("session is not SFTP")
    }
    return sftp.Remove(path, recursive)
}

func (a *App) SftpRename(sessionID, oldPath, newPath string) error {
    s, ok := a.sessionManager.Get(sessionID)
    if !ok {
        return fmt.Errorf("session not found: %s", sessionID)
    }
    sftp, ok := s.(*session.SFTPSession)
    if !ok {
        return fmt.Errorf("session is not SFTP")
    }
    return sftp.Rename(oldPath, newPath)
}

func (a *App) SftpChmod(sessionID, path, mode string) error {
    s, ok := a.sessionManager.Get(sessionID)
    if !ok {
        return fmt.Errorf("session not found: %s", sessionID)
    }
    sftp, ok := s.(*session.SFTPSession)
    if !ok {
        return fmt.Errorf("session is not SFTP")
    }
    modeUint, err := strconv.ParseUint(mode, 8, 32)
    if err != nil {
        return fmt.Errorf("invalid mode: %s", mode)
    }
    return sftp.Chmod(path, os.FileMode(modeUint))
}

func (a *App) SftpGet(sessionID, remotePath, localPath string, recursive bool) (string, error) {
    s, ok := a.sessionManager.Get(sessionID)
    if !ok {
        return "", fmt.Errorf("session not found: %s", sessionID)
    }
    sftp, ok := s.(*session.SFTPSession)
    if !ok {
        return "", fmt.Errorf("session is not SFTP")
    }
    return sftp.Get(remotePath, localPath, recursive)
}

func (a *App) SftpPut(sessionID, localPath, remotePath string, recursive bool) (string, error) {
    s, ok := a.sessionManager.Get(sessionID)
    if !ok {
        return "", fmt.Errorf("session not found: %s", sessionID)
    }
    sftp, ok := s.(*session.SFTPSession)
    if !ok {
        return "", fmt.Errorf("session is not SFTP")
    }
    return sftp.Put(localPath, remotePath, recursive)
}
```

- [ ] **Step 1: 在 app.go 末尾新增上述方法**
- [ ] **Step 2: 运行 `go build ./...` 验证编译**
- [ ] **Step 3: 运行 `git add app.go && git commit -m "feat(sftp): add Wails bindings for direct SFTP API"`**

---

### Task 3: 重构前端 SFTPTabContent.vue

**Files:**
- Modify: `frontend/src/components/SFTPTabContent.vue`

#### 3.1 模板变更

删除第 38-40 行：
```html
    <div class="command-line-area">
      <BaseTerminal mode="sftp" :session-id="panel?.sessionId" />
    </div>
```

#### 3.2 导入变更

- 删除 `import { SessionWrite } from '../../wailsjs/go/main/App'`
- 删除 `import BaseTerminal from './BaseTerminal.vue'`
- 新增：
```typescript
import {
  SftpListRemote, SftpListLocal,
  SftpChangeRemoteDir, SftpChangeLocalDir,
  SftpMakeDir, SftpRemove, SftpRename, SftpChmod,
  SftpGet, SftpPut
} from '../../wailsjs/go/main/App'
```

#### 3.3 删除函数

删除 `sendCommand()` 和 `quoteArg()`。

#### 3.4 重写事件处理函数

```typescript
// Replace: function onRefreshLocal() { sendCommand(`lls ${localCwd.value}`) }
async function onRefreshLocal() {
  const sid = panel.value?.sessionId
  if (!sid) return
  try {
    const [files, dir] = await SftpListLocal(sid, '')
    localFiles.value = files
    localCwd.value = dir
  } catch (e: any) {}
}

// Replace: function onRefreshRemote() { sendCommand(`ls ${cwd.value}`) }
async function onRefreshRemote() {
  const sid = panel.value?.sessionId
  if (!sid) return
  try {
    const [files, dir] = await SftpListRemote(sid, '')
    remoteFiles.value = files
    cwd.value = dir
  } catch (e: any) {}
}

// Replace onLocalNavigate
async function onLocalNavigate(path: string) {
  const sid = panel.value?.sessionId
  if (!sid) return
  let fullPath: string
  if (path === '..') {
    const parts = localCwd.value.replace(/\\/g, '/').split('/').filter(Boolean)
    parts.pop()
    if (parts.length === 0) {
      fullPath = localCwd.value
    } else if (/^[A-Za-z]:$/.test(parts[0])) {
      fullPath = parts[0] + '\\'
    } else {
      fullPath = '/' + parts.join('/')
    }
  } else if (!path.startsWith('/') && !/^[A-Za-z]:/.test(path)) {
    fullPath = joinPath(localCwd.value, path)
  } else {
    fullPath = path
  }
  try {
    const [files, dir] = await SftpChangeLocalDir(sid, fullPath)
    localFiles.value = files
    localCwd.value = dir
  } catch (e: any) {}
}

// Replace onRemoteNavigate
async function onRemoteNavigate(path: string) {
  const sid = panel.value?.sessionId
  if (!sid) return
  let fullPath: string
  if (path === '..') {
    fullPath = cwd.value.split('/').filter(Boolean).slice(0, -1).join('/')
    fullPath = '/' + fullPath
  } else if (!path.startsWith('/')) {
    fullPath = joinPath(cwd.value, path)
  } else {
    fullPath = path
  }
  try {
    const [files, dir] = await SftpChangeRemoteDir(sid, fullPath)
    remoteFiles.value = files
    cwd.value = dir
  } catch (e: any) {}
}
```

#### 3.5 重写 onSendToRemote / onSendToLocal

```typescript
function onSendToRemote(items: FileItem[]) {
  const sid = panel.value?.sessionId
  if (!sid) return
  for (const item of items) {
    if (item.name === '..') continue
    const localPath = joinPath(localCwd.value, item.name)
    const remotePath = cwd.value + '/' + item.name
    SftpPut(sid, localPath, remotePath, item.isDir)
  }
}

function onSendToLocal(items: FileItem[]) {
  const sid = panel.value?.sessionId
  if (!sid) return
  for (const item of items) {
    if (item.name === '..') continue
    const remotePath = joinPath(cwd.value, item.name)
    const localPath = joinPath(localCwd.value, item.name).replace(/\\/g, '/')
    SftpGet(sid, remotePath, localPath, item.isDir)
  }
}
```

#### 3.6 重写 onDialogConfirm

将 `sendCommand` 调用替换为直接调用：

```typescript
async function onDialogConfirm() {
  dialogVisible.value = false
  const sid = panel.value?.sessionId
  if (!sid) return
  const baseDir = cwd.value
  switch (dialogType.value) {
    case 'rename':
      if (dialogInput.value && dialogInput.value !== dialogItem.value?.name) {
        const oldPath = joinPath(baseDir, dialogItem.value!.name)
        const newPath = joinPath(baseDir, dialogInput.value)
        try {
          await SftpRename(sid, oldPath, newPath)
          onRefreshRemote()
        } catch (e: any) {}
      }
      break
    case 'mkdir':
      if (dialogInput.value) {
        try {
          await SftpMakeDir(sid, joinPath(baseDir, dialogInput.value))
          onRefreshRemote()
        } catch (e: any) {}
      }
      break
    case 'chmod':
      if (dialogInput.value) {
        try {
          await SftpChmod(sid, joinPath(baseDir, dialogItem.value!.name), dialogInput.value)
          onRefreshRemote()
        } catch (e: any) {}
      }
      break
    case 'delete':
      for (const item of dialogItems.value) {
        const itemPath = joinPath(baseDir, item.name)
        try {
          await SftpRemove(sid, itemPath, item.isDir)
        } catch (e: any) {}
      }
      onRefreshRemote()
      break
  }
}
```

#### 3.7 重写 onDropLocal / onDropRemote

```typescript
function onDropLocal(e: DragEvent) {
  e.preventDefault()
  const data = e.dataTransfer?.getData('application/sftp-file')
  if (!data) return
  try {
    const item = JSON.parse(data)
    if (item.mode === 'remote') {
      const remotePath = joinPath(cwd.value, item.name)
      const localPath = joinPath(localCwd.value, item.name).replace(/\\/g, '/')
      SftpGet(panel.value?.sessionId!, remotePath, localPath, item.isDir)
    }
  } catch {}
}

function onDropRemote(e: DragEvent) {
  e.preventDefault()
  const data = e.dataTransfer?.getData('application/sftp-file')
  if (!data) return
  try {
    const item = JSON.parse(data)
    if (item.mode === 'local') {
      const localPath = joinPath(localCwd.value, item.name)
      const remotePath = cwd.value + '/' + item.name
      SftpPut(panel.value?.sessionId!, localPath, remotePath, item.isDir)
    }
  } catch {}
}
```

#### 3.8 简化 EventsOn('session:data') 处理器

移除 `sftp:filelist` / `sftp:locallist` 处理分支，只保留 `sftp:transfer`：

```typescript
unsubscribe = EventsOn('session:data', (payload: { id: string; data: string }) => {
    if (payload.id !== panel.value?.sessionId) return
    const match = payload.data.match(/\x1b\]633;S([^\x07]*)\x07/)
    if (!match) return
    try {
      const msg = JSON.parse(match[1])
      if (msg.type === 'sftp:transfer') {
        if (msg.event === 'start') {
          transferTasks.value.push({
            id: msg.taskId,
            type: msg.tfType,
            name: msg.name,
            percentage: 0,
            status: 'running'
          })
        } else if (msg.event === 'progress') {
          const existing = transferTasks.value.find(t => t.id === msg.taskId)
          if (existing) {
            existing.percentage = msg.total > 0 ? Math.round((msg.progress / msg.total) * 100) : 0
          }
        } else if (msg.event === 'complete') {
          const existing = transferTasks.value.find(t => t.id === msg.taskId)
          if (existing) {
            existing.status = msg.status === 'done' ? 'done' : 'error'
            existing.percentage = msg.status === 'done' ? 100 : existing.percentage
            setTimeout(() => {
              transferTasks.value = transferTasks.value.filter(t => t.id !== msg.taskId)
            }, 3000)
          }
        }
      }
    } catch {}
  })
```

#### 3.9 CSS 变更

- `.panes-area` 的 `flex: 3` → `flex: 1`
- 删除 `.command-line-area` 规则

- [ ] **Step 1: 完成上述所有模板、脚本、CSS 修改**
- [ ] **Step 2: 运行 `cd frontend && npm run build` 验证编译**
- [ ] **Step 3: 运行 `git add frontend/src/components/SFTPTabContent.vue && git commit -m "refactor(sftp): remove BaseTerminal, use direct Wails bindings"`**

---

### Task 4: 更新 agent.ts — 移除 SFTP 终端上下文

**Files:**
- Modify: `frontend/src/services/agent.ts`

#### 4.1 删除第 90-95 行

删除 SFTP 类型分支：
```typescript
  if (activePanel.type === 'sftp') {
    parts.push('This is an SFTP command line session.')
    parts.push('Available commands: ls, cd, pwd, get [-r], put [-r], mkdir, rm [-r], rmdir [-r], rename, chmod, lls, lcd, lpwd, help')
    parts.push('Current remote path: /')
    parts.push('Current local path: .')
  }
```

- [ ] **Step 1: 删除上述代码块**
- [ ] **Step 2: 运行 `cd frontend && npm run build` 验证编译**
- [ ] **Step 3: 运行 `git add frontend/src/services/agent.ts && git commit -m "refactor(agent): remove SFTP terminal context"`**

---

### Task 5: 完整构建和验证

**Files:**
- Run: build commands

- [ ] **Step 1: 运行 `go build ./...` 验证 Go 编译**
- [ ] **Step 2: 运行 `cd frontend && npm run build` 验证前端编译**
- [ ] **Step 3: 运行 `wails dev` 启动应用进行冒烟测试**
- [ ] **Step 4: 验证通过后提交：`git commit -m "chore: verify build after SFTP terminal removal"` (如有必要)**
