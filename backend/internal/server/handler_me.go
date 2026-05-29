package server

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	qrcode "github.com/skip2/go-qrcode"

	"github.com/publiciallc/go-help-desk/backend/internal/domain/auth"
	authmw "github.com/publiciallc/go-help-desk/backend/internal/middleware"
)

// GET /api/v1/me
func (s *Server) handleGetMe(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	u, err := s.users.GetByID(r.Context(), a.UserID)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, u)
}

// PATCH /api/v1/me/password
func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	var body struct {
		Password string `json:"password"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if len(body.Password) < 8 {
		Error(w, http.StatusBadRequest, "bad_request", "password must be at least 8 characters")
		return
	}
	if err := s.users.SetPassword(r.Context(), a.UserID, body.Password); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/v1/me/mfa/enroll
func (s *Server) handleMFAEnrollStart(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	secret, qrURL, err := s.users.EnrollMFA(r.Context(), a.UserID, s.cfg.BaseURL)
	if err != nil {
		handleError(w, err)
		return
	}
	// Render the otpauth:// URL as a QR code PNG encoded as a data URL so the
	// client can render it inline — never sending the secret to a third party.
	png, err := qrcode.Encode(qrURL, qrcode.Medium, 256)
	if err != nil {
		handleError(w, err)
		return
	}
	qrDataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)
	JSON(w, http.StatusOK, map[string]string{
		"secret":      secret,
		"qr_url":      qrURL,
		"qr_data_url": qrDataURL,
	})
}

// POST /api/v1/me/mfa/enroll/confirm
func (s *Server) handleMFAEnrollConfirm(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	var body struct {
		Code string `json:"code"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if err := s.users.ConfirmMFAEnrollment(r.Context(), a.UserID, body.Code); err != nil {
		Error(w, http.StatusBadRequest, "invalid_code", err.Error())
		return
	}
	// Successful enrollment satisfies this login's MFA challenge — flip the
	// session so forced-enrollment users aren't locked out until they log out.
	if err := s.writeSession(w, r, auth.SessionData{
		UserID:    a.UserID,
		Role:      a.Role,
		MFAPassed: true,
	}); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/v1/me/avatar
func (s *Server) handleUploadAvatar(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	if a == nil {
		Error(w, http.StatusUnauthorized, "unauthorized", "login required")
		return
	}
	if err := r.ParseMultipartForm(2 << 20); err != nil { // 2MB max
		Error(w, http.StatusBadRequest, "bad_request", "could not parse upload")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "field 'file' is required")
		return
	}
	defer file.Close()

	if header.Size > 2<<20 {
		Error(w, http.StatusRequestEntityTooLarge, "too_large", "file exceeds 2 MB limit")
		return
	}

	origName := header.Filename
	ext := strings.ToLower(filepath.Ext(origName))
	if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".gif" && ext != ".webp" {
		Error(w, http.StatusUnsupportedMediaType, "unsupported_type", "allowed types: PNG, JPG, JPEG, GIF, WEBP")
		return
	}

	data, err := io.ReadAll(io.LimitReader(file, 2<<20+1))
	if err != nil {
		Error(w, http.StatusInternalServerError, "read_error", "failed to read upload")
		return
	}

	// Crie o diretório de avatars
	subdir := filepath.Join(s.cfg.AttachmentDir, "avatars")
	if err := os.MkdirAll(subdir, 0o755); err != nil {
		Error(w, http.StatusInternalServerError, "storage_error", "could not create storage directory")
		return
	}

	// Remova qualquer avatar anterior do mesmo usuário para evitar sobras de outras extensões
	for _, e := range []string{".png", ".jpg", ".jpeg", ".gif", ".webp"} {
		_ = os.Remove(filepath.Join(subdir, a.UserID.String()+e))
	}

	// Grave o novo arquivo
	diskPath := filepath.Join(subdir, a.UserID.String()+ext)
	if err := os.WriteFile(diskPath, data, 0o644); err != nil {
		Error(w, http.StatusInternalServerError, "storage_error", "could not write file")
		return
	}

	// Salve a URL do avatar no banco de dados
	avatarURL := fmt.Sprintf("/api/v1/users/%s/avatar", a.UserID.String())
	if err := s.users.UpdateAvatar(r.Context(), a.UserID, avatarURL); err != nil {
		_ = os.Remove(diskPath)
		handleError(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]string{
		"avatar_url": avatarURL,
	})
}

// GET /api/v1/users/{id}/avatar
func (s *Server) handleServeAvatar(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		Error(w, http.StatusBadRequest, "invalid_id", "invalid user id")
		return
	}

	subdir := filepath.Join(s.cfg.AttachmentDir, "avatars")
	var diskPath string
	for _, ext := range []string{".png", ".jpg", ".jpeg", ".gif", ".webp"} {
		path := filepath.Join(subdir, userID.String()+ext)
		if _, err := os.Stat(path); err == nil {
			diskPath = path
			break
		}
	}

	if diskPath == "" {
		// Retorna 404 se não houver avatar personalizado
		http.Error(w, "avatar not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=86400") // cache por 1 dia
	http.ServeFile(w, r, diskPath)
}
