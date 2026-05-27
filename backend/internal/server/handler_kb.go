package server

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	authmw "github.com/publiciallc/go-help-desk/backend/internal/middleware"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/kb"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/user"
)

// Helper to determine if current actor is staff or admin
func (s *Server) isStaffOrAdmin(r *http.Request) bool {
	actor := authmw.GetActor(r)
	if actor == nil {
		return false
	}
	return actor.Role == user.RoleAdmin || actor.Role == user.RoleStaff
}

// GET /api/v1/kb/categories
func (s *Server) handleListKBCategories(w http.ResponseWriter, r *http.Request) {
	isStaffOrAdmin := s.isStaffOrAdmin(r)
	cats, err := s.kb.ListCategories(r.Context(), isStaffOrAdmin)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, cats)
}

// GET /api/v1/kb/articles/{id}
func (s *Server) handleGetKBArticle(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "invalid_id", "invalid article ID")
		return
	}

	isStaffOrAdmin := s.isStaffOrAdmin(r)
	art, err := s.kb.GetArticle(r.Context(), id, isStaffOrAdmin)
	if err != nil {
		if errors.Is(err, kb.ErrArticleNotFound) {
			Error(w, http.StatusNotFound, "not_found", err.Error())
			return
		}
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, art)
}

// GET /api/v1/kb/categories/{id}/articles
func (s *Server) handleListKBArticlesByCategory(w http.ResponseWriter, r *http.Request) {
	catID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "invalid_id", "invalid category ID")
		return
	}

	isStaffOrAdmin := s.isStaffOrAdmin(r)
	articles, err := s.kb.ListArticlesByCategory(r.Context(), catID, isStaffOrAdmin)
	if err != nil {
		if errors.Is(err, kb.ErrCategoryNotFound) {
			Error(w, http.StatusNotFound, "not_found", err.Error())
			return
		}
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, articles)
}

// POST /api/v1/admin/kb/categories
func (s *Server) handleCreateKBCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		IsPublic    bool   `json:"is_public"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	cat, err := s.kb.CreateCategory(r.Context(), body.Name, body.Description, body.IsPublic)
	if err != nil {
		if errors.Is(err, kb.ErrDuplicateCategoryName) {
			Error(w, http.StatusConflict, "duplicate_name", err.Error())
			return
		}
		if errors.Is(err, kb.ErrInvalidCategory) {
			Error(w, http.StatusBadRequest, "invalid_data", err.Error())
			return
		}
		handleError(w, err)
		return
	}

	JSON(w, http.StatusCreated, cat)
}

// PATCH /api/v1/admin/kb/categories/{id}
func (s *Server) handleUpdateKBCategory(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "invalid_id", "invalid category ID")
		return
	}

	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		IsPublic    bool   `json:"is_public"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	cat, err := s.kb.UpdateCategory(r.Context(), id, body.Name, body.Description, body.IsPublic)
	if err != nil {
		if errors.Is(err, kb.ErrDuplicateCategoryName) {
			Error(w, http.StatusConflict, "duplicate_name", err.Error())
			return
		}
		if errors.Is(err, kb.ErrCategoryNotFound) {
			Error(w, http.StatusNotFound, "not_found", err.Error())
			return
		}
		if errors.Is(err, kb.ErrInvalidCategory) {
			Error(w, http.StatusBadRequest, "invalid_data", err.Error())
			return
		}
		handleError(w, err)
		return
	}

	JSON(w, http.StatusOK, cat)
}

// DELETE /api/v1/admin/kb/categories/{id}
func (s *Server) handleDeleteKBCategory(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "invalid_id", "invalid category ID")
		return
	}

	if err := s.kb.DeleteCategory(r.Context(), id); err != nil {
		if errors.Is(err, kb.ErrCategoryNotFound) {
			Error(w, http.StatusNotFound, "not_found", err.Error())
			return
		}
		handleError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/admin/kb/articles
func (s *Server) handleCreateKBArticle(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CategoryID uuid.UUID `json:"category_id"`
		Title      string    `json:"title"`
		Content    string    `json:"content"`
		Status     string    `json:"status"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	art, err := s.kb.CreateArticle(r.Context(), body.CategoryID, body.Title, body.Content, body.Status)
	if err != nil {
		if errors.Is(err, kb.ErrCategoryNotFound) {
			Error(w, http.StatusNotFound, "category_not_found", err.Error())
			return
		}
		if errors.Is(err, kb.ErrInvalidArticle) {
			Error(w, http.StatusBadRequest, "invalid_data", err.Error())
			return
		}
		handleError(w, err)
		return
	}

	JSON(w, http.StatusCreated, art)
}

// PATCH /api/v1/admin/kb/articles/{id}
func (s *Server) handleUpdateKBArticle(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "invalid_id", "invalid article ID")
		return
	}

	var body struct {
		CategoryID uuid.UUID `json:"category_id"`
		Title      string    `json:"title"`
		Content    string    `json:"content"`
		Status     string    `json:"status"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	art, err := s.kb.UpdateArticle(r.Context(), id, body.CategoryID, body.Title, body.Content, body.Status)
	if err != nil {
		if errors.Is(err, kb.ErrArticleNotFound) {
			Error(w, http.StatusNotFound, "not_found", err.Error())
			return
		}
		if errors.Is(err, kb.ErrCategoryNotFound) {
			Error(w, http.StatusNotFound, "category_not_found", err.Error())
			return
		}
		if errors.Is(err, kb.ErrInvalidArticle) {
			Error(w, http.StatusBadRequest, "invalid_data", err.Error())
			return
		}
		handleError(w, err)
		return
	}

	JSON(w, http.StatusOK, art)
}

// DELETE /api/v1/admin/kb/articles/{id}
func (s *Server) handleDeleteKBArticle(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "invalid_id", "invalid article ID")
		return
	}

	if err := s.kb.DeleteArticle(r.Context(), id); err != nil {
		if errors.Is(err, kb.ErrArticleNotFound) {
			Error(w, http.StatusNotFound, "not_found", err.Error())
			return
		}
		handleError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
