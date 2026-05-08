package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

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
		if err := s.Connect(config); err != nil {
			fmt.Printf("session %s connect error: %v\n", s.ID(), err)
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

// ChatCompletion proxies LLM API requests through the Go backend.
// It tries OpenAI-compatible endpoint first, then falls back to Anthropic Messages API.
func (a *App) ChatCompletion(apiKey, baseURL, model string, requestJSON string) (string, error) {
	// Try OpenAI-compatible endpoint first
	openaiResult, openaiErr := a.chatOpenAI(apiKey, baseURL, model, requestJSON)
	if openaiErr == nil {
		return openaiResult, nil
	}

	// Fallback to Anthropic Messages API
	anthropicResult, anthropicErr := a.chatAnthropic(apiKey, baseURL, model, requestJSON)
	if anthropicErr == nil {
		return anthropicResult, nil
	}

	return "", fmt.Errorf("OpenAI: %v; Anthropic: %v", openaiErr, anthropicErr)
}

func (a *App) chatOpenAI(apiKey, baseURL, model string, requestJSON string) (string, error) {
	url := baseURL + "/chat/completions"
	req, err := http.NewRequest("POST", url, bytes.NewReader([]byte(requestJSON)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

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

// Anthropic request/response types
type anthropicTool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	InputSchema map[string]interface{} `json:"input_schema"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicRequest struct {
	Model     string             `json:"model"`
	Messages  []anthropicMessage `json:"messages"`
	MaxTokens int                `json:"max_tokens"`
	Tools     []anthropicTool    `json:"tools,omitempty"`
	Stream    bool               `json:"stream,omitempty"`
}

type anthropicContentBlock struct {
	Type  string                 `json:"type"`
	Text  string                 `json:"text,omitempty"`
	ID    string                 `json:"id,omitempty"`
	Name  string                 `json:"name,omitempty"`
	Input map[string]interface{} `json:"input,omitempty"`
}

type anthropicResponse struct {
	ID      string                  `json:"id"`
	Type    string                  `json:"type"`
	Role    string                  `json:"role"`
	Content []anthropicContentBlock `json:"content"`
	Model   string                  `json:"model"`
	Error   *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (a *App) chatAnthropic(apiKey, baseURL, model string, requestJSON string) (string, error) {
	// Parse OpenAI-format request and convert to Anthropic format
	var openaiReq struct {
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
		Tools []struct {
			Type     string `json:"type"`
			Function struct {
				Name        string                 `json:"name"`
				Description string                 `json:"description"`
				Parameters  map[string]interface{} `json:"parameters"`
			} `json:"function"`
		} `json:"tools"`
		Stream bool `json:"stream"`
	}
	if err := json.Unmarshal([]byte(requestJSON), &openaiReq); err != nil {
		return "", fmt.Errorf("parse openai request: %w", err)
	}

	anthropicReq := anthropicRequest{
		Model:     model,
		MaxTokens: 4096,
		Stream:    openaiReq.Stream,
	}

	for _, m := range openaiReq.Messages {
		anthropicReq.Messages = append(anthropicReq.Messages, anthropicMessage{
			Role:    m.Role,
			Content: m.Content,
		})
	}

	for _, t := range openaiReq.Tools {
		anthropicReq.Tools = append(anthropicReq.Tools, anthropicTool{
			Name:        t.Function.Name,
			Description: t.Function.Description,
			InputSchema: t.Function.Parameters,
		})
	}

	bodyBytes, err := json.Marshal(anthropicReq)
	if err != nil {
		return "", err
	}

	url := baseURL + "/messages"
	req, err := http.NewRequest("POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

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

	var anthropicRes anthropicResponse
	if err := json.Unmarshal(body, &anthropicRes); err != nil {
		return "", fmt.Errorf("parse anthropic response: %w", err)
	}

	if anthropicRes.Error != nil {
		return "", fmt.Errorf("anthropic error: %s", anthropicRes.Error.Message)
	}

	// Convert Anthropic response to OpenAI-compatible format
	openaiRes := map[string]interface{}{
		"choices": []map[string]interface{}{
			{
				"message": map[string]interface{}{
					"role":    "assistant",
					"content": "",
				},
			},
		},
	}

	var contentParts []string
	var toolCalls []map[string]interface{}

	for _, block := range anthropicRes.Content {
		switch block.Type {
		case "text":
			contentParts = append(contentParts, block.Text)
		case "tool_use":
			argsJSON, _ := json.Marshal(block.Input)
			toolCalls = append(toolCalls, map[string]interface{}{
				"id":   block.ID,
				"type": "function",
				"function": map[string]interface{}{
					"name":      block.Name,
					"arguments": string(argsJSON),
				},
			})
		}
	}

	msg := openaiRes["choices"].([]map[string]interface{})[0]["message"].(map[string]interface{})
	msg["content"] = ""
	if len(contentParts) > 0 {
		msg["content"] = contentParts[0]
	}
	if len(toolCalls) > 0 {
		msg["tool_calls"] = toolCalls
	}

	result, err := json.Marshal(openaiRes)
	if err != nil {
		return "", err
	}

	return string(result), nil
}
