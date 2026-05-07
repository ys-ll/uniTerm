package session

import "sync"

type SessionStatus string

const (
	StatusConnecting   SessionStatus = "connecting"
	StatusConnected    SessionStatus = "connected"
	StatusDisconnected SessionStatus = "disconnected"
	StatusError        SessionStatus = "error"
)

type ConnectionConfig struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	AuthType string `json:"authType"`
	Password string `json:"password,omitempty"`
	KeyPath  string `json:"keyPath,omitempty"`
}

type SessionInfo struct {
	ID     string        `json:"id"`
	Type   string        `json:"type"`
	Title  string        `json:"title"`
	Status SessionStatus `json:"status"`
}

type Session interface {
	ID() string
	Type() string
	Title() string
	Status() SessionStatus

	Connect(config ConnectionConfig) error
	Disconnect() error
	IsConnected() bool

	Write(data []byte) error
	SetOnDataCallback(cb func([]byte))
	SetOnStatusChangeCallback(cb func(SessionStatus))
}

type baseSession struct {
	id               string
	sessionType      string
	title            string
	status           SessionStatus
	onDataCallback   func([]byte)
	onStatusCallback func(SessionStatus)
	mu               sync.RWMutex
}

func (s *baseSession) ID() string            { return s.id }
func (s *baseSession) Type() string          { return s.sessionType }
func (s *baseSession) Title() string         { return s.title }
func (s *baseSession) Status() SessionStatus { s.mu.RLock(); defer s.mu.RUnlock(); return s.status }
func (s *baseSession) SetOnDataCallback(cb func([]byte)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onDataCallback = cb
}
func (s *baseSession) SetOnStatusChangeCallback(cb func(SessionStatus)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onStatusCallback = cb
}

func (s *baseSession) setStatus(st SessionStatus) {
	s.mu.Lock()
	s.status = st
	cb := s.onStatusCallback
	s.mu.Unlock()
	if cb != nil {
		cb(st)
	}
}

func (s *baseSession) emitData(data []byte) {
	s.mu.RLock()
	cb := s.onDataCallback
	s.mu.RUnlock()
	if cb != nil {
		cb(data)
	}
}
