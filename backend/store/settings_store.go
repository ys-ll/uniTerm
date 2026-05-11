package store

import (
	"encoding/json"
	"os"
	"path/filepath"
)

const settingsFileName = "settings.json"

type TerminalSettings struct {
	Theme             string `json:"theme"`
	FontFamily        string `json:"fontFamily"`
	FontSize          int    `json:"fontSize"`
	SelectionAction   string `json:"selectionAction"`
	RightClickAction  string `json:"rightClickAction"`
	MaxHistoryLines   int    `json:"maxHistoryLines"`
}

type AIModelConfig struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	APIKey   string `json:"apiKey"`
	BaseURL  string `json:"baseURL"`
	Model    string `json:"model"`
	Protocol string `json:"protocol"`
}

type AISettings struct {
	Models        []AIModelConfig `json:"models"`
	ActiveModelID string          `json:"activeModelId"`
}

type AppSettings struct {
	Theme     string           `json:"theme"`
	Language  string           `json:"language"`
	Terminal  TerminalSettings `json:"terminal"`
	AI        AISettings       `json:"ai"`
}

type SettingsStore struct {
	configDir string
}

func NewSettingsStore() (*SettingsStore, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil, err
	}
	appDir := filepath.Join(configDir, "uniTerm")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return nil, err
	}
	return &SettingsStore{configDir: appDir}, nil
}

func (s *SettingsStore) filePath() string {
	return filepath.Join(s.configDir, settingsFileName)
}

func (s *SettingsStore) Save(settings AppSettings) error {
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.filePath(), data, 0600)
}

func (s *SettingsStore) Load() (AppSettings, error) {
	data, err := os.ReadFile(s.filePath())
	if err != nil {
		if os.IsNotExist(err) {
			return defaultSettings(), nil
		}
		return AppSettings{}, err
	}
	var settings AppSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		return defaultSettings(), nil
	}
	return settings, nil
}

func defaultSettings() AppSettings {
	return AppSettings{
		Theme:    "dark",
		Language: "system",
		Terminal: TerminalSettings{
			Theme:            "dark",
			FontFamily:       "Consolas, \"Courier New\", monospace",
			FontSize:         14,
			SelectionAction:  "none",
			RightClickAction: "menu",
			MaxHistoryLines:  5000,
		},
		AI: AISettings{
			Models: []AIModelConfig{
				{
					ID:       "model-default",
					Name:     "Default",
					APIKey:   "",
					BaseURL:  "https://api.openai.com/v1",
					Model:    "gpt-4o",
					Protocol: "anthropic",
				},
			},
			ActiveModelID: "model-default",
		},
	}
}
