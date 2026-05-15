package session

import (
	"encoding/json"
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

// SFTPFileInfo matches frontend expectation.
type SFTPFileInfo struct {
	Name    string      `json:"name"`
	Size    int64       `json:"size"`
	ModTime time.Time   `json:"modTime"`
	Mode    os.FileMode `json:"mode"`
	IsDir   bool        `json:"isDir"`
}

// TransferTask tracks an ongoing file transfer.
type TransferTask struct {
	ID         string
	Type       string // "upload" | "download"
	LocalPath  string
	RemotePath string
	Progress   int64
	Total      int64
	Status     string // "pending" | "running" | "done" | "error"
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
	case "mkdir":
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
	case "get":
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

func (s *SFTPSession) startTransfer(task *TransferTask) {
	go func() {
		task.Status = "running"
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
		if task.Type == "upload" {
			s.cmdLS(s.cwd)
		}
	}()
}

// emit helpers
func (s *SFTPSession) emitText(text string) {
	s.emitData([]byte(text))
}

func (s *SFTPSession) emitFileList(files []SFTPFileInfo, cwd string) {
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
		"type":     "sftp:locallist",
		"files":    files,
		"localCwd": localCwd,
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
