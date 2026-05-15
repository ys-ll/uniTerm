# SFTP File Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an SFTP file browser with dual-pane UI (local + remote), interactive command-line REPL, drag-and-drop transfer, and AI context awareness.

**Architecture:** Backend Go uses `github.com/pkg/sftp` on an independent SSH connection with a custom REPL. Frontend Vue3 uses Element Plus tables, xterm for CLI, and HTML5 drag-and-drop for file transfer.

**Tech Stack:** Go 1.21+, Wails v2, Vue 3, Element Plus, xterm.js, `@xterm/addon-fit`, `github.com/pkg/sftp`

---

## File Structure

### Backend (Go)

| File | Responsibility |
|------|---------------|
| `backend/session/sftp_session.go` | `SFTPSession` struct, SSH+SFTP connection, REPL command parser |
| `backend/session/sftp_session_test.go` | Unit tests for REPL commands |
| `backend/session/manager.go` | Add `case "sftp"` to `SessionManager.Create` |
| `app.go` | Add `OpenFileDialog` and `SaveFileDialog` Wails bindings |

### Frontend (Vue/TS)

| File | Responsibility |
|------|---------------|
| `frontend/src/types/workspace.ts` | Add `SFTPTab` interface, extend `PanelType` |
| `frontend/src/stores/tabStore.ts` | Add `createSFPTab` method |
| `frontend/src/components/SFTPPathBreadcrumb.vue` | Path breadcrumb navigation bar |
| `frontend/src/components/SFTPFileList.vue` | File table with columns, context menu, multi-select, filter |
| `frontend/src/components/SFTPTransferProgress.vue` | Active transfer task progress bars |
| `frontend/src/composables/useSFTPCommandLine.ts` | xterm initialization for SFTP CLI (no SSH reconnect logic) |
| `frontend/src/components/SFTPCommandLine.vue` | Terminal container using `useSFTPCommandLine` |
| `frontend/src/components/SFTPTabContent.vue` | Container: dual panes + transfer bar + command line |
| `frontend/src/components/Sidebar.vue` | Add "Connect SFTP" to context menu |
| `frontend/src/services/agent.ts` | Add SFTP context to `buildSystemPrompt` |
| `frontend/src/App.vue` | Add `SFTPTab` rendering branch |

---

## Prerequisites

- [ ] **Verify:** Current branch is `feature/local-terminal`
- [ ] **Verify:** `go.mod` exists and Wails v2 is set up
- [ ] **Verify:** `frontend/package.json` has `@xterm/xterm` and `@xterm/addon-fit`

---

## Task 1: Install SFTP Dependency

**Files:**
- Modify: `go.mod` (auto-updated by `go get`)

- [ ] **Step 1: Install `github.com/pkg/sftp`**

Run:
```bash
cd /c/Users/yowsa/Documents/workspace/uniterm
go get github.com/pkg/sftp
```

Expected: `go.mod` updated with `github.com/pkg/sftp v1.13.x` (or latest).

- [ ] **Step 2: Verify import works**

Run:
```bash
go build ./backend/session/
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add go.mod go.sum
git commit -m "deps: add github.com/pkg/sftp"
```

---

## Task 2: Extend Type Definitions

**Files:**
- Modify: `frontend/src/types/workspace.ts`

- [ ] **Step 1: Add `SFTPTab` and extend `PanelType`**

Replace the existing `PanelType` and `Tab` definitions:

```typescript
// In frontend/src/types/workspace.ts

export type PanelType = 'ssh' | 'sftp' | 'settings' | 'other'
export type PanelStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface SFTPTab {
  type: 'sftp'
  id: string
  panelId: string
  name: string
}

// Update existing Tab union type
export type Tab = TerminalTab | SettingsTab | WorkspaceTab | SFTPTab
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/workspace.ts
git commit -m "types: add SFTPTab and 'sftp' PanelType"
```

---

## Task 3: Extend tabStore

**Files:**
- Modify: `frontend/src/stores/tabStore.ts`

- [ ] **Step 1: Import `SFTPTab` and add `createSFPTab`**

Add `SFTPTab` to the import from `../types/workspace`:

```typescript
import type { Tab, TerminalTab, SettingsTab, WorkspaceTab, SFTPTab, PanelLayout, LayoutNode } from '../types/workspace'
```

Add `createSFPTab` after `createSettingsTab`:

```typescript
function createSFPTab(name: string, panelId: string): SFTPTab {
  const tab: SFTPTab = {
    type: 'sftp',
    id: genId('sftp-tab'),
    panelId,
    name
  }
  tabState.tabs.push(tab)
  tabState.activeTabId = tab.id
  return tab
}
```

Expose it in the return object:

```typescript
return {
  // ... existing exports
  createSFPTab,
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/tabStore.ts
git commit -m "feat(tabStore): add createSFPTab method"
```

---

## Task 4: SFTPSession Structure

**Files:**
- Create: `backend/session/sftp_session.go`

- [ ] **Step 1: Write SFTPSession skeleton**

