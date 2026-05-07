package main

import (
	"context"
	"fmt"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"uniTerm/backend/session"
	"uniTerm/backend/store"
)

type App struct {
	ctx             context.Context
	sessionManager  *session.SessionManager
	connectionStore *store.ConnectionStore
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.sessionManager = session.NewSessionManager()

	cs, err := store.NewConnectionStore()
	if err != nil {
		fmt.Println("Failed to init connection store:", err)
		return
	}
	a.connectionStore = cs
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

// SessionManager methods

func (a *App) CreateSession(sessionType string, config session.ConnectionConfig) (*session.SessionInfo, error) {
	if a.sessionManager == nil {
		return nil, fmt.Errorf("session manager not initialized")
	}
	s, err := a.sessionManager.Create(sessionType, config)
	if err != nil {
		return nil, err
	}

	// Setup event forwarding
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
