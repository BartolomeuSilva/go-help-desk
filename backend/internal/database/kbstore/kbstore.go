package kbstore

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/dbgen"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/kb"
)

// Store implements kb.Store using SQLC-generated queries.
type Store struct {
	q *dbgen.Queries
}

func New(q *dbgen.Queries) *Store {
	return &Store{q: q}
}

func toCategory(r dbgen.KbCategory) kb.Category {
	return kb.Category{
		ID:          r.ID,
		Name:        r.Name,
		Description: r.Description.String,
		IsPublic:    r.IsPublic,
		CreatedAt:   r.CreatedAt,
		UpdatedAt:   r.UpdatedAt,
	}
}

func toArticle(r dbgen.KbArticle) kb.Article {
	return kb.Article{
		ID:         r.ID,
		CategoryID: r.CategoryID,
		Title:      r.Title,
		Content:    r.Content,
		Status:     r.Status,
		Views:      r.Views,
		CreatedAt:  r.CreatedAt,
		UpdatedAt:  r.UpdatedAt,
	}
}

func (s *Store) CreateCategory(ctx context.Context, name, description string, isPublic bool) (kb.Category, error) {
	r, err := s.q.CreateKBCategory(ctx, dbgen.CreateKBCategoryParams{
		Name: name,
		Description: sql.NullString{
			String: description,
			Valid:  true,
		},
		IsPublic: isPublic,
	})
	if err != nil {
		return kb.Category{}, fmt.Errorf("creating kb category %q: %w", name, err)
	}
	return toCategory(r), nil
}

func (s *Store) GetCategory(ctx context.Context, id uuid.UUID) (kb.Category, error) {
	r, err := s.q.GetKBCategory(ctx, id)
	if err != nil {
		return kb.Category{}, kb.ErrCategoryNotFound
	}
	return toCategory(r), nil
}

func (s *Store) GetCategoryByName(ctx context.Context, name string) (kb.Category, error) {
	r, err := s.q.GetKBCategoryByName(ctx, name)
	if err != nil {
		return kb.Category{}, kb.ErrCategoryNotFound
	}
	return toCategory(r), nil
}

func (s *Store) ListCategories(ctx context.Context) ([]kb.Category, error) {
	rows, err := s.q.ListKBCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing kb categories: %w", err)
	}
	out := make([]kb.Category, len(rows))
	for i, r := range rows {
		out[i] = toCategory(r)
	}
	return out, nil
}

func (s *Store) UpdateCategory(ctx context.Context, id uuid.UUID, name, description string, isPublic bool) (kb.Category, error) {
	r, err := s.q.UpdateKBCategory(ctx, dbgen.UpdateKBCategoryParams{
		ID:   id,
		Name: name,
		Description: sql.NullString{
			String: description,
			Valid:  true,
		},
		IsPublic: isPublic,
	})
	if err != nil {
		return kb.Category{}, fmt.Errorf("updating kb category %s: %w", id, err)
	}
	return toCategory(r), nil
}

func (s *Store) DeleteCategory(ctx context.Context, id uuid.UUID) error {
	return s.q.DeleteKBCategory(ctx, id)
}

func (s *Store) CreateArticle(ctx context.Context, categoryID uuid.UUID, title, content, status string) (kb.Article, error) {
	r, err := s.q.CreateKBArticle(ctx, dbgen.CreateKBArticleParams{
		CategoryID: categoryID,
		Title:      title,
		Content:    content,
		Status:     status,
	})
	if err != nil {
		return kb.Article{}, fmt.Errorf("creating kb article %q: %w", title, err)
	}
	return toArticle(r), nil
}

func (s *Store) GetArticle(ctx context.Context, id uuid.UUID) (kb.Article, error) {
	r, err := s.q.GetKBArticle(ctx, id)
	if err != nil {
		return kb.Article{}, kb.ErrArticleNotFound
	}
	return toArticle(r), nil
}

