package session

import (
	"fmt"
	"sync"

	"github.com/google/uuid"
)

type SessionManager struct {
	sessions map[string]Session
	mu       sync.RWMutex
}

func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[string]Session),
	}
}

func (sm *SessionManager) Create(sessionType string, config ConnectionConfig) (Session, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	config.ID = uuid.New().String()

	var s Session
	switch sessionType {
	case "ssh":
		s = NewSSHSession(config.ID)
	case "sftp":
		s = NewSFTPSession(config.ID)
	default:
		return nil, fmt.Errorf("unsupported session type: %s", sessionType)
	}

	sm.sessions[config.ID] = s
	return s, nil
}

func (sm *SessionManager) Close(sessionID string) error {
	sm.mu.Lock()
	s, ok := sm.sessions[sessionID]
	delete(sm.sessions, sessionID)
	sm.mu.Unlock()

	if !ok {
		return fmt.Errorf("session not found: %s", sessionID)
	}
	return s.Disconnect()
}

func (sm *SessionManager) Get(sessionID string) (Session, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	s, ok := sm.sessions[sessionID]
	return s, ok
}

func (sm *SessionManager) List() []SessionInfo {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	infos := make([]SessionInfo, 0, len(sm.sessions))
	for _, s := range sm.sessions {
		infos = append(infos, SessionInfo{
			ID:     s.ID(),
			Type:   s.Type(),
			Title:  s.Title(),
			Status: s.Status(),
		})
	}
	return infos
}

func (sm *SessionManager) CloseAll() {
	sm.mu.Lock()
	sessions := make([]Session, 0, len(sm.sessions))
	for _, s := range sm.sessions {
		sessions = append(sessions, s)
	}
	clear(sm.sessions)
	sm.mu.Unlock()

	for _, s := range sessions {
		if err := s.Disconnect(); err != nil {
			fmt.Printf("session %s disconnect error: %v\n", s.ID(), err)
		}
	}
}
