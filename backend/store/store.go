package store

import "context"

type ConnectionStore struct{}

func NewConnectionStore(ctx context.Context) *ConnectionStore {
	return &ConnectionStore{}
}
