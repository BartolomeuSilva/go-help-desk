package canned

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// MockStore is a mock implementation of Store.
type MockStore struct {
	mock.Mock
}

func (m *MockStore) Create(ctx context.Context, name, content string) (CannedResponse, error) {
	args := m.Called(ctx, name, content)
	return args.Get(0).(CannedResponse), args.Error(1)
}

func (m *MockStore) GetByID(ctx context.Context, id uuid.UUID) (CannedResponse, error) {
	args := m.Called(ctx, id)
	return args.Get(0).(CannedResponse), args.Error(1)
}

func (m *MockStore) GetByName(ctx context.Context, name string) (CannedResponse, error) {
	args := m.Called(ctx, name)
	return args.Get(0).(CannedResponse), args.Error(1)
}

func (m *MockStore) List(ctx context.Context) ([]CannedResponse, error) {
	args := m.Called(ctx)
	return args.Get(0).([]CannedResponse), args.Error(1)
}

func (m *MockStore) Update(ctx context.Context, id uuid.UUID, name, content string) (CannedResponse, error) {
	args := m.Called(ctx, id, name, content)
	return args.Get(0).(CannedResponse), args.Error(1)
}

func (m *MockStore) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func TestService_Create(t *testing.T) {
	ctx := context.Background()

	t.Run("success", func(t *testing.T) {
		m := new(MockStore)
		svc := NewService(m)
		expected := CannedResponse{
			ID:        uuid.New(),
			Name:      "Test Canned",
			Content:   "This is a test",
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}

		m.On("GetByName", ctx, "Test Canned").Return(CannedResponse{}, errors.New("not found"))
		m.On("Create", ctx, "Test Canned", "This is a test").Return(expected, nil)

		res, err := svc.Create(ctx, "Test Canned", "This is a test")
		assert.NoError(t, err)
		assert.Equal(t, expected, res)
		m.AssertExpectations(t)
	})

	t.Run("validation failed — empty name", func(t *testing.T) {
		m := new(MockStore)
		svc := NewService(m)

		_, err := svc.Create(ctx, "   ", "Content")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "name must not be empty")
	})

	t.Run("validation failed — empty content", func(t *testing.T) {
		m := new(MockStore)
		svc := NewService(m)

		_, err := svc.Create(ctx, "Name", "")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "content must not be empty")
	})

	t.Run("duplicate name", func(t *testing.T) {
		m := new(MockStore)
		svc := NewService(m)
		existing := CannedResponse{ID: uuid.New(), Name: "Dup"}

		m.On("GetByName", ctx, "Dup").Return(existing, nil)

		_, err := svc.Create(ctx, "Dup", "Content")
		assert.Error(t, err)
		assert.Equal(t, ErrDuplicate, err)
		m.AssertExpectations(t)
	})
}

func TestService_Update(t *testing.T) {
	ctx := context.Background()
	id := uuid.New()

	t.Run("success", func(t *testing.T) {
		m := new(MockStore)
		svc := NewService(m)
		expected := CannedResponse{
			ID:        id,
			Name:      "New Name",
			Content:   "New Content",
			UpdatedAt: time.Now(),
		}

		m.On("GetByName", ctx, "New Name").Return(CannedResponse{}, errors.New("not found"))
		m.On("Update", ctx, id, "New Name", "New Content").Return(expected, nil)

		res, err := svc.Update(ctx, id, "New Name", "New Content")
		assert.NoError(t, err)
		assert.Equal(t, expected, res)
		m.AssertExpectations(t)
	})

	t.Run("duplicate name check", func(t *testing.T) {
		m := new(MockStore)
		svc := NewService(m)
		otherID := uuid.New()
		existing := CannedResponse{ID: otherID, Name: "Name Taken"}

		m.On("GetByName", ctx, "Name Taken").Return(existing, nil)

		_, err := svc.Update(ctx, id, "Name Taken", "Content")
		assert.Error(t, err)
		assert.Equal(t, ErrDuplicate, err)
		m.AssertExpectations(t)
	})
}
