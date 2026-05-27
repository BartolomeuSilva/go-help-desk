package server

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/user"
)

func isValidPermission(p user.Permission) bool {
	switch p {
	case user.PermTicketsCreate,
		user.PermTicketsRead,
		user.PermTicketsUpdate,
		user.PermTicketsReply,
		user.PermTicketsDelete,
		user.PermKBManage,
		user.PermCannedManage,
		user.PermTagsManage,
		user.PermUsersManage,
		user.PermSettingsManage:
		return true
	}
	return false
}

// GET /api/v1/admin/roles
func (s *Server) handleListRoles(w http.ResponseWriter, r *http.Request) {
	roles, err := s.users.ListRoles(r.Context())
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, roles)
}

// GET /api/v1/admin/roles/{name}
func (s *Server) handleGetRole(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	role, err := s.users.GetRole(r.Context(), name)
	if err != nil {
		Error(w, http.StatusNotFound, "not_found", "role not found")
		return
	}
	JSON(w, http.StatusOK, role)
}

// POST /api/v1/admin/roles
func (s *Server) handleCreateRole(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string            `json:"name"`
		Description string            `json:"description"`
		Permissions []user.Permission `json:"permissions"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" {
		Error(w, http.StatusBadRequest, "invalid_data", "role name is required")
		return
	}

	// Prevent creating roles with the same name as system roles (or empty)
	if name == string(user.RoleAdmin) || name == string(user.RoleStaff) || name == string(user.RoleUser) {
		Error(w, http.StatusConflict, "duplicate_name", "cannot create role with system name")
		return
	}

	for _, p := range body.Permissions {
		if !isValidPermission(p) {
			Error(w, http.StatusBadRequest, "invalid_permission", "invalid permission: "+string(p))
			return
		}
	}

	role, err := s.users.CreateRole(r.Context(), name, body.Description, body.Permissions)
	if err != nil {
		Error(w, http.StatusConflict, "duplicate_name", err.Error())
		return
	}

	JSON(w, http.StatusCreated, role)
}

// PATCH /api/v1/admin/roles/{name}
func (s *Server) handleUpdateRole(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	var body struct {
		Description string            `json:"description"`
		Permissions []user.Permission `json:"permissions"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	for _, p := range body.Permissions {
		if !isValidPermission(p) {
			Error(w, http.StatusBadRequest, "invalid_permission", "invalid permission: "+string(p))
			return
		}
	}

	role, err := s.users.UpdateRole(r.Context(), name, body.Description, body.Permissions)
	if err != nil {
		if errors.Is(err, errors.New("cannot update system roles")) || strings.Contains(err.Error(), "system") {
			Error(w, http.StatusBadRequest, "system_role", err.Error())
			return
		}
		handleError(w, err)
		return
	}

	JSON(w, http.StatusOK, role)
}

// DELETE /api/v1/admin/roles/{name}
func (s *Server) handleDeleteRole(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	err := s.users.DeleteRole(r.Context(), name)
	if err != nil {
		if strings.Contains(err.Error(), "system") {
			Error(w, http.StatusBadRequest, "system_role", err.Error())
			return
		}
		// If DB constraint fails, it's a conflict
		if strings.Contains(err.Error(), "violates foreign key constraint") || strings.Contains(err.Error(), "restrict") {
			Error(w, http.StatusConflict, "role_in_use", "cannot delete role because it is currently assigned to users")
			return
		}
		handleError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
