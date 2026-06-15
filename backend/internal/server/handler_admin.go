package server

import (
	"archive/zip"
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/database/authstore"
	"github.com/publiciallc/go-help-desk/backend/internal/database/pluginstore"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/auth"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/category"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/group"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/notification"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/plugin"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/ticket"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/user"
	"github.com/publiciallc/go-help-desk/backend/internal/integration/whatsapp"
	authmw "github.com/publiciallc/go-help-desk/backend/internal/middleware"
	"github.com/skip2/go-qrcode"
)

// ── Users ────────────────────────────────────────────────────────────────��───

// adminUserSummary is the list-view representation of a user for admins.
// It exposes disabled status and auth type without returning sensitive fields.
type adminUserSummary struct {
	ID          uuid.UUID `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	Role        user.Role `json:"role"`
	Disabled    bool      `json:"disabled"`
	AuthType    string    `json:"auth_type"` // "local", "saml", "both"
	MFAEnabled  bool      `json:"mfa_enabled"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// adminUserDetail extends the summary with group memberships.
type adminUserDetail struct {
	adminUserSummary
	HasPassword bool          `json:"has_password"`
	Groups      []group.Group `json:"groups"`
}

func authTypeOf(u user.User) string {
	hasLocal := u.PasswordHash != ""
	hasSAML := u.SAMLSubject != ""
	switch {
	case hasLocal && hasSAML:
		return "both"
	case hasSAML:
		return "saml"
	default:
		return "local"
	}
}

func toAdminSummary(u user.User) adminUserSummary {
	return adminUserSummary{
		ID:          u.ID,
		Email:       u.Email,
		DisplayName: u.DisplayName,
		Role:        u.Role,
		Disabled:    u.Disabled,
		AuthType:    authTypeOf(u),
		MFAEnabled:  u.MFAEnabled,
		CreatedAt:   u.CreatedAt,
		UpdatedAt:   u.UpdatedAt,
	}
}

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.users.ListAdmin(r.Context(), 200, 0)
	if err != nil {
		handleError(w, err)
		return
	}
	out := make([]adminUserSummary, len(users))
	for i, u := range users {
		out[i] = toAdminSummary(u)
	}
	JSON(w, http.StatusOK, out)
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	actor := authmw.GetActor(r)
	if actor == nil {
		Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	var body struct {
		Email       string `json:"email"`
		DisplayName string `json:"display_name"`
		Role        string `json:"role"`
		Password    string `json:"password"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	requestedRole := user.Role(body.Role)
	if requestedRole == user.RoleAdmin || requestedRole == user.RoleStaff {
		if actor.Role != user.RoleAdmin {
			Error(w, http.StatusForbidden, "forbidden", "only administrators can create administrator or staff accounts")
			return
		}
	}

	u, err := s.users.Create(r.Context(), user.CreateUserInput{
		Email:       body.Email,
		DisplayName: body.DisplayName,
		Role:        requestedRole,
		Password:    body.Password,
	})
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusCreated, u)
}

func (s *Server) handleGetUser(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid user ID")
		return
	}
	u, err := s.users.GetByIDAdmin(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	groups, err := s.groups.ListGroupsForUser(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	detail := adminUserDetail{
		adminUserSummary: toAdminSummary(u),
		HasPassword:      u.PasswordHash != "",
		Groups:           groups,
	}
	JSON(w, http.StatusOK, detail)
}

func (s *Server) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	actor := authmw.GetActor(r)
	if actor == nil {
		Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid user ID")
		return
	}
	var body struct {
		DisplayName *string `json:"display_name"`
		Email       *string `json:"email"`
		Role        *string `json:"role"`
		Disabled    *bool   `json:"disabled"`
		ResetMFA    bool    `json:"reset_mfa"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	targetUser, err := s.users.GetByIDAdmin(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}

	isTargetAdminOrStaff := targetUser.Role == user.RoleAdmin || targetUser.Role == user.RoleStaff
	isNewRoleAdminOrStaff := body.Role != nil && (user.Role(*body.Role) == user.RoleAdmin || user.Role(*body.Role) == user.RoleStaff)

	if isTargetAdminOrStaff || isNewRoleAdminOrStaff {
		if actor.Role != user.RoleAdmin {
			Error(w, http.StatusForbidden, "forbidden", "only administrators can manage or elevate administrator and staff accounts")
			return
		}
	}

	// Disable/enable toggle (processed before any profile update).
	if body.Disabled != nil {
		if *body.Disabled {
			if err := s.users.Disable(r.Context(), id); err != nil {
				handleError(w, err)
				return
			}
		} else {
			if err := s.users.Enable(r.Context(), id); err != nil {
				handleError(w, err)
				return
			}
		}
	}

	// MFA reset (works regardless of disabled state).
	if body.ResetMFA {
		if err := s.users.ResetMFA(r.Context(), id); err != nil {
			handleError(w, err)
			return
		}
	}

	// Profile field updates.
	if body.DisplayName != nil || body.Email != nil || body.Role != nil {
		u := targetUser
		if body.DisplayName != nil {
			u.DisplayName = *body.DisplayName
		}
		if body.Email != nil {
			u.Email = *body.Email
		}
		if body.Role != nil {
			u.Role = user.Role(*body.Role)
		}
		if err := s.users.Update(r.Context(), u); err != nil {
			handleError(w, err)
			return
		}
	}

	// Re-fetch and return the updated detail view.
	u, err := s.users.GetByIDAdmin(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	groups, err := s.groups.ListGroupsForUser(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	detail := adminUserDetail{
		adminUserSummary: toAdminSummary(u),
		HasPassword:      u.PasswordHash != "",
		Groups:           groups,
	}
	JSON(w, http.StatusOK, detail)
}

func (s *Server) handleAdminResetPassword(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid user ID")
		return
	}
	var body struct {
		NewPassword string `json:"new_password"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if err := s.users.AdminSetPassword(r.Context(), id, body.NewPassword); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid user ID")
		return
	}
	if err := s.users.SoftDelete(r.Context(), id); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Groups ───────────────────────────────────────────────────────────────────

func (s *Server) handleListGroups(w http.ResponseWriter, r *http.Request) {
	groups, err := s.groups.List(r.Context())
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, groups)
}

func (s *Server) handleCreateGroup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	g, err := s.groups.Create(r.Context(), body.Name, body.Description)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusCreated, g)
}

func (s *Server) handleGetGroup(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid group ID")
		return
	}
	g, err := s.groups.GetByID(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, g)
}

func (s *Server) handleUpdateGroup(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid group ID")
		return
	}
	existing, err := s.groups.GetByID(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	var body struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if body.Name != nil {
		existing.Name = *body.Name
	}
	if body.Description != nil {
		existing.Description = *body.Description
	}
	if err := s.groups.Update(r.Context(), existing); err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteGroup(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid group ID")
		return
	}
	if err := s.groups.Delete(r.Context(), id); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAddGroupMember(w http.ResponseWriter, r *http.Request) {
	groupID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid group ID")
		return
	}
	var body struct {
		UserID uuid.UUID `json:"user_id"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if err := s.groups.AddMember(r.Context(), groupID, body.UserID); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListGroupMembers(w http.ResponseWriter, r *http.Request) {
	groupID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid group ID")
		return
	}
	memberIDs, err := s.groups.ListMembers(r.Context(), groupID)
	if err != nil {
		handleError(w, err)
		return
	}
	members := make([]user.User, 0, len(memberIDs))
	for _, uid := range memberIDs {
		u, err := s.users.GetByID(r.Context(), uid)
		if err != nil {
			continue // skip deleted users
		}
		members = append(members, u)
	}
	JSON(w, http.StatusOK, members)
}

func (s *Server) handleRemoveGroupMember(w http.ResponseWriter, r *http.Request) {
	groupID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid group ID")
		return
	}
	userID, err := uuid.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid user ID")
		return
	}
	if err := s.groups.RemoveMember(r.Context(), groupID, userID); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListGroupScopes(w http.ResponseWriter, r *http.Request) {
	groupID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid group ID")
		return
	}
	scopes, err := s.groups.ListScopes(r.Context(), groupID)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, scopes)
}

func (s *Server) handleAddGroupScope(w http.ResponseWriter, r *http.Request) {
	groupID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid group ID")
		return
	}
	var body struct {
		CategoryID uuid.UUID  `json:"category_id"`
		TypeID     *uuid.UUID `json:"type_id"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if err := s.groups.AddScope(r.Context(), group.GroupScope{
		GroupID:    groupID,
		CategoryID: body.CategoryID,
		TypeID:     body.TypeID,
	}); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleRemoveGroupScope(w http.ResponseWriter, r *http.Request) {
	groupID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid group ID")
		return
	}
	var body struct {
		CategoryID uuid.UUID  `json:"category_id"`
		TypeID     *uuid.UUID `json:"type_id"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if err := s.groups.RemoveScope(r.Context(), groupID, body.CategoryID, body.TypeID); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleListGroupsForCategory returns groups with a category-level scope entry
// (type_id IS NULL) — used by the CTI editor to show which groups handle this category.
func (s *Server) handleListGroupsForCategory(w http.ResponseWriter, r *http.Request) {
	catID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid category id")
		return
	}
	groups, err := s.groups.ListGroupsForExactScope(r.Context(), catID, nil)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, groups)
}

