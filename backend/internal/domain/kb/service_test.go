package kb

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type mockStore struct {
	categories map[uuid.UUID]Category
	articles   map[uuid.UUID]Article
}

func newMockStore() *mockStore {
	return &mockStore{
		categories: make(map[uuid.UUID]Category),
		articles:   make(map[uuid.UUID]Article),
	}
}

func (m *mockStore) CreateCategory(ctx context.Context, name, description string, isPublic bool) (Category, error) {
	id := uuid.New()
	cat := Category{
		ID:          id,
		Name:        name,
		Description: description,
		IsPublic:    isPublic,
	}
	m.categories[id] = cat
	return cat, nil
}

func (m *mockStore) GetCategory(ctx context.Context, id uuid.UUID) (Category, error) {
	cat, found := m.categories[id]
	if !found {
		return Category{}, ErrCategoryNotFound
	}
	return cat, nil
}

func (m *mockStore) GetCategoryByName(ctx context.Context, name string) (Category, error) {
	for _, cat := range m.categories {
		if cat.Name == name {
			return cat, nil
		}
	}
	return Category{}, ErrCategoryNotFound
}

func (m *mockStore) ListCategories(ctx context.Context) ([]Category, error) {
	out := make([]Category, 0, len(m.categories))
	for _, cat := range m.categories {
		out = append(out, cat)
	}
	return out, nil
}

func (m *mockStore) UpdateCategory(ctx context.Context, id uuid.UUID, name, description string, isPublic bool) (Category, error) {
	cat, found := m.categories[id]
	if !found {
		return Category{}, ErrCategoryNotFound
	}
	cat.Name = name
	cat.Description = description
	cat.IsPublic = isPublic
	m.categories[id] = cat
	return cat, nil
}

func (m *mockStore) DeleteCategory(ctx context.Context, id uuid.UUID) error {
	delete(m.categories, id)
	return nil
}

func (m *mockStore) CreateArticle(ctx context.Context, categoryID uuid.UUID, title, content, status string) (Article, error) {
	id := uuid.New()
	art := Article{
		ID:         id,
		CategoryID: categoryID,
		Title:      title,
		Content:    content,
		Status:     status,
	}
	m.articles[id] = art
	return art, nil
}

func (m *mockStore) GetArticle(ctx context.Context, id uuid.UUID) (Article, error) {
	art, found := m.articles[id]
	if !found {
		return Article{}, ErrArticleNotFound
	}
	return art, nil
}

func (m *mockStore) ListArticles(ctx context.Context) ([]Article, error) {
	out := make([]Article, 0, len(m.articles))
	for _, art := range m.articles {
		out = append(out, art)
	}
	return out, nil
}

func (m *mockStore) ListArticlesByCategory(ctx context.Context, categoryID uuid.UUID) ([]Article, error) {
	out := make([]Article, 0)
	for _, art := range m.articles {
		if art.CategoryID == categoryID {
			out = append(out, art)
		}
	}
	return out, nil
}

func (m *mockStore) UpdateArticle(ctx context.Context, id uuid.UUID, categoryID uuid.UUID, title, content, status string) (Article, error) {
	art, found := m.articles[id]
	if !found {
		return Article{}, ErrArticleNotFound
	}
	art.CategoryID = categoryID
	art.Title = title
	art.Content = content
	art.Status = status
	m.articles[id] = art
	return art, nil
}

func (m *mockStore) DeleteArticle(ctx context.Context, id uuid.UUID) error {
	delete(m.articles, id)
	return nil
}

func (m *mockStore) IncrementArticleViews(ctx context.Context, id uuid.UUID) error {
	art, found := m.articles[id]
	if found {
		art.Views++
		m.articles[id] = art
	}
	return nil
}

func (m *mockStore) SearchArticles(ctx context.Context, query string, isStaffOrAdmin bool) ([]Article, error) {
	query = strings.ToLower(query)
	out := make([]Article, 0)
	for _, art := range m.articles {
		if !isStaffOrAdmin {
			cat, found := m.categories[art.CategoryID]
			if !found || !cat.IsPublic {
				continue
			}
			if art.Status != StatusPublished {
				continue
			}
		}
		if strings.Contains(strings.ToLower(art.Title), query) || strings.Contains(strings.ToLower(art.Content), query) {
			out = append(out, art)
		}
	}
	return out, nil
}