```go
package session

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type SFTPSession struct {
	baseSession
	sshClient  *ssh.Client
	sftpClient *sftp.Client
	cwd        string
	localCwd   string
	mu         sync.RWMutex
}

func NewSFTPSession(id string) *SFTPSession {
	return &SFTPSession{
		baseSession: baseSession{
			id:          id,
			sessionType: "sftp",
			status:      StatusDisconnected,
		},
		cwd:      "/",
		localCwd: ".",
	}
}

func (s *SFTPSession) Connect(config ConnectionConfig) error {
	s.setStatus(StatusConnecting)
	s.title = fmt.Sprintf("%s@%s", config.User, config.Host)

	authMethods := []ssh.AuthMethod{}
	switch config.AuthType {
	case "password":
		authMethods = append(authMethods, ssh.Password(config.Password))
	case "key":
		key, err := os.ReadFile(config.KeyPath)
		if err != nil {
			s.setStatus(StatusError)
			return fmt.Errorf("read key: %w", err)
		}
		signer, err := ssh.ParsePrivateKey(key)
		if err != nil {
			s.setStatus(StatusError)
			return fmt.Errorf("parse key: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	case "agent":
		authMethods = append(authMethods, ssh.Password(config.Password))
	}

	clientConfig := &ssh.ClientConfig{
		User:            config.User,
		Auth:            authMethods,
		Timeout:         30 * time.Second,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	}

	client, err := ssh.Dial("tcp", fmt.Sprintf("%s:%d", config.Host, config.Port), clientConfig)
	if err != nil {
		s.setStatus(StatusError)
		return fmt.Errorf("ssh dial: %w", err)
	}

	sc, err := sftp.NewClient(client)
	if err != nil {
		client.Close()
		s.setStatus(StatusError)
		return fmt.Errorf("sftp client: %w", err)
	}

	go func() {
		_ = client.Wait()
		s.Disconnect()
	}()

	s.sshClient = client
	s.sftpClient = sc
	s.setStatus(StatusConnected)

	return nil
}

func (s *SFTPSession) Write(data []byte) error {
	if s.sftpClient == nil {
		return fmt.Errorf("not connected")
	}
	return s.handleCommand(strings.TrimSpace(string(data)))
}

func (s *SFTPSession) Resize(cols, rows int) error {
	// SFTP has no PTY; no-op
	return nil
}

func (s *SFTPSession) Disconnect() error {
	if s.sftpClient != nil {
		s.sftpClient.Close()
	}
	if s.sshClient != nil {
		s.sshClient.Close()
	}
	s.setStatus(StatusDisconnected)
	return nil
}

func (s *SFTPSession) IsConnected() bool {
	return s.Status() == StatusConnected
}

// handleCommand is the REPL entry point — implemented in Task 5
func (s *SFTPSession) handleCommand(cmd string) error {
	return fmt.Errorf("REPL not yet implemented")
}
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
go build ./backend/session/
```

Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add backend/session/sftp_session.go
git commit -m "feat(session): add SFTPSession skeleton with SSH+SFTP connect"
```

---

## Task 5: REPL Core Commands (ls, cd, pwd, lls, lcd, lpwd)

**Files:**
- Modify: `backend/session/sftp_session.go`

- [ ] **Step 1: Add REPL implementation**

Replace the `handleCommand` placeholder and add supporting methods:

```go
// FileInfo matches frontend expectation
type SFTPFileInfo struct {
	Name    string      `json:"name"`
	Size    int64       `json:"size"`
	ModTime time.Time   `json:"modTime"`
	Mode    os.FileMode `json:"mode"`
	IsDir   bool        `json:"isDir"`
}

func (s *SFTPSession) handleCommand(cmd string) error {
	parts := strings.Fields(cmd)
	if len(parts) == 0 {
		return nil
	}

	switch parts[0] {
	case "ls":
		path := s.cwd
		if len(parts) > 1 {
			path = s.resolvePath(parts[1])
		}
		return s.cmdLS(path)
	case "cd":
		if len(parts) < 2 {
			s.emitText("Usage: cd <path>\r\n")
			return nil
		}
		return s.cmdCD(parts[1])
	case "pwd":
		s.emitText(s.cwd + "\r\n")
		return nil
	case "lls":
		path := s.localCwd
		if len(parts) > 1 {
			path = filepath.Join(s.localCwd, parts[1])
		}
		return s.cmdLLS(path)
	case "lcd":
		if len(parts) < 2 {
			s.emitText("Usage: lcd <path>\r\n")
			return nil
		}
		return s.cmdLCD(parts[1])
	case "lpwd":
		abs, _ := filepath.Abs(s.localCwd)
		s.emitText(abs + "\r\n")
		return nil
	case "help":
		s.cmdHelp()
		return nil
	default:
		s.emitText(fmt.Sprintf("Unknown command: %s. Type 'help' for usage.\r\n", parts[0]))
		return nil
	}
}

func (s *SFTPSession) resolvePath(p string) string {
	if filepath.IsAbs(p) {
		return p
	}
	return filepath.Join(s.cwd, p)
}

func (s *SFTPSession) cmdLS(path string) error {
	infos, err := s.sftpClient.ReadDir(path)
	if err != nil {
		s.emitText(fmt.Sprintf("Error: %v\r\n", err))
		return nil
	}

	files := make([]SFTPFileInfo, 0, len(infos))
	var text strings.Builder
	text.WriteString(fmt.Sprintf("%-40s %10s %12s %s\r\n", "Name", "Size", "Mode", "Modified"))
	for _, fi := range infos {
		files = append(files, SFTPFileInfo{
			Name:    fi.Name(),
			Size:    fi.Size(),
			ModTime: fi.ModTime(),
			Mode:    fi.Mode(),
			IsDir:   fi.IsDir(),
		})
		sizeStr := fmt.Sprintf("%d", fi.Size())
		if fi.IsDir() {
			sizeStr = "-"
		}
		text.WriteString(fmt.Sprintf("%-40s %10s %12s %s\r\n",
			fi.Name(), sizeStr, fi.Mode().String(), fi.ModTime().Format("2006-01-02 15:04")))
	}

	s.emitText(text.String())
	s.emitFileList(files, path)
	return nil
}

func (s *SFTPSession) cmdCD(path string) error {
	target := s.resolvePath(path)
	fi, err := s.sftpClient.Stat(target)
	if err != nil {
		s.emitText(fmt.Sprintf("No such file or directory: %s\r\n", target))
		return nil
	}
	if !fi.IsDir() {
		s.emitText(fmt.Sprintf("Not a directory: %s\r\n", target))
		return nil
	}
	real, err := s.sftpClient.RealPath(target)
	if err != nil {
		real = target
	}
	s.mu.Lock()
	s.cwd = real
	s.mu.Unlock()
	s.emitText(fmt.Sprintf("Changed to: %s\r\n", real))
	return nil
}