// handleListGroupsForType returns groups with a type-specific scope entry
// — used by the CTI editor to show which groups handle this category+type.
func (s *Server) handleListGroupsForType(w http.ResponseWriter, r *http.Request) {
	catID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid category id")
		return
	}
	typeID, err := uuid.Parse(chi.URLParam(r, "typeId"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid type id")
		return
	}
	groups, err := s.groups.ListGroupsForExactScope(r.Context(), catID, &typeID)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, groups)
}

// ── Categories ───────────────────────────────────────────────────────────────

func (s *Server) handleListCategories(w http.ResponseWriter, r *http.Request) {
	cats, err := s.categories.ListCategories(r.Context(), false)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, cats)
}

func (s *Server) handleCreateCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name      string `json:"name"`
		SortOrder int    `json:"sort_order"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	c, err := s.categories.CreateCategory(r.Context(), body.Name, body.SortOrder)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusCreated, c)
}

func (s *Server) handleGetCategory(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ID")
		return
	}
	c, err := s.categories.GetCategory(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, c)
}

func (s *Server) handleUpdateCategory(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ID")
		return
	}
	existing, err := s.categories.GetCategory(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	var body struct {
		Name      *string `json:"name"`
		SortOrder *int    `json:"sort_order"`
		Active    *bool   `json:"active"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if body.Name != nil {
		existing.Name = *body.Name
	}
	if body.SortOrder != nil {
		existing.SortOrder = *body.SortOrder
	}
	if body.Active != nil {
		existing.Active = *body.Active
	}
	if err := s.categories.UpdateCategory(r.Context(), existing); err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteCategory(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ID")
		return
	}
	if err := s.categories.DeleteCategory(r.Context(), id); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListTypes(w http.ResponseWriter, r *http.Request) {
	catID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid category ID")
		return
	}
	types, err := s.categories.ListTypes(r.Context(), catID, false)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, types)
}

