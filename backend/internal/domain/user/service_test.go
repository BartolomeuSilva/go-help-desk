package user_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/user"
	"github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/require"
)

// fakeUserStore is an in-memory implementation of user.Store for unit tests.
type fakeUserStore struct {
	byID    map[uuid.UUID]user.User
	byEmail map[string]user.User
	bySAML  map[string]user.User
	roles   map[string]user.RoleDetails
}

func newFakeUserStore() *fakeUserStore {
	f := &fakeUserStore{
		byID:    make(map[uuid.UUID]user.User),
		byEmail: make(map[string]user.User),
		bySAML:  make(map[string]user.User),
		roles:   make(map[string]user.RoleDetails),
	}
	// Seed default system roles
	f.roles["admin"] = user.RoleDetails{
		Name:        "admin",
		Description: "Admin",
		Permissions: []user.Permission{
			user.PermTicketsCreate, user.PermTicketsRead, user.PermTicketsUpdate, user.PermTicketsReply,
			user.PermTicketsDelete, user.PermKBManage, user.PermCannedManage, user.PermTagsManage,
			user.PermUsersManage, user.PermSettingsManage,
		},
		IsSystem: true,
	}
	f.roles["staff"] = user.RoleDetails{
		Name:        "staff",
		Description: "Staff",
		Permissions: []user.Permission{
			user.PermTicketsCreate, user.PermTicketsRead, user.PermTicketsUpdate, user.PermTicketsReply,
			user.PermKBManage, user.PermCannedManage,
		},
		IsSystem: true,
	}
	f.roles["user"] = user.RoleDetails{
		Name:        "user",
		Description: "User",
		Permissions: []user.Permission{user.PermTicketsCreate},
		IsSystem:    true,
	}
	return f
}

func (f *fakeUserStore) Create(_ context.Context, u user.User) error {
	f.byID[u.ID] = u
	f.byEmail[u.Email] = u
	if u.SAMLSubject != "" {
		f.bySAML[u.SAMLSubject] = u
	}
	return nil
}

func (f *fakeUserStore) GetByID(_ context.Context, id uuid.UUID) (user.User, error) {
	u, ok := f.byID[id]
	if !ok {
		return user.User{}, errors.New("not found")
	}
	return u, nil
}

func (f *fakeUserStore) GetByEmail(_ context.Context, email string) (user.User, error) {
	u, ok := f.byEmail[email]
	if !ok {
		return user.User{}, errors.New("not found")
	}
	return u, nil
}

func (f *fakeUserStore) GetBySAMLSubject(_ context.Context, subject string) (user.User, error) {
	u, ok := f.bySAML[subject]
	if !ok {
		return user.User{}, errors.New("not found")
	}
	return u, nil
}

func (f *fakeUserStore) Update(_ context.Context, u user.User) error {
	f.byID[u.ID] = u
	f.byEmail[u.Email] = u
	if u.SAMLSubject != "" {
		f.bySAML[u.SAMLSubject] = u
	}
	return nil
}

func (f *fakeUserStore) SoftDelete(_ context.Context, id uuid.UUID) error {
	u, ok := f.byID[id]
	if !ok {
		return errors.New("not found")
	}
	now := time.Now()
	u.DeletedAt = &now
	f.byID[id] = u
	f.byEmail[u.Email] = u
	return nil
}

func (f *fakeUserStore) List(_ context.Context, _, _ int) ([]user.User, error) {
	out := make([]user.User, 0, len(f.byID))
	for _, u := range f.byID {
		out = append(out, u)
	}
	return out, nil
}

func (f *fakeUserStore) GetByIDAdmin(_ context.Context, id uuid.UUID) (user.User, error) {
	u, ok := f.byID[id]
	if !ok {
		return user.User{}, errors.New("not found")
	}
	return u, nil
}

func (f *fakeUserStore) Restore(_ context.Context, id uuid.UUID) error {
	u, ok := f.byID[id]
	if !ok {
		return errors.New("not found")
	}
	u.DeletedAt = nil
	f.byID[id] = u
	f.byEmail[u.Email] = u
	return nil
}

func (f *fakeUserStore) Disable(_ context.Context, id uuid.UUID) error {
	u, ok := f.byID[id]
	if !ok {
		return errors.New("not found")
	}
	u.Disabled = true
	f.byID[id] = u
	f.byEmail[u.Email] = u
	return nil
}

