package store

import (
	"encoding/json"
	"os"
	"path/filepath"
)

const aiConfigFileName = "ai-config.json"

type AIConfig struct {
	APIKey  string `json:"apiKey"`
	BaseURL string `json:"baseURL"`
	Model   string `json:"model"`
}

type AIConfigStore struct {
	configDir string
}

func NewAIConfigStore() (*AIConfigStore, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	appDir := filepath.Join(configDir, "uniTerm")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return nil, err
	}
	return &AIConfigStore{configDir: appDir}, nil
}

func (s *AIConfigStore) filePath() string {
	return filepath.Join(s.configDir, aiConfigFileName)
}

func (s *AIConfigStore) Save(config AIConfig) error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.filePath(), data, 0600)
}

func (s *AIConfigStore) Load() (AIConfig, error) {
	data, err := os.ReadFile(s.filePath())
	if err != nil {
		if os.IsNotExist(err) {
			return AIConfig{}, nil
		}
		return AIConfig{}, err
	}
	var config AIConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return AIConfig{}, err
	}
	return config, nil
}
