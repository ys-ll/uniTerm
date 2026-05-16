package session

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	osUser "os/user"
	"path"
	"path/filepath"
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
	transfers  map[string]*TransferTask
}

func NewSFTPSession(id string) *SFTPSession {
	homeDir, _ := os.UserHomeDir()
	return &SFTPSession{
		baseSession: baseSession{
			id:          id,
			sessionType: "sftp",
			status:      StatusDisconnected,
		},
		cwd:       "/",
		localCwd:  homeDir,
		transfers: make(map[string]*TransferTask),
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
	if wd, err := sc.Getwd(); err == nil {
		s.cwd = wd
	}
	s.setStatus(StatusConnected)

	return nil
}

func (s *SFTPSession) Write(data []byte) error {
	return nil
}

func (s *SFTPSession) Resize(cols, rows int) error {
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

// FileItem represents a file entry returned to the frontend.
type FileItem struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	ModTime string `json:"modTime"`
	Mode    string `json:"mode"`
	IsDir   bool   `json:"isDir"`
	Owner   string `json:"owner"`
	Group   string `json:"group"`
}

// FileListResult wraps files + current directory for a list response.
type FileListResult struct {
	Files []FileItem `json:"files"`
	Dir   string     `json:"dir"`
}

// TransferTask tracks an ongoing file transfer.
type TransferTask struct {
	ID         string
	Type       string // "upload" | "download"
	LocalPath  string
	RemotePath string
	Progress   int64
	Total      int64
	Status     string // "pending" | "running" | "paused" | "done" | "error" | "cancelled"
	ctx        context.Context
	cancel     context.CancelFunc
	paused     bool
	pauseCh    chan struct{}
}

func (t *TransferTask) start() {
	t.ctx, t.cancel = context.WithCancel(context.Background())
	t.pauseCh = make(chan struct{})
}

func (t *TransferTask) done() {
	if t.cancel != nil {
		t.cancel()
	}
}

func (t *TransferTask) waitIfPaused() {
	for {
		if t.paused {
			select {
			case <-t.pauseCh:
				continue
			case <-t.ctx.Done():
				return
			}
		}
		return
	}
}

func resolveOwnerGroup(fi os.FileInfo) (string, string) {
	owner := ""
	group := ""
	if stat, ok := fi.Sys().(*sftp.FileStat); ok {
		if stat.UID > 0 {
			owner = fmt.Sprintf("%d", stat.UID)
		}
		if stat.GID > 0 {
			group = fmt.Sprintf("%d", stat.GID)
		}
	}
	return owner, group
}

// --- Public API methods (called from app.go Wails bindings) ---

func (s *SFTPSession) requireClient() error {
	if s.sftpClient == nil {
		return fmt.Errorf("SFTP session not connected")
	}
	return nil
}

func (s *SFTPSession) ListRemote(dir string) (FileListResult, error) {
	if err := s.requireClient(); err != nil {
		return FileListResult{}, err
	}
	if dir == "" {
		dir = s.cwd
	} else if !path.IsAbs(dir) {
		dir = path.Join(s.cwd, dir)
	}
	infos, err := s.sftpClient.ReadDir(dir)
	if err != nil {
		return FileListResult{}, err
	}
	files := make([]FileItem, 0, len(infos))
	for _, fi := range infos {
		owner, group := resolveOwnerGroup(fi)
		isDir := fi.IsDir()
		if fi.Mode()&os.ModeSymlink != 0 {
			if target, err := s.sftpClient.Stat(path.Join(dir, fi.Name())); err == nil {
				isDir = target.IsDir()
			}
		}
		files = append(files, FileItem{
			Name:    fi.Name(),
			Size:    fi.Size(),
			ModTime: fi.ModTime().Format(time.RFC3339),
			Mode:    fi.Mode().String(),
			IsDir:   isDir,
			Owner:   owner,
			Group:   group,
		})
	}
	return FileListResult{Files: files, Dir: dir}, nil
}

func (s *SFTPSession) ListLocal(dir string) (FileListResult, error) {
	if dir == "" {
		dir = s.localCwd
	} else if !filepath.IsAbs(dir) {
		dir = filepath.Join(s.localCwd, dir)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return FileListResult{}, err
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
		owner := ""
		if currentUser, err := osUser.Current(); err == nil {
			owner = currentUser.Username
		}
		isDir := e.IsDir()
		if fi != nil && fi.Mode()&os.ModeSymlink != 0 {
			if target, err := os.Stat(filepath.Join(dir, e.Name())); err == nil {
				isDir = target.IsDir()
			}
		}
		files = append(files, FileItem{
			Name:    e.Name(),
			Size:    size,
			ModTime: modTime.Format(time.RFC3339),
			Mode:    mode.String(),
			IsDir:   isDir,
			Owner:   owner,
		})
	}
	return FileListResult{Files: files, Dir: dir}, nil
}

func (s *SFTPSession) ListLocalDrives() ([]FileItem, error) {
	var drives []FileItem
	for _, letter := range "ABCDEFGHIJKLMNOPQRSTUVWXYZ" {
		root := string(letter) + ":\\"
		fi, err := os.Stat(root)
		if err != nil {
			continue
		}
		if fi.IsDir() {
			drives = append(drives, FileItem{
				Name:    root,
				Size:    0,
				ModTime: fi.ModTime().Format(time.RFC3339),
				Mode:    fi.Mode().String(),
				IsDir:   true,
			})
		}
	}
	return drives, nil
}

func (s *SFTPSession) ChangeRemoteDir(dir string) (FileListResult, error) {
	if err := s.requireClient(); err != nil {
		return FileListResult{}, err
	}
	target := dir
	if !path.IsAbs(dir) {
		target = path.Join(s.cwd, dir)
	}
	fi, err := s.sftpClient.Stat(target)
	if err != nil {
		return FileListResult{}, fmt.Errorf("no such directory: %s", target)
	}
	if !fi.IsDir() {
		return FileListResult{}, fmt.Errorf("not a directory: %s", target)
	}
	real, _ := s.sftpClient.RealPath(target)
	s.mu.Lock()
	s.cwd = real
	s.mu.Unlock()
	return s.ListRemote(real)
}

func (s *SFTPSession) ChangeLocalDir(dir string) (FileListResult, error) {
	target := dir
	if !filepath.IsAbs(dir) {
		target = filepath.Join(s.localCwd, dir)
	}
	fi, err := os.Stat(target)
	if err != nil {
		return FileListResult{}, fmt.Errorf("no such directory: %s", target)
	}
	if !fi.IsDir() {
		return FileListResult{}, fmt.Errorf("not a directory: %s", target)
	}
	abs, _ := filepath.Abs(target)
	s.mu.Lock()
	s.localCwd = abs
	s.mu.Unlock()
	return s.ListLocal(abs)
}

func (s *SFTPSession) MakeDir(dir string) error {
	if err := s.requireClient(); err != nil {
		return err
	}
	p := dir
	if !path.IsAbs(p) {
		p = path.Join(s.cwd, p)
	}
	return s.sftpClient.Mkdir(p)
}

func (s *SFTPSession) Remove(p string, recursive bool) error {
	if err := s.requireClient(); err != nil {
		return err
	}
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

func (s *SFTPSession) Rename(oldName, newName string) error {
	if err := s.requireClient(); err != nil {
		return err
	}
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

func (s *SFTPSession) Chmod(p string, mode os.FileMode) error {
	if err := s.requireClient(); err != nil {
		return err
	}
	if !path.IsAbs(p) {
		p = path.Join(s.cwd, p)
	}
	return s.sftpClient.Chmod(p, mode)
}

func (s *SFTPSession) Get(remotePath, localPath string, recursive bool) (string, error) {
	if err := s.requireClient(); err != nil {
		return "", err
	}
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
		task.start()
		s.mu.Lock()
		s.transfers[task.ID] = task
		s.mu.Unlock()
		s.emitTransferStart(task)
		go func() {
			defer func() {
				task.done()
				s.mu.Lock()
				delete(s.transfers, task.ID)
				s.mu.Unlock()
			}()
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

func (s *SFTPSession) Put(localPath, remotePath string, recursive bool) (string, error) {
	if err := s.requireClient(); err != nil {
		return "", err
	}
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
		task.start()
		s.mu.Lock()
		s.transfers[task.ID] = task
		s.mu.Unlock()
		s.emitTransferStart(task)
		go func() {
			defer func() {
				task.done()
				s.mu.Lock()
				delete(s.transfers, task.ID)
				s.mu.Unlock()
			}()
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

// --- Local file operations ---

func (s *SFTPSession) LocalRemove(p string, recursive bool) error {
	if !filepath.IsAbs(p) {
		p = filepath.Join(s.localCwd, p)
	}
	if recursive {
		return os.RemoveAll(p)
	}
	fi, err := os.Stat(p)
	if err != nil {
		return err
	}
	if fi.IsDir() {
		entries, err := os.ReadDir(p)
		if err != nil {
			return err
		}
		if len(entries) > 0 {
			return fmt.Errorf("directory not empty (%d items)", len(entries))
		}
	}
	return os.Remove(p)
}

func (s *SFTPSession) LocalRename(oldName, newName string) error {
	old := oldName
	if !filepath.IsAbs(old) {
		old = filepath.Join(s.localCwd, old)
	}
	newPath := newName
	if !filepath.IsAbs(newPath) {
		newPath = filepath.Join(s.localCwd, newPath)
	}
	return os.Rename(old, newPath)
}

func (s *SFTPSession) LocalMkdir(dir string) error {
	p := dir
	if !filepath.IsAbs(p) {
		p = filepath.Join(s.localCwd, p)
	}
	return os.MkdirAll(p, 0755)
}

// PutContent writes raw content directly to a remote file via SFTP.
func (s *SFTPSession) PutContent(remotePath string, content []byte) error {
	if err := s.requireClient(); err != nil {
		return err
	}
	rp := remotePath
	if !path.IsAbs(rp) {
		rp = path.Join(s.cwd, rp)
	}
	// Ensure parent directory exists
	parentDir := path.Dir(rp)
	if err := s.sftpClient.MkdirAll(parentDir); err != nil {
		return err
	}
	f, err := s.sftpClient.Create(rp)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.Write(content)
	return err
}

// CancelTransfer cancels an ongoing transfer task.
func (s *SFTPSession) CancelTransfer(taskID string) error {
	s.mu.Lock()
	task, ok := s.transfers[taskID]
	s.mu.Unlock()
	if !ok {
		return fmt.Errorf("task not found: %s", taskID)
	}
	if task.cancel != nil {
		task.cancel()
	}
	return nil
}

// PauseTransfer pauses an ongoing transfer task.
func (s *SFTPSession) PauseTransfer(taskID string) error {
	s.mu.Lock()
	task, ok := s.transfers[taskID]
	s.mu.Unlock()
	if !ok {
		return fmt.Errorf("task not found: %s", taskID)
	}
	task.paused = true
	task.Status = "paused"
	s.emitTransferComplete(task)
	return nil
}

// ResumeTransfer resumes a paused transfer task.
func (s *SFTPSession) ResumeTransfer(taskID string) error {
	s.mu.Lock()
	task, ok := s.transfers[taskID]
	s.mu.Unlock()
	if !ok {
		return fmt.Errorf("task not found: %s", taskID)
	}
	task.paused = false
	task.Status = "running"
		close(task.pauseCh)
		task.pauseCh = make(chan struct{})
		s.emitTransferStart(task)
		return nil
	}

// --- Recursive helpers ---

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

// --- Transfer methods ---

func (s *SFTPSession) startTransfer(task *TransferTask) {
	task.start()
	s.mu.Lock()
	s.transfers[task.ID] = task
	s.mu.Unlock()
	go func() {
		defer func() {
			task.done()
			s.mu.Lock()
			delete(s.transfers, task.ID)
			s.mu.Unlock()
		}()
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
			select {
			case <-task.ctx.Done():
				task.Status = "cancelled"
				s.emitTransferComplete(task)
				return
			default:
			}
			task.waitIfPaused()
			select {
			case <-task.ctx.Done():
				task.Status = "cancelled"
				s.emitTransferComplete(task)
				return
			default:
			}
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

func (s *SFTPSession) downloadDir(remoteDir, localDir string, task *TransferTask) error {
	select {
	case <-task.ctx.Done():
		return task.ctx.Err()
	default:
	}
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

func (s *SFTPSession) uploadDir(localDir, remoteDir string, task *TransferTask) error {
	select {
	case <-task.ctx.Done():
		return task.ctx.Err()
	default:
	}
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
			select {
			case <-task.ctx.Done():
				return task.ctx.Err()
			default:
			}
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
			select {
			case <-task.ctx.Done():
				return task.ctx.Err()
			default:
			}
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

// --- Transfer event emitters ---

func (s *SFTPSession) emitTransferStart(task *TransferTask) {
	name := filepath.Base(task.LocalPath)
	if task.Type == "download" {
		name = path.Base(task.RemotePath)
	}
	payload := map[string]interface{}{
		"type":   "sftp:transfer",
		"taskId": task.ID,
		"event":  "start",
		"tfType": task.Type,
		"name":   name,
		"total":  task.Total,
	}
	jsonBytes, _ := json.Marshal(payload)
	s.emitData([]byte("\x1b]633;S" + string(jsonBytes) + "\x07"))
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
		"type":   "sftp:transfer",
		"taskId": task.ID,
		"event":  "complete",
		"status": task.Status,
	}
	jsonBytes, _ := json.Marshal(payload)
	s.emitData([]byte("\x1b]633;S" + string(jsonBytes) + "\x07"))
}

func (s *SFTPSession) emitTransferEvent(task *TransferTask, err error) {
	payload := map[string]interface{}{
		"type":   "sftp:transfer",
		"taskId": task.ID,
		"event":  "complete",
		"status": "error",
		"error":  err.Error(),
	}
	jsonBytes, _ := json.Marshal(payload)
	s.emitData([]byte("\x1b]633;S" + string(jsonBytes) + "\x07"))
}