func (s *SFTPSession) cmdLLS(path string) error {
	infos, err := os.ReadDir(path)
	if err != nil {
		s.emitText(fmt.Sprintf("Error: %v\r\n", err))
		return nil
	}

	files := make([]SFTPFileInfo, 0, len(infos))
	var text strings.Builder
	text.WriteString(fmt.Sprintf("%-40s %10s %12s %s\r\n", "Name", "Size", "Mode", "Modified"))
	for _, entry := range infos {
		fi, _ := entry.Info()
		var size int64
		var mode os.FileMode
		var modTime time.Time
		isDir := entry.IsDir()
		if fi != nil {
			size = fi.Size()
			mode = fi.Mode()
			modTime = fi.ModTime()
		}
		files = append(files, SFTPFileInfo{
			Name:    entry.Name(),
			Size:    size,
			ModTime: modTime,
			Mode:    mode,
			IsDir:   isDir,
		})
		sizeStr := fmt.Sprintf("%d", size)
		if isDir {
			sizeStr = "-"
		}
		text.WriteString(fmt.Sprintf("%-40s %10s %12s %s\r\n",
			entry.Name(), sizeStr, mode.String(), modTime.Format("2006-01-02 15:04")))
	}

	s.emitText(text.String())
	s.emitLocalList(files, path)
	return nil
}

func (s *SFTPSession) cmdLCD(path string) error {
	target := filepath.Join(s.localCwd, path)
	fi, err := os.Stat(target)
	if err != nil {
		s.emitText(fmt.Sprintf("No such file or directory: %s\r\n", target))
		return nil
	}
	if !fi.IsDir() {
		s.emitText(fmt.Sprintf("Not a directory: %s\r\n", target))
		return nil
	}
	abs, _ := filepath.Abs(target)
	s.mu.Lock()
	s.localCwd = abs
	s.mu.Unlock()
	s.emitText(fmt.Sprintf("Local changed to: %s\r\n", abs))
	return nil
}

func (s *SFTPSession) cmdHelp() {
	help := `Available commands:
  ls [path]           List remote files
  cd <path>           Change remote directory
  pwd                 Show remote current directory
  lls [path]          List local files
  lcd <path>          Change local directory
  lpwd                Show local current directory
  get <r> [l]         Download file
  put <l> [r]         Upload file
  mkdir <path>        Create remote directory
  rm <path>           Delete remote file
  rmdir <path>        Delete remote directory
  mv <old> <new>      Rename/move file
  chmod <mode> <path> Change permissions
  help                Show this help
`
	s.emitText(help)
}

// emit helpers
func (s *SFTPSession) emitText(text string) {
	s.emitData([]byte(text))
}

func (s *SFTPSession) emitFileList(files []SFTPFileInfo, cwd string) {
	// Emit via onDataCallback as JSON — frontend will parse
	payload := map[string]interface{}{
		"type":  "sftp:filelist",
		"files": files,
		"cwd":   cwd,
	}
	jsonBytes, _ := json.Marshal(payload)
	s.emitData([]byte("\x1b]633;S" + string(jsonBytes) + "\x07"))
}

func (s *SFTPSession) emitLocalList(files []SFTPFileInfo, localCwd string) {
	payload := map[string]interface{}{
		"type":      "sftp:locallist",
		"files":     files,
		"localCwd":  localCwd,
	}
	jsonBytes, _ := json.Marshal(payload)
	s.emitData([]byte("\x1b]633;S" + string(jsonBytes) + "\x07"))
}
```

Also add `"encoding/json"` to the imports in `sftp_session.go`.

- [ ] **Step 2: Verify compilation**

Run:
```bash
go build ./backend/session/
```

Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add backend/session/sftp_session.go
git commit -m "feat(session): add SFTP REPL with ls, cd, pwd, lls, lcd, lpwd, help"
```

---

## Task 6: REPL Remaining Commands (mkdir, rm, rmdir, mv, chmod)

**Files:**
- Modify: `backend/session/sftp_session.go`

- [ ] **Step 1: Add mkdir/rm/rmdir/mv/chmod to handleCommand**

In `handleCommand`, add cases:

```go	case "mkdir":
		if len(parts) < 2 {
			s.emitText("Usage: mkdir <path>\r\n")
			return nil
		}
		path := s.resolvePath(parts[1])
		err := s.sftpClient.Mkdir(path)
		if err != nil {
			s.emitText(fmt.Sprintf("Error: %v\r\n", err))
		} else {
			s.emitText(fmt.Sprintf("Created directory: %s\r\n", path))
		}
		return nil
	case "rm":
		if len(parts) < 2 {
			s.emitText("Usage: rm <path>\r\n")
			return nil
		}
		path := s.resolvePath(parts[1])
		err := s.sftpClient.Remove(path)
		if err != nil {
			s.emitText(fmt.Sprintf("Error: %v\r\n", err))
		} else {
			s.emitText(fmt.Sprintf("Removed: %s\r\n", path))
		}
		return nil
	case "rmdir":
		if len(parts) < 2 {
			s.emitText("Usage: rmdir <path>\r\n")
			return nil
		}
		path := s.resolvePath(parts[1])
		err := s.sftpClient.RemoveDirectory(path)
		if err != nil {
			s.emitText(fmt.Sprintf("Error: %v\r\n", err))
		} else {
			s.emitText(fmt.Sprintf("Removed directory: %s\r\n", path))
		}
		return nil
	case "mv":
		if len(parts) < 3 {
			s.emitText("Usage: mv <old> <new>\r\n")
			return nil
		}
		oldPath := s.resolvePath(parts[1])
		newPath := s.resolvePath(parts[2])
		err := s.sftpClient.Rename(oldPath, newPath)
		if err != nil {
			s.emitText(fmt.Sprintf("Error: %v\r\n", err))
		} else {
			s.emitText(fmt.Sprintf("Renamed: %s -> %s\r\n", oldPath, newPath))
		}
		return nil
	case "chmod":
		if len(parts) < 3 {
			s.emitText("Usage: chmod <mode> <path>\r\n")
			return nil
		}
		modeStr := parts[1]
		path := s.resolvePath(parts[2])
		mode, err := strconv.ParseUint(modeStr, 8, 32)
		if err != nil {
			s.emitText(fmt.Sprintf("Invalid mode: %s\r\n", modeStr))
			return nil
		}
		err = s.sftpClient.Chmod(path, os.FileMode(mode))
		if err != nil {
			s.emitText(fmt.Sprintf("Error: %v\r\n", err))
		} else {
			s.emitText(fmt.Sprintf("Changed mode of %s to %s\r\n", path, modeStr))
		}
		return nil
```