func TestService_Categories(t *testing.T) {
	ctx := context.Background()
	store := newMockStore()
	svc := NewService(store)

	// Create
	cat, err := svc.CreateCategory(ctx, "General", "General help articles", true)
	require.NoError(t, err)
	assert.Equal(t, "General", cat.Name)

	// Duplicate
	_, err = svc.CreateCategory(ctx, "General", "Other", true)
	assert.ErrorIs(t, err, ErrDuplicateCategoryName)

	// List (public vs staff)
	privateCat, err := svc.CreateCategory(ctx, "Internal", "Staff only", false)
	require.NoError(t, err)

	listPublic, err := svc.ListCategories(ctx, false)
	require.NoError(t, err)
	assert.Len(t, listPublic, 1) // Only "General" is public

	listAll, err := svc.ListCategories(ctx, true)
	require.NoError(t, err)
	assert.Len(t, listAll, 2) // Both public and private

	// Update
	updated, err := svc.UpdateCategory(ctx, cat.ID, "General Updated", "New desc", true)
	require.NoError(t, err)
	assert.Equal(t, "General Updated", updated.Name)

	// Delete
	err = svc.DeleteCategory(ctx, privateCat.ID)
	require.NoError(t, err)
	_, err = svc.GetCategory(ctx, privateCat.ID)
	assert.ErrorIs(t, err, ErrCategoryNotFound)
}

func TestService_Articles(t *testing.T) {
	ctx := context.Background()
	store := newMockStore()
	svc := NewService(store)

	// Setup Category
	cat, err := svc.CreateCategory(ctx, "General", "Desc", true)
	require.NoError(t, err)

	privateCat, err := svc.CreateCategory(ctx, "Private", "Staff only", false)
	require.NoError(t, err)

	// Create Article
	art, err := svc.CreateArticle(ctx, cat.ID, "Reset Password", "Here is how...", StatusPublished)
	require.NoError(t, err)
	assert.Equal(t, "Reset Password", art.Title)

	// Create Draft Article
	draftArt, err := svc.CreateArticle(ctx, cat.ID, "Draft Art", "Working on it...", StatusDraft)
	require.NoError(t, err)

	// Create Article in Private Category
	privateArt, err := svc.CreateArticle(ctx, privateCat.ID, "Private Server IP", "192...", StatusPublished)
	require.NoError(t, err)

	// GetArticle - Public Access (isStaffOrAdmin = false)
	// 1. Published article in public category -> OK and increments views
	artPublic, err := svc.GetArticle(ctx, art.ID, false)
	require.NoError(t, err)
	assert.Equal(t, int32(1), artPublic.Views)

	// 2. Draft article -> ErrArticleNotFound
	_, err = svc.GetArticle(ctx, draftArt.ID, false)
	assert.ErrorIs(t, err, ErrArticleNotFound)

	// 3. Article in Private category -> ErrArticleNotFound
	_, err = svc.GetArticle(ctx, privateArt.ID, false)
	assert.ErrorIs(t, err, ErrArticleNotFound)

	// GetArticle - Staff Access (isStaffOrAdmin = true)
	// Draft should be visible
	artStaffDraft, err := svc.GetArticle(ctx, draftArt.ID, true)
	require.NoError(t, err)
	assert.Equal(t, StatusDraft, artStaffDraft.Status)

	// Private category article should be visible
	artStaffPrivate, err := svc.GetArticle(ctx, privateArt.ID, true)
	require.NoError(t, err)
	assert.Equal(t, "Private Server IP", artStaffPrivate.Title)

	// ListArticles - Public Access
	listPub, err := svc.ListArticles(ctx, false)
	require.NoError(t, err)
	assert.Len(t, listPub, 1) // Only "Reset Password" should be visible

	// ListArticles - Staff Access
	listStaff, err := svc.ListArticles(ctx, true)
	require.NoError(t, err)
	assert.Len(t, listStaff, 3) // All articles
}

func TestService_SearchArticles(t *testing.T) {
	ctx := context.Background()
	store := newMockStore()
	svc := NewService(store)

	// Setup Category
	cat, err := svc.CreateCategory(ctx, "General", "Desc", true)
	require.NoError(t, err)

	privateCat, err := svc.CreateCategory(ctx, "Private", "Staff only", false)
	require.NoError(t, err)

	// Create Articles
	_, err = svc.CreateArticle(ctx, cat.ID, "Reset Password Info", "Here is how to reset your password", StatusPublished)
	require.NoError(t, err)

	_, err = svc.CreateArticle(ctx, cat.ID, "Draft Art", "Working on password stuff", StatusDraft)
	require.NoError(t, err)

	_, err = svc.CreateArticle(ctx, privateCat.ID, "Private Server Password", "192...", StatusPublished)
	require.NoError(t, err)

	// Search - Public Access
	resPub, err := svc.SearchArticles(ctx, "password", false)
	require.NoError(t, err)
	assert.Len(t, resPub, 1)
	assert.Equal(t, "Reset Password Info", resPub[0].Title)

	// Search - Staff Access
	resStaff, err := svc.SearchArticles(ctx, "password", true)
	require.NoError(t, err)
	assert.Len(t, resStaff, 3)
}
