// Package pluginstore implements domain/plugin.Store against PostgreSQL via sqlc.
package pluginstore

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/publiciallc/go-help-desk/backend/internal/dbgen"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/notification"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/plugin"
)

// Store implements plugin.Store.
type Store struct {
	q *dbgen.Queries
}

// New returns a Store backed by the given Queries.
func New(q *dbgen.Queries) *Store {
	return &Store{q: q}
}

// ErrNotFound is returned by Get* methods when the record does not exist.
var ErrNotFound = errors.New("not found")

func (s *Store) Create(ctx context.Context, p plugin.Plugin) error {
	hooks := make([]string, len(p.Manifest.Hooks))
	for i, h := range p.Manifest.Hooks {
		hooks[i] = string(h)
	}
	return s.q.CreatePlugin(ctx, dbgen.CreatePluginParams{
		ID:          p.Manifest.ID,
		Name:        p.Manifest.Name,
		Version:     p.Manifest.Version,
		Description: p.Manifest.Description,
		Author:      p.Manifest.Author,
		Runtime:     string(p.Manifest.Runtime),
		Hooks:       hooks,
		Enabled:     p.Enabled,
		WasmPath:    p.WASMPath,
		InstalledAt: p.InstalledAt,
	})
}

func (s *Store) GetByID(ctx context.Context, id string) (plugin.Plugin, error) {
	row, err := s.q.GetPlugin(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return plugin.Plugin{}, fmt.Errorf("%w: plugin %s", ErrNotFound, id)
		}
		return plugin.Plugin{}, fmt.Errorf("getting plugin %s: %w", id, err)
	}
	return toDomain(row), nil
}

func (s *Store) Update(ctx context.Context, p plugin.Plugin) error {
	return s.q.UpdatePlugin(ctx, dbgen.UpdatePluginParams{
		ID:       p.Manifest.ID,
		Name:     p.Manifest.Name,
		Version:  p.Manifest.Version,
		Enabled:  p.Enabled,
		WasmPath: p.WASMPath,
	})
}

func (s *Store) Delete(ctx context.Context, id string) error {
	return s.q.DeletePlugin(ctx, id)
}

func (s *Store) List(ctx context.Context) ([]plugin.Plugin, error) {
	rows, err := s.q.ListPlugins(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing plugins: %w", err)
	}
	out := make([]plugin.Plugin, len(rows))
	for i, r := range rows {
		out[i] = toDomain(r)
	}
	return out, nil
}

// toDomain converts a dbgen.Plugin to domain plugin.Plugin.
func toDomain(r dbgen.Plugin) plugin.Plugin {
	hooks := make([]notification.EventType, len(r.Hooks))
	for i, h := range r.Hooks {
		hooks[i] = notification.EventType(h)
	}
	return plugin.Plugin{
		Manifest: plugin.Manifest{
			ID:          r.ID,
			Name:        r.Name,
			Version:     r.Version,
			Description: r.Description,
			Author:      r.Author,
			Hooks:       hooks,
			Runtime:     plugin.Runtime(r.Runtime),
		},
		Enabled:     r.Enabled,
		WASMPath:    r.WasmPath,
		InstalledAt: r.InstalledAt,
	}
}