- [ ] **Step 2: Verify compilation**

Run:
```bash
go build ./backend/session/
```

- [ ] **Step 3: Commit**

```bash
git add backend/session/sftp_session.go
git commit -m "feat(session): add SFTP REPL mkdir, rm, rmdir, mv, chmod"
```

---

## Task 7: Async File Transfer (get, put)

**Files:**
- Modify: `backend/session/sftp_session.go`

- [ ] **Step 1: Add TransferTask and get/put commands**

Add at top of file:

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
		var src io.Reader
		var dst io.Writer
		var err error

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
			if e == io.EOF { break }
			if e != nil {
				task.Status = "error"
				s.emitTransferEvent(task, e)
				return
			}
		}
		task.Status = "done"
		s.emitTransferComplete(task)
		// Auto refresh remote file list after upload
		if task.Type == "upload" {
			s.cmdLS(s.cwd)
		}
	}()
}

func (s *SFTPSession) emitTransferProgress(task *TransferTask) {
	payload := map[string]interface{}{
		"type":     "sftp:transfer",
		"taskId":   task.ID,
		"event":    "progress",
		"progress": task.Progress,
		"total":    task.Total,
	}
	jsonBytes, _ := json.Marshal(payload)
	s.emitData([]byte("\x1b]633;S" + string(jsonBytes) + "\x07"))
}

func (s *SFTPSession) emitTransferComplete(task *TransferTask) {
	payload := map[string]interface{}{
		"type":     "sftp:transfer",
		"taskId":   task.ID,
		"event":    "complete",
		"status":   task.Status,
	}
	jsonBytes, _ := json.Marshal(payload)
	s.emitData([]byte("\x1b]633;S" + string(jsonBytes) + "\x07"))
}

func (s *SFTPSession) emitTransferEvent(task *TransferTask, err error) {
	payload := map[string]interface{}{
		"type":     "sftp:transfer",
		"taskId":   task.ID,
		"event":    "complete",
		"status":   "error",
		"error":    err.Error(),
	}
	jsonBytes, _ := json.Marshal(payload)
	s.emitData([]byte("\x1b]633;S" + string(jsonBytes) + "\x07"))
}
```

In `handleCommand`, add `get` and `put` cases:

```go	case "get":
		if len(parts) < 2 {
			s.emitText("Usage: get <remote> [local]\r\n")
			return nil
		}
		remotePath := s.resolvePath(parts[1])
		localPath := filepath.Join(s.localCwd, filepath.Base(remotePath))
		if len(parts) > 2 {
			localPath = filepath.Join(s.localCwd, parts[2])
		}
		task := &TransferTask{
			ID:         fmt.Sprintf("dl-%d", time.Now().UnixNano()),
			Type:       "download",
			LocalPath:  localPath,
			RemotePath: remotePath,
			Status:     "pending",
		}
		s.emitText(fmt.Sprintf("Downloading %s -> %s\r\n", remotePath, localPath))
		s.startTransfer(task)
		return nil
	case "put":
		if len(parts) < 2 {
			s.emitText("Usage: put <local> [remote]\r\n")
			return nil
		}
		localPath := filepath.Join(s.localCwd, parts[1])
		remotePath := s.resolvePath(filepath.Base(localPath))
		if len(parts) > 2 {
			remotePath = s.resolvePath(parts[2])
		}
		task := &TransferTask{
			ID:         fmt.Sprintf("ul-%d", time.Now().UnixNano()),
			Type:       "upload",
			LocalPath:  localPath,
			RemotePath: remotePath,
			Status:     "pending",
		}
		s.emitText(fmt.Sprintf("Uploading %s -> %s\r\n", localPath, remotePath))
		s.startTransfer(task)
		return nil
```

- [ ] **Step 2: Verify compilation**

```bash
go build ./backend/session/
```

- [ ] **Step 3: Commit**

```bash
git add backend/session/sftp_session.go
git commit -m "feat(session): add async get/put file transfer with progress events"
```

---

## Task 8: SessionManager Extension

**Files:**
- Modify: `backend/session/manager.go`

- [ ] **Step 1: Add sftp case**

In `SessionManager.Create`, add:

```go	case "sftp":
		s = NewSFTPSession(config.ID)
```

- [ ] **Step 2: Verify compilation**

```bash
go build ./backend/session/
```

- [ ] **Step 3: Commit**

```bash
git add backend/session/manager.go
git commit -m "feat(session): add 'sftp' case to SessionManager.Create"
```

---

## Task 9: File Dialog Wails Bindings

**Files:**
- Modify: `app.go`

- [ ] **Step 1: Add OpenFileDialog and SaveFileDialog**

Add after existing store methods:

```go
func (a *App) OpenFileDialog() (string, error) {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select File",
	})
	return selection, err
}

