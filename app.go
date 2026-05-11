package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"github.com/ys-ll/uniTerm/backend/log"
	"github.com/ys-ll/uniTerm/backend/session"
	"github.com/ys-ll/uniTerm/backend/store"
)

type App struct {
	ctx             context.Context
	sessionManager  *session.SessionManager
	connectionStore *store.ConnectionStore
	aiConfigStore   *store.AIConfigStore
	settingsStore   *store.SettingsStore
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.sessionManager = session.NewSessionManager()

	cs, err := store.NewConnectionStore()
	if err != nil {
		log.Writef("Failed to init connection store: %v", err)
		return
	}
	a.connectionStore = cs

	acs, err := store.NewAIConfigStore()
	if err != nil {
		log.Writef("Failed to init AI config store: %v", err)
		return
	}
	a.aiConfigStore = acs

	ss, err := store.NewSettingsStore()
	if err != nil {
		log.Writef("Failed to init settings store: %v", err)
		return
	}
	a.settingsStore = ss
}

func (a *App) shutdown(ctx context.Context) {
	if a.sessionManager != nil {
		a.sessionManager.CloseAll()
	}
}

// ConnectionStore methods

func (a *App) SaveConnections(connections []session.ConnectionConfig) error {
	if a.connectionStore == nil {
		return fmt.Errorf("connection store not initialized")
	}
	err := a.connectionStore.Save(connections)
	if err == nil {
		runtime.EventsEmit(a.ctx, "store:connections:changed", connections)
	}
	return err
}

func (a *App) LoadConnections() ([]session.ConnectionConfig, error) {
	if a.connectionStore == nil {
		return nil, fmt.Errorf("connection store not initialized")
	}
	return a.connectionStore.Load()
}

// AI Config Store methods

func (a *App) SaveAIConfig(config store.AIConfig) error {
	if a.aiConfigStore == nil {
		return fmt.Errorf("AI config store not initialized")
	}
	return a.aiConfigStore.Save(config)
}

func (a *App) LoadAIConfig() (store.AIConfig, error) {
	if a.aiConfigStore == nil {
		return store.AIConfig{}, fmt.Errorf("AI config store not initialized")
	}
	return a.aiConfigStore.Load()
}

// SettingsStore methods

func (a *App) SaveSettings(settings store.AppSettings) error {
	if a.settingsStore == nil {
		return fmt.Errorf("settings store not initialized")
	}
	return a.settingsStore.Save(settings)
}

func (a *App) LoadSettings() (store.AppSettings, error) {
	if a.settingsStore == nil {
		return store.AppSettings{}, fmt.Errorf("settings store not initialized")
	}
	return a.settingsStore.Load()
}

func (a *App) OnConnectionsChanged(callback func([]session.ConnectionConfig)) {
	runtime.EventsOn(a.ctx, "store:connections:changed", func(optionalData ...interface{}) {
		if len(optionalData) > 0 {
			if connections, ok := optionalData[0].([]session.ConnectionConfig); ok {
				callback(connections)
			}
		}
	})
}

// SessionManager methods

func (a *App) CreateSession(sessionType string, config session.ConnectionConfig) (*session.SessionInfo, error) {
	if a.sessionManager == nil {
		return nil, fmt.Errorf("session manager not initialized")
	}
	s, err := a.sessionManager.Create(sessionType, config)
	if err != nil {
		return nil, err
	}

	s.SetOnDataCallback(func(data []byte) {
		runtime.EventsEmit(a.ctx, "session:data", map[string]interface{}{
			"id":   s.ID(),
			"data": string(data),
		})
	})

	s.SetOnStatusChangeCallback(func(status session.SessionStatus) {
		runtime.EventsEmit(a.ctx, "session:status", map[string]interface{}{
			"id":     s.ID(),
			"status": status,
		})
	})

	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Writef("session %s connect panic: %v\n%s", s.ID(), r, string(debug.Stack()))
			}
		}()
		if err := s.Connect(config); err != nil {
			if a.ctx != nil {
				runtime.EventsEmit(a.ctx, "session:data", map[string]interface{}{
					"id":   s.ID(),
					"data": fmt.Sprintf("\r\n\x1b[31m[Connection failed: %v]\x1b[0m\r\nPress Enter to retry...\r\n", err),
				})
			}
			log.Writef("session %s connect error: %v", s.ID(), err)
		}
	}()

	info := &session.SessionInfo{
		ID:     s.ID(),
		Type:   s.Type(),
		Title:  s.Title(),
		Status: s.Status(),
	}
	return info, nil
}

func (a *App) CloseSession(sessionID string) error {
	if a.sessionManager == nil {
		return fmt.Errorf("session manager not initialized")
	}
	return a.sessionManager.Close(sessionID)
}

func (a *App) ListSessions() []session.SessionInfo {
	if a.sessionManager == nil {
		return []session.SessionInfo{}
	}
	return a.sessionManager.List()
}

func (a *App) SessionWrite(sessionID string, data string) error {
	if a.sessionManager == nil {
		return fmt.Errorf("session manager not initialized")
	}
	s, ok := a.sessionManager.Get(sessionID)
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}
	return s.Write([]byte(data))
}

func (a *App) SessionResize(sessionID string, cols, rows int) error {
	if a.sessionManager == nil {
		return fmt.Errorf("session manager not initialized")
	}
	s, ok := a.sessionManager.Get(sessionID)
	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}
	return s.Resize(cols, rows)
}

// ChatCompletion proxies Anthropic-native LLM API requests through the Go backend.
// The frontend now sends Anthropic-format JSON directly; the backend just passes it through.
func (a *App) ChatCompletion(apiKey, baseURL, model string, requestJSON string, protocol string) (string, error) {
	url := baseURL + "/messages"
	req, err := http.NewRequest("POST", url, bytes.NewReader([]byte(requestJSON)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("User-Agent", "uniTerm")

	client := &http.Client{Timeout: 120 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return "", err
	}

	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d: %s", res.StatusCode, string(body))
	}

	return string(body), nil
}