func (f *fakeUserStore) Enable(_ context.Context, id uuid.UUID) error {
	u, ok := f.byID[id]
	if !ok {
		return errors.New("not found")
	}
	u.Disabled = false
	f.byID[id] = u
	f.byEmail[u.Email] = u
	return nil
}

func (f *fakeUserStore) ListAdmin(_ context.Context, _, _ int) ([]user.User, error) {
	out := make([]user.User, 0, len(f.byID))
	for _, u := range f.byID {
		out = append(out, u)
	}
	return out, nil
}

func (f *fakeUserStore) Count(_ context.Context) (int64, error) {
	return int64(len(f.byID)), nil
}

func (f *fakeUserStore) ClearMFA(_ context.Context, id uuid.UUID) error {
	u, ok := f.byID[id]
	if !ok {
		return errors.New("not found")
	}
	u.MFAEnabled = false
	u.MFASecret = ""
	f.byID[id] = u
	f.byEmail[u.Email] = u
	return nil
}

func (f *fakeUserStore) AdminSetPassword(_ context.Context, id uuid.UUID, hash string) error {
	u, ok := f.byID[id]
	if !ok {
		return errors.New("not found")
	}
	u.PasswordHash = hash
	f.byID[id] = u
	f.byEmail[u.Email] = u
	return nil
}

func (f *fakeUserStore) CreateRole(_ context.Context, r user.RoleDetails) error {
	f.roles[r.Name] = r
	return nil
}

func (f *fakeUserStore) GetRole(_ context.Context, name string) (user.RoleDetails, error) {
	r, ok := f.roles[name]
	if !ok {
		return user.RoleDetails{}, errors.New("not found")
	}
	return r, nil
}

func (f *fakeUserStore) UpdateRole(_ context.Context, r user.RoleDetails) error {
	if existing, ok := f.roles[r.Name]; ok && existing.IsSystem {
		return errors.New("cannot update system role")
	}
	f.roles[r.Name] = r
	return nil
}

func (f *fakeUserStore) DeleteRole(_ context.Context, name string) error {
	if existing, ok := f.roles[name]; ok && existing.IsSystem {
		return errors.New("cannot delete system role")
	}
	delete(f.roles, name)
	return nil
}

func (f *fakeUserStore) ListRoles(_ context.Context) ([]user.RoleDetails, error) {
	out := make([]user.RoleDetails, 0, len(f.roles))
	for _, r := range f.roles {
		out = append(out, r)
	}
	return out, nil
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestUserService_Create_Valid(t *testing.T) {
	svc := user.NewService(newFakeUserStore())
	u, err := svc.Create(context.Background(), user.CreateUserInput{
		Email:       "Alice@Example.COM",
		DisplayName: "Alice",
		Role:        user.RoleUser,
		Password:    "secret123",
	})
	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, u.ID)
	require.Equal(t, "alice@example.com", u.Email) // normalized to lowercase
	require.NotEmpty(t, u.PasswordHash)
	require.NotEqual(t, "secret123", u.PasswordHash) // must be hashed
}

func TestUserService_Create_MissingEmail(t *testing.T) {
	svc := user.NewService(newFakeUserStore())
	_, err := svc.Create(context.Background(), user.CreateUserInput{
		DisplayName: "Alice",
		Role:        user.RoleUser,
	})
	require.Error(t, err)
}

func TestUserService_VerifyPassword_Valid(t *testing.T) {
	svc := user.NewService(newFakeUserStore())
	_, err := svc.Create(context.Background(), user.CreateUserInput{
		Email:       "bob@example.com",
		DisplayName: "Bob",
		Role:        user.RoleStaff,
		Password:    "correcthorse",
	})
	require.NoError(t, err)

	got, err := svc.VerifyPassword(context.Background(), "bob@example.com", "correcthorse")
	require.NoError(t, err)
	require.Equal(t, "bob@example.com", got.Email)
}

func TestUserService_VerifyPassword_WrongPassword(t *testing.T) {
	svc := user.NewService(newFakeUserStore())
	_, err := svc.Create(context.Background(), user.CreateUserInput{
		Email:       "carol@example.com",
		DisplayName: "Carol",
		Role:        user.RoleUser,
		Password:    "rightpass",
	})
	require.NoError(t, err)

	_, err = svc.VerifyPassword(context.Background(), "carol@example.com", "wrongpass")
	require.Error(t, err)
}