func (s *Server) handleCreateType(w http.ResponseWriter, r *http.Request) {
	catID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid category ID")
		return
	}
	var body struct {
		Name      string `json:"name"`
		SortOrder int    `json:"sort_order"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	tp, err := s.categories.CreateType(r.Context(), catID, body.Name, body.SortOrder)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusCreated, tp)
}

func (s *Server) handleUpdateType(w http.ResponseWriter, r *http.Request) {
	typeID, err := uuid.Parse(chi.URLParam(r, "typeId"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid type ID")
		return
	}
	existing, err := s.categories.GetType(r.Context(), typeID)
	if err != nil {
		handleError(w, err)
		return
	}
	var body struct {
		Name      *string `json:"name"`
		SortOrder *int    `json:"sort_order"`
		Active    *bool   `json:"active"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if body.Name != nil {
		existing.Name = *body.Name
	}
	if body.SortOrder != nil {
		existing.SortOrder = *body.SortOrder
	}
	if body.Active != nil {
		existing.Active = *body.Active
	}
	if err := s.categories.UpdateType(r.Context(), existing); err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteType(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "typeId"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid type ID")
		return
	}
	if err := s.categories.DeleteType(r.Context(), id); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListItems(w http.ResponseWriter, r *http.Request) {
	typeID, err := uuid.Parse(chi.URLParam(r, "typeId"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid type ID")
		return
	}
	items, err := s.categories.ListItems(r.Context(), typeID, false)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, items)
}

func (s *Server) handleCreateItem(w http.ResponseWriter, r *http.Request) {
	typeID, err := uuid.Parse(chi.URLParam(r, "typeId"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid type ID")
		return
	}
	var body struct {
		Name      string `json:"name"`
		SortOrder int    `json:"sort_order"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	it, err := s.categories.CreateItem(r.Context(), typeID, body.Name, body.SortOrder)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusCreated, it)
}

func (s *Server) handleUpdateItem(w http.ResponseWriter, r *http.Request) {
	itemID, err := uuid.Parse(chi.URLParam(r, "itemId"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid item ID")
		return
	}
	existing, err := s.categories.GetItem(r.Context(), itemID)
	if err != nil {
		handleError(w, err)
		return
	}
	var body struct {
		Name      *string `json:"name"`
		SortOrder *int    `json:"sort_order"`
		Active    *bool   `json:"active"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if body.Name != nil {
		existing.Name = *body.Name
	}
	if body.SortOrder != nil {
		existing.SortOrder = *body.SortOrder
	}
	if body.Active != nil {
		existing.Active = *body.Active
	}
	if err := s.categories.UpdateItem(r.Context(), existing); err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteItem(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "itemId"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid item ID")
		return
	}
	if err := s.categories.DeleteItem(r.Context(), id); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Statuses ─────────────────────────────────────────────────────────────────

func (s *Server) handleListStatuses(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	statuses, err := s.tickets.ListStatuses(ctx)
	if err != nil {
		handleError(w, err)
		return
	}

	// Ticket counts are scoped to the caller:
	//   - admin: every ticket (also drives the admin statuses page hard-delete check)
	//   - staff: tickets assigned to them or any of their groups
	//   - user:  tickets they reported
	a := authmw.GetActor(r)
	var groupIDs []uuid.UUID
	if a != nil && a.Role == user.RoleStaff {
		groups, err := s.groups.ListGroupsForUser(ctx, a.UserID)
		if err != nil {
			handleError(w, err)
			return
		}
		groupIDs = make([]uuid.UUID, len(groups))
		for i, g := range groups {
			groupIDs[i] = g.ID
		}
	}

	for i := range statuses {
		var count int64
		var cerr error
		switch {
		case a == nil || a.Role == user.RoleAdmin:
			count, cerr = s.tickets.CountByStatus(ctx, statuses[i].ID)
		case a.Role != user.RoleUser:
			count, cerr = s.tickets.CountByStatusForAssignee(ctx, statuses[i].ID, a.UserID, groupIDs)
		default:
			count, cerr = s.tickets.CountByStatusForReporter(ctx, statuses[i].ID, a.UserID)
		}
		if cerr == nil {
			statuses[i].TicketCount = count
		}
	}
	JSON(w, http.StatusOK, statuses)
}

func (s *Server) handleCreateStatus(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name      string `json:"name"`
		SortOrder int    `json:"sort_order"`
		Color     string `json:"color"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	st := ticket.Status{
		ID:        uuid.New(),
		Name:      body.Name,
		Kind:      ticket.StatusKindCustom,
		SortOrder: body.SortOrder,
		Color:     body.Color,
	}
	if err := s.tickets.AddStatus(r.Context(), st); err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusCreated, st)
}

func (s *Server) handleUpdateStatus(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid status ID")
		return
	}
	var body struct {
		Name      *string `json:"name"`
		SortOrder *int    `json:"sort_order"`
		Color     *string `json:"color"`
		Active    *bool   `json:"active"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	statuses, err := s.tickets.ListStatuses(r.Context())
	if err != nil {
		handleError(w, err)
		return
	}
	var st ticket.Status
	for _, s := range statuses {
		if s.ID == id {
			st = s
			break
		}
	}
	if st.ID == uuid.Nil {
		Error(w, http.StatusNotFound, "not_found", "status not found")
		return
	}
	if body.Name != nil {
		st.Name = *body.Name
	}
	if body.SortOrder != nil {
		st.SortOrder = *body.SortOrder
	}
	if body.Color != nil {
		st.Color = *body.Color
	}
	if body.Active != nil {
		if st.Kind == ticket.StatusKindSystem {
			Error(w, http.StatusForbidden, "forbidden", "system statuses cannot be deactivated")
			return
		}
		st.Active = *body.Active
	}
	if err := s.tickets.SaveStatus(r.Context(), st); err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, st)
}

func (s *Server) handleDeleteStatus(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid status ID")
		return
	}
	if err := s.tickets.RemoveStatus(r.Context(), id); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── SAML ──────────────────────────────────────────────────────────────────────

// GET /api/v1/admin/saml
func (s *Server) handleGetSAMLConfig(w http.ResponseWriter, r *http.Request) {
	metadataURL, certPEM, _ := s.adminSvc.GetSAMLConfig(r.Context())
	configured := s.adminSvc.SAMLConfigured(r.Context())
	JSON(w, http.StatusOK, map[string]any{
		"configured":      configured,
		"metadata_url":    metadataURL,
		"cert_pem":        certPEM,
		"sp_metadata_url": s.cfg.BaseURL + "/api/v1/auth/saml/metadata",
	})
}

// PUT /api/v1/admin/saml
// Accepts metadata_url, cert_pem, key_pem. Any field left empty retains the
// existing value from the database, so callers never need to re-upload a key
// they did not change. To clear all SAML config, send all three as empty strings.
func (s *Server) handleSaveSAMLConfig(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MetadataURL string `json:"metadata_url"`
		CertPEM     string `json:"cert_pem"`
		KeyPEM      string `json:"key_pem"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	// Fill in blanks from the existing saved config so partial updates work.
	existingURL, existingCert, existingKey := s.adminSvc.GetSAMLConfig(r.Context())
	metadataURL := body.MetadataURL
	if metadataURL == "" {
		metadataURL = existingURL
	}
	certPEM := body.CertPEM
	if certPEM == "" {
		certPEM = existingCert
	}
	keyPEM := body.KeyPEM
	if keyPEM == "" {
		keyPEM = existingKey
	}

	// Validate the cert/key pair when either is present.
	if certPEM != "" || keyPEM != "" {
		if _, err := tls.X509KeyPair([]byte(certPEM), []byte(keyPEM)); err != nil {
			Error(w, http.StatusBadRequest, "invalid_cert_key",
				"certificate and private key do not match or are invalid: "+err.Error())
			return
		}
	}

	if err := s.adminSvc.SetSAMLConfig(r.Context(), metadataURL, certPEM, keyPEM); err != nil {
		handleError(w, err)
		return
	}

	// Hot-reload the SAML middleware. A failure here is non-fatal: the config is
	// saved and will be retried on next restart, but we report it to the caller.
	if err := s.reloadSAML(r.Context()); err != nil {
		JSON(w, http.StatusOK, map[string]any{
			"warning": "SAML config saved but middleware could not be loaded: " + err.Error(),
		})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ── Settings ─────────────────────────────────────────────────────────────────

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	all, err := s.adminSvc.ListAll(r.Context())
	if err != nil {
		handleError(w, err)
		return
	}
	// Convert raw bytes to JSON-parseable map.
	out := make(map[string]json.RawMessage, len(all))
	for k, v := range all {
		out[k] = json.RawMessage(v)
	}
	JSON(w, http.StatusOK, out)
}

func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var body map[string]json.RawMessage
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	for k, v := range body {
		if err := s.adminSvc.SetRaw(r.Context(), k, []byte(v)); err != nil {
			handleError(w, err)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleWhatsAppStatus(w http.ResponseWriter, r *http.Request) {
	apiURL, apiToken, instanceName := s.adminSvc.WhatsAppConfig(r.Context())
	if apiURL == "" || apiToken == "" || instanceName == "" {
		JSON(w, http.StatusOK, map[string]string{"status": "unconfigured"})
		return
	}

	client := whatsapp.NewClient(apiURL, apiToken, instanceName)
	info, err := client.GetConnectionInfo(r.Context())
	if err != nil {
		slog.Error("whatsapp status check failed", "error", err)
		JSON(w, http.StatusOK, map[string]string{"status": "error", "message": err.Error()})
		return
	}

	JSON(w, http.StatusOK, map[string]string{
		"status": info.State,
		"number": info.Number,
	})
}

func (s *Server) handleWhatsAppQRCode(w http.ResponseWriter, r *http.Request) {
	apiURL, apiToken, instanceName := s.adminSvc.WhatsAppConfig(r.Context())
	if apiURL == "" || apiToken == "" || instanceName == "" {
		Error(w, http.StatusBadRequest, "bad_request", "whatsapp is not configured")
		return
	}

	client := whatsapp.NewClient(apiURL, apiToken, instanceName)
	code, err := client.GetQRCode(r.Context())
	if err != nil {
		slog.Error("whatsapp qrcode generation failed", "error", err)
		Error(w, http.StatusInternalServerError, "api_error", err.Error())
		return
	}

	var finalQRCode string
	if strings.HasPrefix(code, "data:image/") {
		finalQRCode = code
	} else {
		if code == "" {
			Error(w, http.StatusBadRequest, "bad_request", "no QR code returned. Check if the instance is already connected or try logging out.")
			return
		}
		pngBytes, err := qrcode.Encode(code, qrcode.Medium, 256)
		if err != nil {
			slog.Error("failed to generate QR Code PNG from raw text", "error", err)
			Error(w, http.StatusInternalServerError, "qr_error", "failed to generate QR Code image")
			return
		}
		base64Data := base64.StdEncoding.EncodeToString(pngBytes)
		finalQRCode = "data:image/png;base64," + base64Data
	}

	JSON(w, http.StatusOK, map[string]string{"qrcode": finalQRCode})
}

// ── Plugins ──────────────────────────────────────────────────────────────────

func (s *Server) handleListPlugins(w http.ResponseWriter, r *http.Request) {
	JSON(w, http.StatusOK, s.plugins.List())
}

func (s *Server) handleInstallPlugin(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(30 << 20); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "failed to parse multipart form")
		return
	}

	file, _, err := r.FormFile("plugin")
	if err != nil {
		file, _, err = r.FormFile("file")
		if err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "plugin or file parameter is required")
			return
		}
	}
	defer file.Close()

	zipBytes, err := io.ReadAll(file)
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "failed to read uploaded file")
		return
	}

	reader, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid zip archive: "+err.Error())
		return
	}

	var manifestBytes []byte
	var wasmBytes []byte
	for _, f := range reader.File {
		if f.Name == "manifest.json" {
			rc, err := f.Open()
			if err == nil {
				manifestBytes, _ = io.ReadAll(rc)
				rc.Close()
			}
		} else if f.Name == "plugin.wasm" {
			rc, err := f.Open()
			if err == nil {
				wasmBytes, _ = io.ReadAll(rc)
				rc.Close()
			}
		}
	}

	if len(manifestBytes) == 0 {
		Error(w, http.StatusBadRequest, "invalid_plugin", "manifest.json not found in zip archive")
		return
	}
	if len(wasmBytes) == 0 {
		Error(w, http.StatusBadRequest, "invalid_plugin", "plugin.wasm not found in zip archive")
		return
	}

	var manifestData struct {
		ID          string   `json:"id"`
		Name        string   `json:"name"`
		Version     string   `json:"version"`
		Description string   `json:"description"`
		Author      string   `json:"author"`
		Hooks       []string `json:"hooks"`
	}
	if err := json.Unmarshal(manifestBytes, &manifestData); err != nil {
		Error(w, http.StatusBadRequest, "invalid_manifest", "failed to parse manifest.json: "+err.Error())
		return
	}

	if manifestData.ID == "" || manifestData.Name == "" || manifestData.Version == "" {
		Error(w, http.StatusBadRequest, "invalid_manifest", "id, name, and version are required in manifest.json")
		return
	}

	pluginDir := s.cfg.AttachmentDir + "/../plugins"
	absPluginDir, err := filepath.Abs(pluginDir)
	if err != nil {
		absPluginDir = "/data/plugins"
	}
	if err := os.MkdirAll(absPluginDir, 0755); err != nil {
		slog.Error("failed to create plugins directory", "error", err)
		Error(w, http.StatusInternalServerError, "internal_error", "failed to initialize plugins directory")
		return
	}

	wasmPath := filepath.Join(absPluginDir, manifestData.ID+".wasm")
	if err := os.WriteFile(wasmPath, wasmBytes, 0644); err != nil {
		slog.Error("failed to write wasm file to disk", "error", err)
		Error(w, http.StatusInternalServerError, "internal_error", "failed to save plugin binary")
		return
	}

	hooks := make([]notification.EventType, len(manifestData.Hooks))
	for i, h := range manifestData.Hooks {
		hooks[i] = notification.EventType(h)
	}

	p := plugin.Plugin{
		Manifest: plugin.Manifest{
			ID:          manifestData.ID,
			Name:        manifestData.Name,
			Version:     manifestData.Version,
			Description: manifestData.Description,
			Author:      manifestData.Author,
			Hooks:       hooks,
			Runtime:     plugin.RuntimeWASM,
		},
		Enabled:     true,
		WASMPath:    wasmPath,
		InstalledAt: time.Now(),
	}

	if err := s.pluginStore.Create(r.Context(), p); err != nil {
		os.Remove(wasmPath)
		handleError(w, err)
		return
	}

	if err := s.plugins.LoadWASM(r.Context(), p); err != nil {
		_ = s.pluginStore.Delete(r.Context(), p.Manifest.ID)
		os.Remove(wasmPath)
		Error(w, http.StatusBadRequest, "load_error", "failed to compile wasm module: "+err.Error())
		return
	}

	JSON(w, http.StatusCreated, p)
}

func (s *Server) handleUpdatePlugin(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	p, err := s.pluginStore.GetByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, pluginstore.ErrNotFound) {
			// For native plugins that are not persisted, just toggle in registry
			var rerr error
			if body.Enabled {
				rerr = s.plugins.Enable(id)
			} else {
				rerr = s.plugins.Disable(id)
			}
			if rerr != nil {
				handleError(w, rerr)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		handleError(w, err)
		return
	}

	p.Enabled = body.Enabled
	if err := s.pluginStore.Update(r.Context(), p); err != nil {
		handleError(w, err)
		return
	}

	var rerr error
	if body.Enabled {
		rerr = s.plugins.Enable(id)
	} else {
		rerr = s.plugins.Disable(id)
	}
	if rerr != nil {
		handleError(w, rerr)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUninstallPlugin(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	p, err := s.pluginStore.GetByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, pluginstore.ErrNotFound) {
			Error(w, http.StatusNotFound, "not_found", "plugin not found")
			return
		}
		handleError(w, err)
		return
	}

	if err := s.pluginStore.Delete(r.Context(), id); err != nil {
		handleError(w, err)
		return
	}

	_ = s.plugins.Unload(id)

	if p.WASMPath != "" {
		_ = os.Remove(p.WASMPath)
	}

	w.WriteHeader(http.StatusNoContent)
}

// ── API Keys ─────────────────────────────────────────────────────────────────

func (s *Server) handleListAPIKeys(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	keys, err := s.authStore.ListByUser(r.Context(), a.UserID)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, keys)
}

func (s *Server) handleCreateAPIKey(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	var body struct {
		Name      string   `json:"name"`
		Scopes    []string `json:"scopes"`
		ExpiresAt *string  `json:"expires_at"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	raw, hashed, err := auth.GenerateToken()
	if err != nil {
		handleError(w, err)
		return
	}
	key := auth.APIKey{
		ID:          uuid.New(),
		Name:        body.Name,
		HashedToken: hashed,
		UserID:      a.UserID,
		Scopes:      body.Scopes,
		CreatedAt:   time.Now(),
	}
	if err := s.authStore.CreateAPIKey(r.Context(), key); err != nil {
		handleError(w, err)
		return
	}
	// Return the raw token once — it will never be shown again.
	JSON(w, http.StatusCreated, map[string]any{
		"id":    key.ID,
		"token": raw, // shown once
		"name":  key.Name,
	})
}

func (s *Server) handleDeleteAPIKey(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ID")
		return
	}
	if err := s.authStore.Delete(r.Context(), id); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── OAuth Clients ────────────────────────────────────────────────────────────

func (s *Server) handleListOAuthClients(w http.ResponseWriter, r *http.Request) {
	clients, err := s.authStore.ListOAuthClients(r.Context())
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, clients)
}

func (s *Server) handleCreateOAuthClient(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name   string   `json:"name"`
		Scopes []string `json:"scopes"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	raw, hashed, err := auth.GenerateToken()
	if err != nil {
		handleError(w, err)
		return
	}
	clientIDRaw, _, err2 := auth.GenerateToken()
	if err2 != nil {
		handleError(w, err2)
		return
	}
	client := auth.OAuthClient{
		ID:           uuid.New(),
		ClientID:     clientIDRaw[:16],
		HashedSecret: hashed,
		Name:         body.Name,
		Scopes:       body.Scopes,
		CreatedAt:    time.Now(),
	}
	if err := s.authStore.CreateOAuthClient(r.Context(), client); err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusCreated, map[string]any{
		"client_id":     client.ClientID,
		"client_secret": raw,
		"name":          client.Name,
	})
}

func (s *Server) handleDeleteOAuthClient(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ID")
		return
	}
	if err := s.authStore.DeleteOAuthClient(r.Context(), id); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

func (s *Server) handleListWebhooks(w http.ResponseWriter, r *http.Request) {
	webhooks, err := s.authStore.ListEnabledWebhooks(r.Context())
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, webhooks)
}

func (s *Server) handleCreateWebhook(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL    string   `json:"url"`
		Events []string `json:"events"`
		Secret string   `json:"secret"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	wh := authstore.WebhookConfig{
		ID:        uuid.New(),
		URL:       body.URL,
		Events:    body.Events,
		Secret:    body.Secret,
		Enabled:   true,
		CreatedAt: time.Now(),
	}
	if err := s.authStore.CreateWebhook(r.Context(), wh); err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusCreated, wh)
}

func (s *Server) handleUpdateWebhook(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ID")
		return
	}
	existing, err := s.authStore.GetWebhook(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	var body struct {
		URL     *string  `json:"url"`
		Events  []string `json:"events"`
		Secret  *string  `json:"secret"`
		Enabled *bool    `json:"enabled"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if body.URL != nil {
		existing.URL = *body.URL
	}
	if body.Events != nil {
		existing.Events = body.Events
	}
	if body.Secret != nil {
		existing.Secret = *body.Secret
	}
	if body.Enabled != nil {
		existing.Enabled = *body.Enabled
	}
	if err := s.authStore.UpdateWebhook(r.Context(), existing); err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteWebhook(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ID")
		return
	}
	if err := s.authStore.DeleteWebhook(r.Context(), id); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Ensure category types are imported (used in handler bodies).
var _ category.Category
var _ group.GroupScope
var _ ticket.Status
