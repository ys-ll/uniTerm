package session

import (
	"fmt"
	"io"
	"os"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type SFTPSession struct {
	baseSession
	client  *ssh.Client
	sftpCli *sftp.Client
}

func NewSFTPSession(id string) *SFTPSession {
	return &SFTPSession{
		baseSession: baseSession{
			id:          id,
			sessionType: "sftp",
			status:      StatusDisconnected,
		},
	}
}

func (s *SFTPSession) Connect(config ConnectionConfig) error {
	s.setStatus(StatusConnecting)
	s.title = fmt.Sprintf("SFTP: %s@%s", config.User, config.Host)

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
		return fmt.Errorf("agent auth not yet implemented")
	}

	clientConfig := &ssh.ClientConfig{
		User: config.User,
		Auth: authMethods,
		// TODO: Implement host key verification for production use
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         30 * time.Second,
	}

	client, err := ssh.Dial("tcp", fmt.Sprintf("%s:%d", config.Host, config.Port), clientConfig)
	if err != nil {
		s.setStatus(StatusError)
		return fmt.Errorf("ssh dial: %w", err)
	}

	sftpCli, err := sftp.NewClient(client)
	if err != nil {
		client.Close()
		s.setStatus(StatusError)
		return fmt.Errorf("sftp client: %w", err)
	}

	s.client = client
	s.sftpCli = sftpCli
	s.setStatus(StatusConnected)
	return nil
}

func (s *SFTPSession) Write(data []byte) error {
	return fmt.Errorf("sftp session does not support Write")
}

func (s *SFTPSession) Disconnect() error {
	var errs []error
	if s.sftpCli != nil {
		if err := s.sftpCli.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	if s.client != nil {
		if err := s.client.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	s.setStatus(StatusDisconnected)
	if len(errs) > 0 {
		return fmt.Errorf("disconnect errors: %v", errs)
	}
	return nil
}

func (s *SFTPSession) IsConnected() bool {
	return s.Status() == StatusConnected
}

// SFTP-specific methods (exposed via App bindings)
func (s *SFTPSession) ListDir(path string) ([]os.FileInfo, error) {
	if s.sftpCli == nil {
		return nil, fmt.Errorf("not connected")
	}
	return s.sftpCli.ReadDir(path)
}

func (s *SFTPSession) GetFile(path string) ([]byte, error) {
	if s.sftpCli == nil {
		return nil, fmt.Errorf("not connected")
	}
	f, err := s.sftpCli.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(f)
}

func (s *SFTPSession) PutFile(path string, data []byte) error {
	if s.sftpCli == nil {
		return fmt.Errorf("not connected")
	}
	f, err := s.sftpCli.Create(path)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	defer f.Close()
	if _, err := f.Write(data); err != nil {
		s.sftpCli.Remove(path) // clean up partial file
		return fmt.Errorf("write file: %w", err)
	}
	return nil
}