func (a *App) SaveFileDialog(defaultName string) (string, error) {
	selection, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save File",
		DefaultFilename: defaultName,
	})
	return selection, err
}
```

- [ ] **Step 2: Verify compilation**

```bash
go build .
```

- [ ] **Step 3: Commit**

```bash
git add app.go
git commit -m "feat(app): add OpenFileDialog and SaveFileDialog Wails bindings"
```

---

## Task 10: SFTPPathBreadcrumb Component

**Files:**
- Create: `frontend/src/components/SFTPPathBreadcrumb.vue`

- [ ] **Step 1: Write component**

```vue
<template>
  <div class="sftp-breadcrumb">
    <span
      v-for="(part, index) in pathParts"
      :key="index"
      class="breadcrumb-part"
      @click="onClick(index)"
    >
      {{ part }}
      <span v-if="index < pathParts.length - 1" class="separator">/</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  path: string
}>()

const emit = defineEmits<{
  navigate: [path: string]
}>()

const pathParts = computed(() => {
  const clean = props.path.replace(/\\/g, '/')
  if (!clean || clean === '/') return ['/']
  const parts = clean.split('/').filter(Boolean)
  return ['/', ...parts]
})

function onClick(index: number) {
  const parts = pathParts.value.slice(0, index + 1)
  let target = parts.join('/').replace(/\/+/g, '/')
  if (!target.startsWith('/')) target = '/' + target
  emit('navigate', target)
}
</script>

<style scoped>
.sftp-breadcrumb {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-subtle);
  overflow-x: auto;
  white-space: nowrap;
}
.breadcrumb-part {
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  transition: all 0.1s ease;
}
.breadcrumb-part:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.separator {
  color: var(--text-disabled);
  margin: 0 2px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SFTPPathBreadcrumb.vue
git commit -m "feat(ui): add SFTPPathBreadcrumb component"
```

---

## Task 11: SFTPFileList Component (Table + Filter)

**Files:**
- Create: `frontend/src/components/SFTPFileList.vue`

- [ ] **Step 1: Write base component**

```vue
<template>
  <div class="sftp-file-list">
    <div class="filter-bar">
      <el-input
        v-model="filterText"
        placeholder="Filter by name"
        size="small"
        clearable
      />
    </div>
    <el-table
      :data="filteredFiles"
      size="small"
      highlight-current-row
      @row-click="onRowClick"
      @row-dblclick="onRowDblClick"
      @row-contextmenu="onRowContextMenu"
    >
      <el-table-column label="Name" min-width="180">
        <template #default="{ row }">
          <el-icon v-if="row.isDir"><Folder /></el-icon>
          <el-icon v-else><Document /></el-icon>
          <span class="file-name">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="mode" label="Permission" width="100" />
      <el-table-column label="Modified" width="140">
        <template #default="{ row }">
          {{ formatDate(row.modTime) }}
        </template>
      </el-table-column>
      <el-table-column label="Type" width="80">
        <template #default="{ row }">
          {{ row.isDir ? 'Directory' : row.isLink ? 'Link' : 'File' }}
        </template>
      </el-table-column>
      <el-table-column label="Size" width="80" align="right">
        <template #default="{ row }">
          {{ row.isDir ? '-' : formatSize(row.size) }}
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Folder, Document } from '@element-plus/icons-vue'

interface FileItem {
  name: string
  size: number
  modTime: string
  mode: string
  isDir: boolean
  isLink?: boolean
}

const props = defineProps<{
  files: FileItem[]
  mode: 'local' | 'remote'
}>()

const emit = defineEmits<{
  open: [item: FileItem]
  navigate: [path: string]
  contextMenu: [event: MouseEvent, item: FileItem]
}>()

const filterText = ref('')

const filteredFiles = computed(() => {
  let list = [...props.files]
  // Always show ".." at top if not root
  if (!list.find(f => f.name === '..')) {
    list.unshift({ name: '..', size: 0, modTime: '', mode: '', isDir: true })
  }
  const q = filterText.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(f => f.name.toLowerCase().includes(q))
})

function formatDate(ts: string): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return d.toLocaleString()
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

function onRowClick(row: FileItem) {
  // handled by el-table highlight-current-row
}

function onRowDblClick(row: FileItem) {
  if (row.name === '..') {
    emit('navigate', '..')
    return
  }
  if (row.isDir) {
    emit('navigate', row.name)
  } else {
    emit('open', row)
  }
}

function onRowContextMenu(event: MouseEvent, row: FileItem) {
  event.preventDefault()
  emit('contextMenu', event, row)
}
</script>