func (s *Store) ListArticles(ctx context.Context) ([]kb.Article, error) {
	rows, err := s.q.ListKBArticles(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing kb articles: %w", err)
	}
	out := make([]kb.Article, len(rows))
	for i, r := range rows {
		out[i] = toArticle(r)
	}
	return out, nil
}

func (s *Store) ListArticlesByCategory(ctx context.Context, categoryID uuid.UUID) ([]kb.Article, error) {
	rows, err := s.q.ListKBArticlesByCategory(ctx, categoryID)
	if err != nil {
		return nil, fmt.Errorf("listing articles in category %s: %w", categoryID, err)
	}
	out := make([]kb.Article, len(rows))
	for i, r := range rows {
		out[i] = toArticle(r)
	}
	return out, nil
}

func (s *Store) UpdateArticle(ctx context.Context, id uuid.UUID, categoryID uuid.UUID, title, content, status string) (kb.Article, error) {
	r, err := s.q.UpdateKBArticle(ctx, dbgen.UpdateKBArticleParams{
		ID:         id,
		CategoryID: categoryID,
		Title:      title,
		Content:    content,
		Status:     status,
	})
	if err != nil {
		return kb.Article{}, fmt.Errorf("updating kb article %s: %w", id, err)
	}
	return toArticle(r), nil
}

func (s *Store) DeleteArticle(ctx context.Context, id uuid.UUID) error {
	return s.q.DeleteKBArticle(ctx, id)
}

func (s *Store) IncrementArticleViews(ctx context.Context, id uuid.UUID) error {
	return s.q.IncrementKBArticleViews(ctx, id)
}

func (s *Store) SearchArticles(ctx context.Context, query string, isStaffOrAdmin bool) ([]kb.Article, error) {
	var (
		rows []dbgen.KbArticle
		err  error
	)
	if isStaffOrAdmin {
		rows, err = s.q.SearchKBArticlesAll(ctx, query)
	} else {
		rows, err = s.q.SearchKBArticlesPublic(ctx, query)
	}
	if err != nil {
		return nil, fmt.Errorf("searching kb articles: %w", err)
	}
	out := make([]kb.Article, len(rows))
	for i, r := range rows {
		out[i] = toArticle(r)
	}
	return out, nil
}

func formatVector(v []float32) string {
	var sb strings.Builder
	sb.WriteByte('[')
	for i, val := range v {
		if i > 0 {
			sb.WriteByte(',')
		}
		sb.WriteString(strconv.FormatFloat(float64(val), 'f', -1, 32))
	}
	sb.WriteByte(']')
	return sb.String()
}

func (s *Store) UpdateArticleEmbedding(ctx context.Context, id uuid.UUID, embedding []float32) error {
	vecStr := formatVector(embedding)
	return s.q.UpdateKBArticleEmbedding(ctx, dbgen.UpdateKBArticleEmbeddingParams{
		ID:        id,
		Embedding: vecStr,
	})
}

func (s *Store) GetSimilarArticles(ctx context.Context, embedding []float32, limit int) ([]kb.Article, error) {
	vecStr := formatVector(embedding)
	rows, err := s.q.GetSimilarKBArticles(ctx, dbgen.GetSimilarKBArticlesParams{
		Embedding: vecStr,
		Limit:     int32(limit),
	})
	if err != nil {
		return nil, fmt.Errorf("getting similar kb articles: %w", err)
	}

	out := make([]kb.Article, len(rows))
	for i, r := range rows {
		out[i] = kb.Article{
			ID:         r.ID,
			CategoryID: r.CategoryID,
			Title:      r.Title,
			Content:    r.Content,
			Status:     r.Status,
			Views:      r.Views,
			CreatedAt:  r.CreatedAt,
			UpdatedAt:  r.UpdatedAt,
			Distance:   r.Distance,
		}
	}
	return out, nil
}
