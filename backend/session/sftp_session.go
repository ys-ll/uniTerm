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
		// Agent auth not yet implemented; fall back to password for now
		authMethods = append(authMethods, ssh.Password(config.Password))
	}

	clientConfig := &ssh.ClientConfig{
		User:            config.User,
		Auth:            authMethods,
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
	if s.sftpCli != nil {
		s.sftpCli.Close()
	}
	if s.client != nil {
		s.client.Close()
	}
	s.setStatus(StatusDisconnected)
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
		return err
	}
	defer f.Close()
	_, err = f.Write(data)
	return err
}