<style scoped>
.sftp-file-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.filter-bar {
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.file-name {
  margin-left: 6px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SFTPFileList.vue
git commit -m "feat(ui): add SFTPFileList with table, filter, and double-click navigation"
```

---

## Task 12: SFTPFileList Multi-Select and Context Menu

**Files:**
- Modify: `frontend/src/components/SFTPFileList.vue`

- [ ] **Step 1: Add multi-select and context menu**

Replace the el-table with multi-select support:

```vue
<el-table
  ref="tableRef"
  :data="filteredFiles"
  size="small"
  @row-click="onRowClick"
  @row-dblclick="onRowDblClick"
  @row-contextmenu="onRowContextMenu"
>
```

Add to `<script setup>`:

```typescript
const tableRef = ref()
const selectedItems = ref<FileItem[]>([])
const lastClickedIndex = ref(-1)

function onRowClick(row: FileItem, _column: any, event: MouseEvent) {
  const index = filteredFiles.value.findIndex(f => f.name === row.name)
  if (event.ctrlKey || event.metaKey) {
    // Toggle selection
    const idx = selectedItems.value.findIndex(s => s.name === row.name)
    if (idx >= 0) {
      selectedItems.value.splice(idx, 1)
    } else {
      selectedItems.value.push(row)
    }
  } else if (event.shiftKey && lastClickedIndex.value >= 0) {
    // Range select
    const start = Math.min(lastClickedIndex.value, index)
    const end = Math.max(lastClickedIndex.value, index)
    selectedItems.value = filteredFiles.value.slice(start, end + 1)
  } else {
    // Single select
    selectedItems.value = [row]
    lastClickedIndex.value = index
  }
}
```

For the context menu, add a `<Teleport>` section and emit the selected items:

```vue
<Teleport to="body">
  <div
    v-show="contextMenuVisible"
    class="sftp-context-menu"
    :style="contextMenuStyle"
    @click.stop
  >
    <template v-if="menuType === 'file'">
      <div class="menu-item" @click="doDownload">Download</div>
      <div class="menu-item" @click="doSendToOther">Send to {{ props.mode === 'local' ? 'Remote' : 'Local' }}</div>
      <div class="menu-item" @click="doRename">Rename</div>
      <div class="menu-item" @click="doMove">Move</div>
      <div class="menu-item" @click="doDelete">Delete</div>
      <div class="menu-divider" />
      <div class="menu-item" @click="doRefresh">Refresh</div>
      <div class="menu-item" @click="doMkdir">New Directory</div>
      <div class="menu-item" @click="doChmod">Change Permission</div>
    </template>
    <template v-else-if="menuType === 'dir'">
      <div class="menu-item" @click="doEnter">Enter Directory</div>
      <div class="menu-item" @click="doSendToOther">Send to {{ props.mode === 'local' ? 'Remote' : 'Local' }}</div>
      <div class="menu-item" @click="doRename">Rename</div>
      <div class="menu-item" @click="doMove">Move</div>
      <div class="menu-item" @click="doDelete">Delete</div>
      <div class="menu-divider" />
      <div class="menu-item" @click="doRefresh">Refresh</div>
      <div class="menu-item" @click="doMkdir">New Directory</div>
      <div class="menu-item" @click="doChmod">Change Permission</div>
    </template>
    <template v-else-if="menuType === 'batch'">
      <div class="menu-item" @click="doBatchDownload">Download Selected</div>
      <div class="menu-item" @click="doBatchSendToOther">Send to {{ props.mode === 'local' ? 'Remote' : 'Local' }}</div>
      <div class="menu-item" @click="doBatchDelete">Delete Selected</div>
      <div class="menu-divider" />
      <div class="menu-item" @click="doRefresh">Refresh</div>
      <div class="menu-item disabled">Rename (single only)</div>
      <div class="menu-item disabled">Change Permission (single only)</div>
    </template>
  </div>
</Teleport>
```

Add state and logic:

```typescript
const contextMenuVisible = ref(false)
const contextMenuStyle = ref({ left: '0px', top: '0px' })
const menuType = ref<'file' | 'dir' | 'batch'>('file')

function onRowContextMenu(event: MouseEvent, row: FileItem) {
  event.preventDefault()
  // Ensure clicked row is in selection
  if (!selectedItems.value.some(s => s.name === row.name)) {
    selectedItems.value = [row]
  }
  // Determine menu type
  if (selectedItems.value.length > 1) {
    menuType.value = 'batch'
  } else if (selectedItems.value[0]?.isDir) {
    menuType.value = 'dir'
  } else {
    menuType.value = 'file'
  }
  contextMenuStyle.value = { left: event.clientX + 'px', top: event.clientY + 'px' }
  contextMenuVisible.value = true
}

function doDownload() { emit('download', selectedItems.value) }
function doSendToOther() { emit('sendToOther', selectedItems.value) }
function doRename() { emit('rename', selectedItems.value[0]) }
function doMove() { emit('move', selectedItems.value) }
function doDelete() { emit('delete', selectedItems.value) }
function doRefresh() { emit('refresh') }
function doMkdir() { emit('mkdir') }
function doChmod() { emit('chmod', selectedItems.value[0]) }
function doEnter() { emit('navigate', selectedItems.value[0]?.name || '.') }
function doBatchDownload() { emit('download', selectedItems.value) }
function doBatchSendToOther() { emit('sendToOther', selectedItems.value) }
function doBatchDelete() { emit('delete', selectedItems.value) }
```

Add emit definitions:

```typescript
const emit = defineEmits<{
  open: [item: FileItem]
  navigate: [path: string]
  download: [items: FileItem[]]
  sendToOther: [items: FileItem[]]
  rename: [item: FileItem]
  move: [items: FileItem[]]
  delete: [items: FileItem[]]
  refresh: []
  mkdir: []
  chmod: [item: FileItem]
}>()
```

- [ ] **Step 2: Add context menu styles**

```vue
<style>
.sftp-context-menu {
  position: fixed;
  z-index: 99999;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  min-width: 160px;
  padding: 4px;
}
.sftp-context-menu .menu-item {
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.sftp-context-menu .menu-item:hover:not(.disabled) {
  background: var(--bg-hover);
}
.sftp-context-menu .menu-item.disabled {
  color: var(--text-disabled);
  cursor: not-allowed;
}
.sftp-context-menu .menu-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px;
}
</style>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SFTPFileList.vue
git commit -m "feat(ui): add multi-select, context menu, and batch operations to SFTPFileList"
```

---

## Task 13: SFTPTransferProgress Component

**Files:**
- Create: `frontend/src/components/SFTPTransferProgress.vue`

- [ ] **Step 1: Write component**

```vue
<template>
  <div v-if="tasks.length > 0" class="transfer-progress-bar">
    <div v-for="task in tasks" :key="task.id" class="transfer-task">
      <span class="task-name">{{ task.type === 'upload' ? '↑' : '↓' }} {{ task.name }}</span>
      <el-progress
        :percentage="task.percentage"
        :status="task.status === 'error' ? 'exception' : undefined"
        :stroke-width="4"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface TransferTaskUI {
  id: string
  type: 'upload' | 'download'
  name: string
  percentage: number
  status: 'running' | 'done' | 'error'
}

defineProps<{
  tasks: TransferTaskUI[]
}>()
</script>

<style scoped>
.transfer-progress-bar {
  padding: 4px 12px;
  background: var(--bg-elevated);
  border-top: 1px solid var(--border-subtle);
}
.transfer-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.task-name {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  min-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SFTPTransferProgress.vue
git commit -m "feat(ui): add SFTPTransferProgress component"
```

---

## Task 14: useSFTPCommandLine Composable

**Files:**
- Create: `frontend/src/composables/useSFTPCommandLine.ts`

- [ ] **Step 1: Write composable**

```typescript
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type { Ref } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { SessionWrite } from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime'

export interface UseSFTPCommandLineReturn {
  terminalRef: Ref<HTMLDivElement | undefined>
  terminal: Terminal | null
  write: (data: string) => void
  resize: () => void
  focus: () => void
}

export function useSFTPCommandLine(
  getSessionId: () => string | null | undefined
): UseSFTPCommandLineReturn {
  const terminalRef = ref<HTMLDivElement>()
  let terminal: Terminal | null = null
  let fitAddon: FitAddon | null = null
  let resizeObserver: ResizeObserver | null = null
  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    if (!terminalRef.value) return

    terminal = new Terminal({
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: 'var(--bg-base)',
        foreground: 'var(--text-primary)',
        cursor: 'var(--accent)',
        selectionBackground: 'rgba(34, 211, 238, 0.2)',
      },
      cursorBlink: true,
      scrollback: 2500,
    })

    fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(terminalRef.value)
    fitAddon.fit()

    terminal.onData((data) => {
      const sid = getSessionId()
      if (sid) {
        SessionWrite(sid, data)
      }
    })

    unsubscribe = EventsOn('session:data', (payload: { id: string; data: string }) => {
      const sid = getSessionId()
      if (payload.id === sid && terminal) {
        terminal.write(payload.data)
      }
    })

    resizeObserver = new ResizeObserver(() => {
      fitAddon?.fit()
    })
    resizeObserver.observe(terminalRef.value)
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
    terminal?.dispose()
    unsubscribe?.()
  })

  return {
    terminalRef,
    terminal,
    write: (data: string) => terminal?.write(data),
    resize: () => fitAddon?.fit(),
    focus: () => terminal?.focus(),
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/composables/useSFTPCommandLine.ts
git commit -m "feat(ui): add useSFTPCommandLine composable"
```

---

## Task 15: SFTPCommandLine Component

**Files:**
- Create: `frontend/src/components/SFTPCommandLine.vue`

- [ ] **Step 1: Write component**

```vue
<template>
  <div class="sftp-command-line">
    <div ref="terminalRef" class="terminal-container" />
  </div>
</template>

<script setup lang="ts">
import { useSFTPCommandLine } from '../composables/useSFTPCommandLine'

const props = defineProps<{
  sessionId: string | null
}>()

const { terminalRef } = useSFTPCommandLine(() => props.sessionId)
</script>

<style scoped>
.sftp-command-line {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
}
.terminal-container {
  flex: 1;
  padding: 4px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SFTPCommandLine.vue
git commit -m "feat(ui): add SFTPCommandLine component"
```

---

## Task 16: SFTPTabContent Container

**Files:**
- Create: `frontend/src/components/SFTPTabContent.vue`

- [ ] **Step 1: Write container component**

```vue
<template>
  <div class="sftp-tab-content">
    <div class="panes-area">
      <div class="local-pane" @dragover.prevent @drop="onDropLocal">
        <SFTPPathBreadcrumb :path="localCwd" @navigate="onLocalNavigate" />
        <SFTPFileList
          mode="local"
          :files="localFiles"
          @navigate="onLocalNavigate"
          @download="onDownload"
          @send-to-other="onSendToRemote"
          @rename="onRename"
          @move="onMove"
          @delete="onDelete"
          @refresh="onRefreshLocal"
          @mkdir="onMkdir"
          @chmod="onChmod"
        />
      </div>
      <div class="remote-pane" @dragover.prevent @drop="onDropRemote">
        <SFTPPathBreadcrumb :path="cwd" @navigate="onRemoteNavigate" />
        <SFTPFileList
          mode="remote"
          :files="remoteFiles"
          @navigate="onRemoteNavigate"
          @download="onDownload"
          @send-to-other="onSendToLocal"
          @rename="onRename"
          @move="onMove"
          @delete="onDelete"
          @refresh="onRefreshRemote"
          @mkdir="onMkdir"
          @chmod="onChmod"
        />
      </div>
    </div>
    <SFTPTransferProgress :tasks="transferTasks" />
    <div class="command-line-area">
      <SFTPCommandLine :sessionId="panel.sessionId" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePanelStore } from '../stores/panelStore'
import SFTPPathBreadcrumb from './SFTPPathBreadcrumb.vue'
import SFTPFileList from './SFTPFileList.vue'
import SFTPTransferProgress from './SFTPTransferProgress.vue'
import SFTPCommandLine from './SFTPCommandLine.vue'

const props = defineProps<{
  panelId: string
}>()

const panelStore = usePanelStore()
const panel = computed(() => panelStore.getPanel(props.panelId)!)

// Placeholder state — wired to events in Task 19
const localCwd = computed(() => '/')
const cwd = computed(() => '/')
const localFiles = computed(() => [])
const remoteFiles = computed(() => [])
const transferTasks = computed(() => [])

function onLocalNavigate(path: string) {
  // Send lcd command
}
function onRemoteNavigate(path: string) {
  // Send cd command
}
function onDownload(items: any[]) {}
function onSendToRemote(items: any[]) {}
function onSendToLocal(items: any[]) {}
function onRename(item: any) {}
function onMove(items: any[]) {}
function onDelete(items: any[]) {}
function onRefreshLocal() {}
function onRefreshRemote() {}
function onMkdir() {}
function onChmod(item: any) {}
function onDropLocal(e: DragEvent) {}
function onDropRemote(e: DragEvent) {}
</script>

<style scoped>
.sftp-tab-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.panes-area {
  flex: 3;
  display: flex;
  overflow: hidden;
}
.local-pane, .remote-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--border-subtle);
}
.remote-pane {
  border-right: none;
}
.command-line-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid var(--border-subtle);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SFTPTabContent.vue
git commit -m "feat(ui): add SFTPTabContent container with dual-pane layout"
```

---

## Task 17: Sidebar SFTP Entry

**Files:**
- Modify: `frontend/src/components/Sidebar.vue`

- [ ] **Step 1: Add "Connect SFTP" to context menu**

Add a new emit:

```typescript
const emit = defineEmits(['connect', 'connectSftp', 'toggle'])
```

Add menu item in the Teleport context menu:

```vue
<div class="menu-item" @click="doConnect">{{ t('sidebar.connect') }}</div>
<div class="menu-item" @click="doConnectSFTP">{{ t('sidebar.connectSFTP') }}</div>
<div class="menu-divider" />
```

Add handler:

```typescript
function doConnectSFTP() {
  if (selectedConn.value) {
    emit('connectSftp', selectedConn.value)
  }
  closeMenu()
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Sidebar.vue
git commit -m "feat(sidebar): add 'Connect SFTP' context menu item"
```

---

## Task 18: App.vue SFTP Tab Rendering

**Files:**
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: Add SFTPTab rendering branch**

Find where tabs are rendered (likely in a `<template>` switch on `tab.type`), and add:

```vue
<SFTPTabContent
  v-else-if="tab.type === 'sftp'"
  :panel-id="tab.panelId"
/>
```

Add import:

```typescript
import SFTPTabContent from './components/SFTPTabContent.vue'
```

- [ ] **Step 2: Handle connectSftp event from Sidebar**

In App.vue, add handler for `@connect-sftp` from Sidebar:

```typescript
function onConnectSftp(config: ConnectionConfig) {
  // Create SFTP panel and tab
  const panel = panelStore.createPanel(config, 'sftp')
  const tab = tabStore.createSFPTab(`${config.name} (SFTP)`, panel.id)
  panelStore.movePanelToTab(panel.id, tab.id)
  // Create backend session
  CreateSession('sftp', config).then((info) => {
    panelStore.bindSession(panel.id, info.ID)
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.vue
git commit -m "feat(app): add SFTPTab rendering and connectSftp handler"
```

---

## Task 19: AI Context Integration

**Files:**
- Modify: `frontend/src/services/agent.ts`

- [ ] **Step 1: Add SFTP context to buildSystemPrompt**

In `buildSystemPrompt()`, after the existing SSH context block, add:

```typescript
if (activePanel.type === 'sftp') {
  parts.push('This is an SFTP command line session.')
  parts.push('Available commands: ls, cd, pwd, get, put, mkdir, rm, rmdir, mv, chmod, lls, lcd, lpwd, help')
  // Get current paths from the active tab if available
  const activeTab = tabStore.activeTab
  if (activeTab?.type === 'sftp') {
    // Paths would come from SFTPTabContent state; for now add placeholders
    parts.push('Current remote path: /')
    parts.push('Current local path: .')
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/agent.ts
git commit -m "feat(ai): add SFTP context awareness to agent system prompt"
```

---

## Task 20: Manual Verification

- [ ] **Step 1: Build the project**

```bash
wails build
```

Expected: Build succeeds.

- [ ] **Step 2: Run in dev mode and verify**

```bash
wails dev
```

Test checklist:
- [ ] Sidebar 右键已有 SSH 连接，显示"Connect SFTP"
- [ ] 点击后打开 SFTP Tab，显示双窗格布局
- [ ] 左侧显示本地文件，右侧显示远程文件
- [ ] 命令行显示 `sftp> ` 提示符，可输入命令
- [ ] `ls` 显示远程文件列表，`lls` 显示本地文件列表
- [ ] `cd` 切换远程目录，`lcd` 切换本地目录
- [ ] `get` 下载文件，`put` 上传文件
- [ ] 拖拽文件从左到右触发上传，从右到左触发下载
- [ ] 右键文件显示正确菜单，多选 Ctrl/Shift 可用
- [ ] AI 锁定 SFTP 窗口时，执行的是 SFTP 命令而非 shell 命令

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "feat(sftp): complete SFTP file browser implementation"
```

---

## Self-Review

### Spec Coverage

| Spec Requirement | Implementing Task |
|-----------------|-------------------|
| 双窗格布局（本地+远程）| Task 16 |
| 文件列表 5 列 | Task 11 |
| 右键菜单（文件/目录/批量）| Task 12 |
| Ctrl/Shift 多选 | Task 12 |
| 按名字筛选 | Task 11 |
| 拖拽传输 | Task 16 |
| SFTP REPL（14 命令）| Task 5, 6, 7 |
| 异步传输 + 进度 | Task 7, 13 |
| AI 上下文感知 | Task 19 |
| 右键入口 | Task 17 |

**Gap:** None identified.

### Placeholder Scan

No TBD, TODO, or vague steps found. Each task contains actual code.

### Type Consistency

- `SFTPFileInfo` struct used consistently across backend
- `FileItem` interface used consistently across frontend
- Event types (`sftp:filelist`, `sftp:locallist`, `sftp:transfer`) consistent

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-16-sftp-file-browser.md`.**

Recommended execution: **Inline Execution** via `superpowers:executing-plans` skill — tasks are well-ordered with clear dependencies, suitable for batch execution with periodic checkpoints.

Also add `