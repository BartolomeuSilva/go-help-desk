package kb

import (
	"context"
	"strings"

	"github.com/google/uuid"
)

type service struct {
	store Store
}

// NewService returns a new instance of Service
func NewService(store Store) Service {
	return &service{store: store}
}

func (s *service) CreateCategory(ctx context.Context, name, description string, isPublic bool) (Category, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Category{}, ErrInvalidCategory
	}

	// Check if already exists
	existing, err := s.store.GetCategoryByName(ctx, name)
	if err == nil && existing.ID != uuid.Nil {
		return Category{}, ErrDuplicateCategoryName
	}

	return s.store.CreateCategory(ctx, name, strings.TrimSpace(description), isPublic)
}

func (s *service) GetCategory(ctx context.Context, id uuid.UUID) (Category, error) {
	if id == uuid.Nil {
		return Category{}, ErrCategoryNotFound
	}
	return s.store.GetCategory(ctx, id)
}

func (s *service) ListCategories(ctx context.Context, isStaffOrAdmin bool) ([]Category, error) {
	list, err := s.store.ListCategories(ctx)
	if err != nil {
		return nil, err
	}

	if isStaffOrAdmin {
		return list, nil
	}

	// Return only public categories
	out := make([]Category, 0)
	for _, c := range list {
		if c.IsPublic {
			out = append(out, c)
		}
	}
	return out, nil
}

func (s *service) UpdateCategory(ctx context.Context, id uuid.UUID, name, description string, isPublic bool) (Category, error) {
	if id == uuid.Nil {
		return Category{}, ErrCategoryNotFound
	}

	name = strings.TrimSpace(name)
	if name == "" {
		return Category{}, ErrInvalidCategory
	}

	// Check if name is taken by another category
	existing, err := s.store.GetCategoryByName(ctx, name)
	if err == nil && existing.ID != id {
		return Category{}, ErrDuplicateCategoryName
	}

	return s.store.UpdateCategory(ctx, id, name, strings.TrimSpace(description), isPublic)
}

func (s *service) DeleteCategory(ctx context.Context, id uuid.UUID) error {
	if id == uuid.Nil {
		return ErrCategoryNotFound
	}
	return s.store.DeleteCategory(ctx, id)
}

func (s *service) CreateArticle(ctx context.Context, categoryID uuid.UUID, title, content, status string) (Article, error) {
	title = strings.TrimSpace(title)
	content = strings.TrimSpace(content)
	if title == "" || content == "" {
		return Article{}, ErrInvalidArticle
	}

	// Check if category exists
	_, err := s.store.GetCategory(ctx, categoryID)
	if err != nil {
		return Article{}, ErrCategoryNotFound
	}

	if status != StatusPublished && status != StatusDraft {
		return Article{}, ErrInvalidArticle
	}

	return s.store.CreateArticle(ctx, categoryID, title, content, status)
}

func (s *service) GetArticle(ctx context.Context, id uuid.UUID, isStaffOrAdmin bool) (Article, error) {
	if id == uuid.Nil {
		return Article{}, ErrArticleNotFound
	}

	art, err := s.store.GetArticle(ctx, id)
	if err != nil {
		return Article{}, ErrArticleNotFound
	}

	// Check category visibility
	cat, err := s.store.GetCategory(ctx, art.CategoryID)
	if err != nil {
		return Article{}, ErrArticleNotFound
	}

	if !isStaffOrAdmin {
		if !cat.IsPublic {
			return Article{}, ErrArticleNotFound
		}
		if art.Status != StatusPublished {
			return Article{}, ErrArticleNotFound
		}
		// Increment views for public reads
		_ = s.store.IncrementArticleViews(ctx, id)
		// Fetch again with incremented view count for accurate return payload
		art, _ = s.store.GetArticle(ctx, id)
	}

	return art, nil
}

func (s *service) ListArticles(ctx context.Context, isStaffOrAdmin bool) ([]Article, error) {
	list, err := s.store.ListArticles(ctx)
	if err != nil {
		return nil, err
	}

	if isStaffOrAdmin {
		return list, nil
	}

	// Cache category public status to avoid N+1 DB lookups
	catCache := make(map[uuid.UUID]bool)

	out := make([]Article, 0)
	for _, art := range list {
		if art.Status != StatusPublished {
			continue
		}

		isPublicCat, found := catCache[art.CategoryID]
		if !found {
			cat, err := s.store.GetCategory(ctx, art.CategoryID)
			if err != nil {
				isPublicCat = false
			} else {
				isPublicCat = cat.IsPublic
			}
			catCache[art.CategoryID] = isPublicCat
		}

		if isPublicCat {
			out = append(out, art)
		}
	}

	return out, nil
}

func (s *service) ListArticlesByCategory(ctx context.Context, categoryID uuid.UUID, isStaffOrAdmin bool) ([]Article, error) {
	cat, err := s.store.GetCategory(ctx, categoryID)
	if err != nil {
		return nil, ErrCategoryNotFound
	}

	if !isStaffOrAdmin && !cat.IsPublic {
		return nil, ErrCategoryNotFound
	}

	list, err := s.store.ListArticlesByCategory(ctx, categoryID)
	if err != nil {
		return nil, err
	}

	if isStaffOrAdmin {
		return list, nil
	}

	out := make([]Article, 0)
	for _, art := range list {
		if art.Status == StatusPublished {
			out = append(out, art)
		}
	}
	return out, nil
}

func (s *service) UpdateArticle(ctx context.Context, id uuid.UUID, categoryID uuid.UUID, title, content, status string) (Article, error) {
	if id == uuid.Nil {
		return Article{}, ErrArticleNotFound
	}

	title = strings.TrimSpace(title)
	content = strings.TrimSpace(content)
	if title == "" || content == "" {
		return Article{}, ErrInvalidArticle
	}

	// Check if category exists
	_, err := s.store.GetCategory(ctx, categoryID)
	if err != nil {
		return Article{}, ErrCategoryNotFound
	}

	if status != StatusPublished && status != StatusDraft {
		return Article{}, ErrInvalidArticle
	}

	return s.store.UpdateArticle(ctx, id, categoryID, title, content, status)
}

func (s *service) DeleteArticle(ctx context.Context, id uuid.UUID) error {
	if id == uuid.Nil {
		return ErrArticleNotFound
	}
	return s.store.DeleteArticle(ctx, id)
}

func (s *service) SearchArticles(ctx context.Context, query string, isStaffOrAdmin bool) ([]Article, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []Article{}, nil
	}
	return s.store.SearchArticles(ctx, query, isStaffOrAdmin)
}
