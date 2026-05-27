package kb

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

// Article status enum
const (
	StatusPublished = "published"
	StatusDraft     = "draft"
)

var (
	ErrCategoryNotFound      = errors.New("knowledge base category not found")
	ErrArticleNotFound       = errors.New("knowledge base article not found")
	ErrDuplicateCategoryName = errors.New("knowledge base category name already exists")
	ErrInvalidArticle        = errors.New("invalid article data")
	ErrInvalidCategory       = errors.New("invalid category data")
)

// Category represents a knowledge base category
type Category struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	IsPublic    bool      `json:"is_public"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Article represents a knowledge base article
type Article struct {
	ID          uuid.UUID `json:"id"`
	CategoryID  uuid.UUID `json:"category_id"`
	Title       string    `json:"title"`
	Content     string    `json:"content"`
	Status      string    `json:"status"`
	Views       int32     `json:"views"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Store defines database operations for KB
type Store interface {
	CreateCategory(ctx context.Context, name, description string, isPublic bool) (Category, error)
	GetCategory(ctx context.Context, id uuid.UUID) (Category, error)
	GetCategoryByName(ctx context.Context, name string) (Category, error)
	ListCategories(ctx context.Context) ([]Category, error)
	UpdateCategory(ctx context.Context, id uuid.UUID, name, description string, isPublic bool) (Category, error)
	DeleteCategory(ctx context.Context, id uuid.UUID) error

	CreateArticle(ctx context.Context, categoryID uuid.UUID, title, content, status string) (Article, error)
	GetArticle(ctx context.Context, id uuid.UUID) (Article, error)
	ListArticles(ctx context.Context) ([]Article, error)
	ListArticlesByCategory(ctx context.Context, categoryID uuid.UUID) ([]Article, error)
	UpdateArticle(ctx context.Context, id uuid.UUID, categoryID uuid.UUID, title, content, status string) (Article, error)
	DeleteArticle(ctx context.Context, id uuid.UUID) error
	IncrementArticleViews(ctx context.Context, id uuid.UUID) error
	SearchArticles(ctx context.Context, query string, isStaffOrAdmin bool) ([]Article, error)
}

// Service defines KB business logic operations
type Service interface {
	CreateCategory(ctx context.Context, name, description string, isPublic bool) (Category, error)
	GetCategory(ctx context.Context, id uuid.UUID) (Category, error)
	ListCategories(ctx context.Context, isStaffOrAdmin bool) ([]Category, error)
	UpdateCategory(ctx context.Context, id uuid.UUID, name, description string, isPublic bool) (Category, error)
	DeleteCategory(ctx context.Context, id uuid.UUID) error

	CreateArticle(ctx context.Context, categoryID uuid.UUID, title, content, status string) (Article, error)
	GetArticle(ctx context.Context, id uuid.UUID, isStaffOrAdmin bool) (Article, error)
	ListArticles(ctx context.Context, isStaffOrAdmin bool) ([]Article, error)
	ListArticlesByCategory(ctx context.Context, categoryID uuid.UUID, isStaffOrAdmin bool) ([]Article, error)
	UpdateArticle(ctx context.Context, id uuid.UUID, categoryID uuid.UUID, title, content, status string) (Article, error)
	DeleteArticle(ctx context.Context, id uuid.UUID) error
	SearchArticles(ctx context.Context, query string, isStaffOrAdmin bool) ([]Article, error)
}
