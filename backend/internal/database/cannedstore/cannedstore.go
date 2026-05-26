package cannedstore

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/dbgen"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/canned"
)

// Store implements canned.Store using SQLC-generated queries.
type Store struct {
	q *dbgen.Queries
}

func New(q *dbgen.Queries) *Store {
	return &Store{q: q}
}

func toCanned(r dbgen.CannedResponse) canned.CannedResponse {
	return canned.CannedResponse{
		ID:        r.ID,
		Name:      r.Name,
		Content:   r.Content,
		CreatedAt: r.CreatedAt,
		UpdatedAt: r.UpdatedAt,
	}
}

func (s *Store) Create(ctx context.Context, name, content string) (canned.CannedResponse, error) {
	r, err := s.q.CreateCannedResponse(ctx, dbgen.CreateCannedResponseParams{
		Name:    name,
		Content: content,
	})
	if err != nil {
		return canned.CannedResponse{}, fmt.Errorf("creating canned response %q: %w", name, err)
	}
	return toCanned(r), nil
}

func (s *Store) GetByID(ctx context.Context, id uuid.UUID) (canned.CannedResponse, error) {
	r, err := s.q.GetCannedResponse(ctx, id)
	if err != nil {
		return canned.CannedResponse{}, fmt.Errorf("getting canned response %s: %w", id, err)
	}
	return toCanned(r), nil
}

func (s *Store) GetByName(ctx context.Context, name string) (canned.CannedResponse, error) {
	r, err := s.q.GetCannedResponseByName(ctx, name)
	if err != nil {
		return canned.CannedResponse{}, fmt.Errorf("getting canned response by name %q: %w", name, err)
	}
	return toCanned(r), nil
}

func (s *Store) List(ctx context.Context) ([]canned.CannedResponse, error) {
	rows, err := s.q.ListCannedResponses(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing canned responses: %w", err)
	}
	out := make([]canned.CannedResponse, len(rows))
	for i, r := range rows {
		out[i] = toCanned(r)
	}
	return out, nil
}

func (s *Store) Update(ctx context.Context, id uuid.UUID, name, content string) (canned.CannedResponse, error) {
	r, err := s.q.UpdateCannedResponse(ctx, dbgen.UpdateCannedResponseParams{
		ID:      id,
		Name:    name,
		Content: content,
	})
	if err != nil {
		return canned.CannedResponse{}, fmt.Errorf("updating canned response %s: %w", id, err)
	}
	return toCanned(r), nil
}

func (s *Store) Delete(ctx context.Context, id uuid.UUID) error {
	return s.q.DeleteCannedResponse(ctx, id)
}
