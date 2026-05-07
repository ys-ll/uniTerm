package main

import (
	"context"

	"uniTerm/backend/session"
	"uniTerm/backend/store"
)

type App struct {
	ctx              context.Context
	sessionManager   *session.SessionManager
	connectionStore  *store.ConnectionStore
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.sessionManager = session.NewSessionManager()
	a.connectionStore = store.NewConnectionStore(ctx)
}

func (a *App) shutdown(ctx context.Context) {
	if a.sessionManager != nil {
		a.sessionManager.CloseAll()
	}
}
