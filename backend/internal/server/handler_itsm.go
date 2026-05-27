package server

import (
	"database/sql"
	"net/http"

	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/dbgen"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/ticket"
)

// ITSMDefaultEntry is the JSON representation of one CTI→TicketType mapping.
type ITSMDefaultEntry struct {
	CategoryID uuid.UUID           `json:"category_id"`
	TypeID     *uuid.UUID          `json:"type_id,omitempty"`
	ItemID     *uuid.UUID          `json:"item_id,omitempty"`
	TicketType ticket.TicketType   `json:"ticket_type"`
}

// sentinelUUID is used internally as the "no value" UUID in the DB PK.
var sentinelUUID = uuid.MustParse("00000000-0000-0000-0000-000000000000")

// coalesceUUID converts a *uuid.UUID to the sentinel when nil.
func coalesceUUID(p *uuid.UUID) interface{} {
	if p == nil {
		return nil // let COALESCE do its job with NULL
	}
	return *p
}

// GET /api/v1/itsm/default?category_id=&type_id=&item_id=
// Returns the default ticket type for the given CTI combination (hierarchical lookup).
func (s *Server) handleGetITSMDefault(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	categoryStr := q.Get("category_id")
	if categoryStr == "" {
		Error(w, http.StatusBadRequest, "bad_request", "category_id is required")
		return
	}
	categoryID, err := uuid.Parse(categoryStr)
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid category_id")
		return
	}

	// Parse optional type_id and item_id.
	typeID := sentinelUUID
	if ts := q.Get("type_id"); ts != "" {
		if parsed, err := uuid.Parse(ts); err == nil {
			typeID = parsed
		}
	}
	itemID := sentinelUUID
	if is := q.Get("item_id"); is != "" {
		if parsed, err := uuid.Parse(is); err == nil {
			itemID = parsed
		}
	}

	// Hierarchical lookup: try item, then type, then category.
	lookups := []dbgen.GetDefaultTicketTypeParams{
		{CategoryID: categoryID, TypeID: typeID, ItemID: itemID},
		{CategoryID: categoryID, TypeID: typeID, ItemID: sentinelUUID},
		{CategoryID: categoryID, TypeID: sentinelUUID, ItemID: sentinelUUID},
	}
	for _, params := range lookups {
		tt, err := s.db.GetDefaultTicketType(r.Context(), params)
		if err == nil {
			JSON(w, http.StatusOK, map[string]string{"ticket_type": tt})
			return
		}
	}
	// No default found — return null.
	JSON(w, http.StatusOK, map[string]interface{}{"ticket_type": nil})
}

// GET /api/v1/admin/itsm/defaults
func (s *Server) handleListITSMDefaults(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.ListDefaultTicketTypes(r.Context())
	if err != nil {
		handleError(w, err)
		return
	}

	out := make([]ITSMDefaultEntry, 0, len(rows))
	for _, row := range rows {
		entry := ITSMDefaultEntry{
			CategoryID: row.CategoryID,
			TicketType: ticket.TicketType(row.TicketType),
		}
		// Unmarshal optional UUIDs from interface{}.
		if row.TypeID != nil {
			if id, ok := uuidFromInterface(row.TypeID); ok {
				entry.TypeID = &id
			}
		}
		if row.ItemID != nil {
			if id, ok := uuidFromInterface(row.ItemID); ok {
				entry.ItemID = &id
			}
		}
		out = append(out, entry)
	}
	JSON(w, http.StatusOK, out)
}

// PUT /api/v1/admin/itsm/defaults
func (s *Server) handleSetITSMDefault(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CategoryID uuid.UUID           `json:"category_id"`
		TypeID     *uuid.UUID          `json:"type_id"`
		ItemID     *uuid.UUID          `json:"item_id"`
		TicketType ticket.TicketType   `json:"ticket_type"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if body.CategoryID == uuid.Nil {
		Error(w, http.StatusBadRequest, "bad_request", "category_id is required")
		return
	}
	if !ticket.ValidTicketTypes[body.TicketType] {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ticket_type")
		return
	}

	if err := s.db.UpsertDefaultTicketType(r.Context(), dbgen.UpsertDefaultTicketTypeParams{
		CategoryID: body.CategoryID,
		Column2:    coalesceUUID(body.TypeID),
		Column3:    coalesceUUID(body.ItemID),
		TicketType: string(body.TicketType),
	}); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/admin/itsm/defaults
func (s *Server) handleDeleteITSMDefault(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CategoryID uuid.UUID  `json:"category_id"`
		TypeID     *uuid.UUID `json:"type_id"`
		ItemID     *uuid.UUID `json:"item_id"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	if body.CategoryID == uuid.Nil {
		Error(w, http.StatusBadRequest, "bad_request", "category_id is required")
		return
	}

	typeID := sentinelUUID
	if body.TypeID != nil {
		typeID = *body.TypeID
	}
	itemID := sentinelUUID
	if body.ItemID != nil {
		itemID = *body.ItemID
	}

	if err := s.db.DeleteDefaultTicketType(r.Context(), dbgen.DeleteDefaultTicketTypeParams{
		CategoryID: body.CategoryID,
		TypeID:     typeID,
		ItemID:     itemID,
	}); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// uuidFromInterface safely parses a UUID from the interface{} values sqlc returns
// for CASE expressions that can be NULL.
func uuidFromInterface(v interface{}) (uuid.UUID, bool) {
	if v == nil {
		return uuid.Nil, false
	}
	switch val := v.(type) {
	case string:
		id, err := uuid.Parse(val)
		return id, err == nil
	case []byte:
		id, err := uuid.ParseBytes(val)
		return id, err == nil
	case uuid.UUID:
		return val, true
	}
	return uuid.Nil, false
}

// Ensure sql package is referenced (used implicitly through dbgen).
var _ = sql.NullString{}