func TestUserService_VerifyPassword_InactiveUser(t *testing.T) {
	svc := user.NewService(newFakeUserStore())
	u, err := svc.Create(context.Background(), user.CreateUserInput{
		Email:       "dave@example.com",
		DisplayName: "Dave",
		Role:        user.RoleUser,
		Password:    "pass",
	})
	require.NoError(t, err)
	require.NoError(t, svc.SoftDelete(context.Background(), u.ID))

	_, err = svc.VerifyPassword(context.Background(), "dave@example.com", "pass")
	require.Error(t, err)
}

func TestUserService_SetPassword(t *testing.T) {
	svc := user.NewService(newFakeUserStore())
	u, err := svc.Create(context.Background(), user.CreateUserInput{
		Email:       "eve@example.com",
		DisplayName: "Eve",
		Role:        user.RoleUser,
		Password:    "oldpass",
	})
	require.NoError(t, err)

	require.NoError(t, svc.SetPassword(context.Background(), u.ID, "newpass"))

	_, err = svc.VerifyPassword(context.Background(), "eve@example.com", "oldpass")
	require.Error(t, err, "old password should no longer work")

	_, err = svc.VerifyPassword(context.Background(), "eve@example.com", "newpass")
	require.NoError(t, err, "new password should work")
}

func TestUserService_EnrollMFA(t *testing.T) {
	svc := user.NewService(newFakeUserStore())
	u, err := svc.Create(context.Background(), user.CreateUserInput{
		Email:       "frank@example.com",
		DisplayName: "Frank",
		Role:        user.RoleUser,
		Password:    "pass",
	})
	require.NoError(t, err)

	secret, qrURL, err := svc.EnrollMFA(context.Background(), u.ID, "http://localhost")
	require.NoError(t, err)
	require.NotEmpty(t, secret)
	require.NotEmpty(t, qrURL)
}

func TestUserService_ConfirmMFAEnrollment(t *testing.T) {
	svc := user.NewService(newFakeUserStore())
	u, err := svc.Create(context.Background(), user.CreateUserInput{
		Email:       "grace@example.com",
		DisplayName: "Grace",
		Role:        user.RoleUser,
		Password:    "pass",
	})
	require.NoError(t, err)

	secret, _, err := svc.EnrollMFA(context.Background(), u.ID, "http://localhost")
	require.NoError(t, err)

	code, err := totp.GenerateCode(secret, time.Now())
	require.NoError(t, err)

	require.NoError(t, svc.ConfirmMFAEnrollment(context.Background(), u.ID, code))

	got, err := svc.GetByID(context.Background(), u.ID)
	require.NoError(t, err)
	require.True(t, got.MFAEnabled)
}

func TestUserService_RolesAndPermissions(t *testing.T) {
	fake := newFakeUserStore()
	svc := user.NewService(fake)

	// Test default roles
	has, err := svc.HasPermission(context.Background(), user.RoleAdmin, user.PermSettingsManage)
	require.NoError(t, err)
	require.True(t, has)

	has, err = svc.HasPermission(context.Background(), user.RoleStaff, user.PermSettingsManage)
	require.NoError(t, err)
	require.False(t, has)

	// Create custom role
	customPerms := []user.Permission{user.PermTicketsRead, user.PermTicketsReply}
	role, err := svc.CreateRole(context.Background(), "agent-level-1", "Level 1 Agent", customPerms)
	require.NoError(t, err)
	require.Equal(t, "agent-level-1", role.Name)

	// Test cache hit / lazy load
	has, err = svc.HasPermission(context.Background(), user.Role("agent-level-1"), user.PermTicketsReply)
	require.NoError(t, err)
	require.True(t, has)

	has, err = svc.HasPermission(context.Background(), user.Role("agent-level-1"), user.PermSettingsManage)
	require.NoError(t, err)
	require.False(t, has)

	// Update custom role
	updatedPerms := []user.Permission{user.PermTicketsRead, user.PermTicketsReply, user.PermCannedManage}
	_, err = svc.UpdateRole(context.Background(), "agent-level-1", "Level 1 Agent Updated", updatedPerms)
	require.NoError(t, err)

	has, err = svc.HasPermission(context.Background(), user.Role("agent-level-1"), user.PermCannedManage)
	require.NoError(t, err)
	require.True(t, has)

	// Delete custom role
	require.NoError(t, svc.DeleteRole(context.Background(), "agent-level-1"))
	_, err = svc.GetRole(context.Background(), "agent-level-1")
	require.Error(t, err)
}

