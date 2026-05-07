package session

type SessionManager struct{}

func NewSessionManager() *SessionManager {
	return &SessionManager{}
}

func (sm *SessionManager) CloseAll() {}
