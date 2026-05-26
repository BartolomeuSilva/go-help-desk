package canned

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
)

var (
	ErrNotFound  = errors.New("canned response not found")
	ErrDuplicate = errors.New("canned response with this name already exists")
)

// Service encapsulates the business logic for managing canned responses.
type Service struct {
	store Store
}

func NewService(store Store) *Service {
	return &Service{store: store}
}

func (s *Service) Create(ctx context.Context, name, content string) (CannedResponse, error) {
	name = strings.TrimSpace(name)
	content = strings.TrimSpace(content)
	if name == "" {
		return CannedResponse{}, errors.New("name must not be empty")
	}
	if content == "" {
		return CannedResponse{}, errors.New("content must not be empty")
	}

	// Check for duplicate name
	existing, err := s.store.GetByName(ctx, name)
	if err == nil && existing.ID != uuid.Nil {
		return CannedResponse{}, ErrDuplicate
	}

	return s.store.Create(ctx, name, content)
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (CannedResponse, error) {
	return s.store.GetByID(ctx, id)
}

func (s *Service) List(ctx context.Context) ([]CannedResponse, error) {
	return s.store.List(ctx)
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, name, content string) (CannedResponse, error) {
	name = strings.TrimSpace(name)
	content = strings.TrimSpace(content)
	if name == "" {
		return CannedResponse{}, errors.New("name must not be empty")
	}
	if content == "" {
		return CannedResponse{}, errors.New("content must not be empty")
	}

	// Check if name is taken by another record
	existing, err := s.store.GetByName(ctx, name)
	if err == nil && existing.ID != id {
		return CannedResponse{}, ErrDuplicate
	}

	return s.store.Update(ctx, id, name, content)
}

func (s *Service) Delete(ctx context.Context, id uuid.UUID) error {
	return s.store.Delete(ctx, id)
}
