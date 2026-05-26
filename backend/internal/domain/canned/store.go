package canned

import (
	"context"

	"github.com/google/uuid"
)

// Store is the persistence interface for canned responses.
type Store interface {
	Create(ctx context.Context, name, content string) (CannedResponse, error)
	GetByID(ctx context.Context, id uuid.UUID) (CannedResponse, error)
	GetByName(ctx context.Context, name string) (CannedResponse, error)
	List(ctx context.Context) ([]CannedResponse, error)
	Update(ctx context.Context, id uuid.UUID, name, content string) (CannedResponse, error)
	Delete(ctx context.Context, id uuid.UUID) error
}
