package store

import (
	"encoding/json"
	"os"
	"path/filepath"

	"uniTerm/backend/session"
)

const storeFileName = "connections.json"

type ConnectionStore struct {
	configDir string
}

func NewConnectionStore() (*ConnectionStore, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	appDir := filepath.Join(configDir, "uniTerm")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return nil, err
	}
	return &ConnectionStore{configDir: appDir}, nil
}

func (s *ConnectionStore) filePath() string {
	return filepath.Join(s.configDir, storeFileName)
}

func (s *ConnectionStore) Save(connections []session.ConnectionConfig) error {
	data, err := json.MarshalIndent(connections, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.filePath(), data, 0600)
}

func (s *ConnectionStore) Load() ([]session.ConnectionConfig, error) {
	data, err := os.ReadFile(s.filePath())
	if err != nil {
		if os.IsNotExist(err) {
			return []session.ConnectionConfig{}, nil
		}
		return nil, err
	}
	var connections []session.ConnectionConfig
	if err := json.Unmarshal(data, &connections); err != nil {
		return nil, err
	}
	return connections, nil
}
