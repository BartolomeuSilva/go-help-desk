package user

import (
	"context"

	"github.com/google/uuid"
)

// Store is the persistence interface for users.
// Implementations live in internal/database/userstore.
type Store interface {
	Create(ctx context.Context, u User) error
	GetByID(ctx context.Context, id uuid.UUID) (User, error)
	GetByIDAdmin(ctx context.Context, id uuid.UUID) (User, error)
	GetByEmail(ctx context.Context, email string) (User, error)
	GetBySAMLSubject(ctx context.Context, subject string) (User, error)
	Update(ctx context.Context, u User) error
	SoftDelete(ctx context.Context, id uuid.UUID) error
	Restore(ctx context.Context, id uuid.UUID) error
	Disable(ctx context.Context, id uuid.UUID) error
	Enable(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, limit, offset int) ([]User, error)
	ListAdmin(ctx context.Context, limit, offset int) ([]User, error)
	Count(ctx context.Context) (int64, error)
	ClearMFA(ctx context.Context, id uuid.UUID) error
	AdminSetPassword(ctx context.Context, id uuid.UUID, hash string) error

	CreateRole(ctx context.Context, r RoleDetails) error
	GetRole(ctx context.Context, name string) (RoleDetails, error)
	UpdateRole(ctx context.Context, r RoleDetails) error
	DeleteRole(ctx context.Context, name string) error
	ListRoles(ctx context.Context) ([]RoleDetails, error)
}
