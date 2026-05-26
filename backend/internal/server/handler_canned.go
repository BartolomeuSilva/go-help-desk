package server

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/canned"
)

// handleListCannedResponses returns all canned responses.
// Both staff and admin roles have access to list templates.
func (s *Server) handleListCannedResponses(w http.ResponseWriter, r *http.Request) {
	list, err := s.canned.List(r.Context())
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, list)
}

// handleCreateCannedResponse creates a new canned response template. Admin only.
func (s *Server) handleCreateCannedResponse(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name    string `json:"name"`
		Content string `json:"content"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	res, err := s.canned.Create(r.Context(), body.Name, body.Content)
	if err != nil {
		if errors.Is(err, canned.ErrDuplicate) {
			Error(w, http.StatusConflict, "duplicate_name", err.Error())
			return
		}
		handleError(w, err)
		return
	}

	JSON(w, http.StatusCreated, res)
}

// handleUpdateCannedResponse modifies an existing canned response template. Admin only.
func (s *Server) handleUpdateCannedResponse(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "invalid_id", "invalid ID")
		return
	}

	var body struct {
		Name    string `json:"name"`
		Content string `json:"content"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	res, err := s.canned.Update(r.Context(), id, body.Name, body.Content)
	if err != nil {
		if errors.Is(err, canned.ErrDuplicate) {
			Error(w, http.StatusConflict, "duplicate_name", err.Error())
			return
		}
		handleError(w, err)
		return
	}

	JSON(w, http.StatusOK, res)
}

// handleDeleteCannedResponse deletes a canned response template. Admin only.
func (s *Server) handleDeleteCannedResponse(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "invalid_id", "invalid ID")
		return
	}

	if err := s.canned.Delete(r.Context(), id); err != nil {
		handleError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
