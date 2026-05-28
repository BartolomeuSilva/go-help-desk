package server

import (
	"net/http"
	"strings"
	"time"

	"github.com/microcosm-cc/bluemonday"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/dbgen"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/sla"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/ticket"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/user"
	authmw "github.com/publiciallc/go-help-desk/backend/internal/middleware"
)

type TicketResponse struct {
	ticket.Ticket
	SLA *sla.SLASummary `json:"sla,omitempty"`
}

func (s *Server) respondTickets(w http.ResponseWriter, r *http.Request, tickets []ticket.Ticket) {
	ctx := r.Context()
	slaEnabled := s.adminSvc.SLAEnabled(ctx)

	var pendingStatusID uuid.UUID
	if slaEnabled {
		statuses, err := s.tickets.ListStatuses(ctx)
		if err == nil {
			for _, st := range statuses {
				if st.Name == "Pending" {
					pendingStatusID = st.ID
					break
				}
			}
		}
	}

	now := time.Now()
	if tVal := ctx.Value("now"); tVal != nil {
		if tTime, ok := tVal.(time.Time); ok {
			now = tTime
		}
	}

	res := make([]TicketResponse, len(tickets))
	for i, t := range tickets {
		res[i] = TicketResponse{Ticket: t}
		if slaEnabled && pendingStatusID != uuid.Nil {
			history, err := s.tickets.ListStatusHistory(ctx, t.ID)
			if err == nil {
				summary, err := s.slaPolicies.GetSLASummary(ctx, t, now, history, pendingStatusID)
				if err == nil && summary != nil {
					res[i].SLA = summary
				}
			}
		}
	}

	JSON(w, http.StatusOK, res)
}

func (s *Server) respondTicket(w http.ResponseWriter, r *http.Request, t ticket.Ticket, statusCode int) {
	ctx := r.Context()
	slaEnabled := s.adminSvc.SLAEnabled(ctx)

	res := TicketResponse{Ticket: t}
	if slaEnabled {
		statuses, err := s.tickets.ListStatuses(ctx)
		if err == nil {
			var pendingStatusID uuid.UUID
			for _, st := range statuses {
				if st.Name == "Pending" {
					pendingStatusID = st.ID
					break
				}
			}
			if pendingStatusID != uuid.Nil {
				history, err := s.tickets.ListStatusHistory(ctx, t.ID)
				if err == nil {
					now := time.Now()
					if tVal := ctx.Value("now"); tVal != nil {
						if tTime, ok := tVal.(time.Time); ok {
							now = tTime
						}
					}
					summary, err := s.slaPolicies.GetSLASummary(ctx, t, now, history, pendingStatusID)
					if err == nil && summary != nil {
						res.SLA = summary
					}
				}
			}
		}
	}

	JSON(w, statusCode, res)
}

// GET /api/v1/tickets
// Returns tickets relevant to the current user:
//   - admin/staff: tickets assigned to them + tickets assigned to any of their groups
//   - user: tickets they reported
//
// Optional query params:
//   - assignee_group_id=<uuid> — tickets for a specific group (staff/admin only).
//   - scope=mine|unassigned|all — admin-only scopes. "unassigned" returns tickets
//     with no assignee user or group. "all" returns every ticket. Defaults to "mine".
func (s *Server) handleListTickets(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	ctx := r.Context()
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	scope := strings.TrimSpace(r.URL.Query().Get("scope"))

	// Specific group filter (staff/admin only).
	if gidStr := r.URL.Query().Get("assignee_group_id"); gidStr != "" {
		if a.Role == user.RoleUser {
			Error(w, http.StatusForbidden, "forbidden", "users cannot list group tickets")
			return
		}
		gid, err := uuid.Parse(gidStr)
		if err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "invalid assignee_group_id")
			return
		}
		var tickets []ticket.Ticket
		if q != "" {
			tickets, err = s.tickets.SearchByAssigneeGroup(ctx, gid, q, 100, 0)
		} else {
			tickets, err = s.tickets.ListByAssigneeGroup(ctx, gid, 100, 0)
		}
		if err != nil {
			handleError(w, err)
			return
		}
		s.respondTickets(w, r, tickets)
		return
	}

	// Admin-only scopes: unassigned queue or everything.
	if scope == "unassigned" || scope == "all" {
		if a.Role != user.RoleAdmin {
			Error(w, http.StatusForbidden, "forbidden", "only admins can use this scope")
			return
		}
		var (
			tickets []ticket.Ticket
			err     error
		)
		switch scope {
		case "unassigned":
			if q != "" {
				tickets, err = s.tickets.SearchUnassigned(ctx, q, 100, 0)
			} else {
				tickets, err = s.tickets.ListUnassigned(ctx, 100, 0)
			}
		case "all":
			if q != "" {
				tickets, err = s.tickets.SearchAll(ctx, q, 100, 0)
			} else {
				tickets, err = s.tickets.ListAll(ctx, 100, 0)
			}
		}
		if err != nil {
			handleError(w, err)
			return
		}
		s.respondTickets(w, r, tickets)
		return
	}

	// Users only see their own reported tickets.
	if a.Role == user.RoleUser {
		var (
			tickets []ticket.Ticket
			err     error
		)
		if q != "" {
			tickets, err = s.tickets.SearchByReporter(ctx, a.UserID, q, 100, 0)
		} else {
			tickets, err = s.tickets.ListByReporter(ctx, a.UserID, 100, 0)
		}
		if err != nil {
			handleError(w, err)
			return
		}
		s.respondTickets(w, r, tickets)
		return
	}

	// Staff/admin (scope=mine): tickets assigned to them + tickets assigned to their groups.
	var all []ticket.Ticket

	var err error
	var mine []ticket.Ticket
	if q != "" {
		mine, err = s.tickets.SearchByAssigneeUser(ctx, a.UserID, q, 100, 0)
	} else {
		mine, err = s.tickets.ListByAssigneeUser(ctx, a.UserID, 100, 0)
	}
	if err != nil {
		handleError(w, err)
		return
	}
	all = append(all, mine...)

	groups, err := s.groups.ListGroupsForUser(ctx, a.UserID)
	if err != nil {
		handleError(w, err)
		return
	}
	seen := make(map[uuid.UUID]bool, len(mine))
	for _, t := range mine {
		seen[t.ID] = true
	}
	for _, g := range groups {
		var gTickets []ticket.Ticket
		if q != "" {
			gTickets, err = s.tickets.SearchByAssigneeGroup(ctx, g.ID, q, 100, 0)
		} else {
			gTickets, err = s.tickets.ListByAssigneeGroup(ctx, g.ID, 100, 0)
		}
		if err != nil {
			handleError(w, err)
			return
		}
		for _, t := range gTickets {
			if !seen[t.ID] {
				seen[t.ID] = true
				all = append(all, t)
			}
		}
	}

	s.respondTickets(w, r, all)
}

// POST /api/v1/tickets
func (s *Server) handleCreateTicket(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	isGuest := a == nil

	if isGuest && !s.adminSvc.GuestSubmissionEnabled(r.Context()) {
		Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	var body struct {
		Subject     string     `json:"subject"`
		Description string     `json:"description"`
		CategoryID  uuid.UUID  `json:"category_id"`
		TypeID      *uuid.UUID `json:"type_id"`
		ItemID      *uuid.UUID `json:"item_id"`
		Priority    string     `json:"priority"`
		TicketType  string     `json:"ticket_type"` // ITSM v4; optional
		// Guest-only fields
		GuestEmail string `json:"guest_email"`
		GuestName  string `json:"guest_name"`
		GuestPhone string `json:"guest_phone"`
		// Custom fields: map of fieldDefId → value
		CustomFields map[string]string `json:"custom_fields"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	sanitizedSubject := strings.TrimSpace(bluemonday.StrictPolicy().Sanitize(body.Subject))
	if sanitizedSubject == "" {
		Error(w, http.StatusBadRequest, "bad_request", "subject is required")
		return
	}
	body.Subject = sanitizedSubject
	body.Description = bluemonday.UGCPolicy().Sanitize(body.Description)
	if body.CategoryID == uuid.Nil {
		Error(w, http.StatusBadRequest, "bad_request", "category_id is required")
		return
	}

	// Role-based field restrictions:
	//   - Guest: category only, no type or item; name + email required
	//   - User (authenticated non-staff): category + type only, no item
	//   - Staff/Admin: full CTI, no restrictions
	isStaffOrAdmin := !isGuest && (a.Role != user.RoleUser)

	if isGuest {
		body.TypeID = nil
		body.ItemID = nil
		if strings.TrimSpace(body.GuestEmail) == "" {
			Error(w, http.StatusBadRequest, "bad_request", "email is required")
			return
		}
		if strings.TrimSpace(body.GuestName) == "" {
			Error(w, http.StatusBadRequest, "bad_request", "name is required")
			return
		}
	} else if !isStaffOrAdmin {
		// Regular authenticated user: no item allowed
		body.ItemID = nil
	}

	in := ticket.CreateInput{
		Subject:     body.Subject,
		Description: body.Description,
		CategoryID:  body.CategoryID,
		TypeID:      body.TypeID,
		ItemID:      body.ItemID,
		Priority:    ticket.Priority(body.Priority),
	}
	if in.Priority == "" {
		in.Priority = ticket.PriorityMedium
	}
	// ITSM v4: accept ticket_type when feature is enabled and value is valid.
	if s.adminSvc.ITSMEnabled(r.Context()) {
		if body.TicketType != "" {
			tt := ticket.TicketType(body.TicketType)
			if ticket.ValidTicketTypes[tt] {
				in.TicketType = &tt
			}
		} else {
			// Autoinfer default ticket type hierarchically from CTI mapping.
			typeID := sentinelUUID
			if body.TypeID != nil {
				typeID = *body.TypeID
			}
			itemID := sentinelUUID
			if body.ItemID != nil {
				itemID = *body.ItemID
			}
			lookups := []dbgen.GetDefaultTicketTypeParams{
				{CategoryID: body.CategoryID, TypeID: typeID, ItemID: itemID},
				{CategoryID: body.CategoryID, TypeID: typeID, ItemID: sentinelUUID},
				{CategoryID: body.CategoryID, TypeID: sentinelUUID, ItemID: sentinelUUID},
			}
			for _, params := range lookups {
				ttStr, err := s.db.GetDefaultTicketType(r.Context(), params)
				if err == nil && ttStr != "" {
					tt := ticket.TicketType(ttStr)
					in.TicketType = &tt
					break
				}
			}
		}
	}

	if !isGuest {
		in.ReporterUserID = &a.UserID
	} else {
		email := body.GuestEmail
		in.GuestEmail = &email
		in.GuestName = strings.TrimSpace(body.GuestName)
		in.GuestPhone = strings.TrimSpace(body.GuestPhone)
	}

	t, err := s.tickets.Create(r.Context(), in)
	if err != nil {
		handleError(w, err)
		return
	}

	// Set any custom field values supplied on creation (best-effort; skip invalid IDs).
	for fieldDefIDStr, value := range body.CustomFields {
		if value == "" {
			continue
		}
		fieldDefID, parseErr := uuid.Parse(fieldDefIDStr)
		if parseErr != nil {
			continue
		}
		_ = s.customFields.SetValue(r.Context(), t.ID, fieldDefID, value)
	}

	s.respondTicket(w, r, t, http.StatusCreated)
}

// GET /api/v1/tickets/{id}
func (s *Server) handleGetTicket(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	id := chi.URLParam(r, "id")

	// Support both UUID and tracking number lookup.
	var t ticket.Ticket
	var err error
	if uid, parseErr := uuid.Parse(id); parseErr == nil {
		t, err = s.tickets.GetByID(r.Context(), uid)
	} else {
		t, err = s.tickets.GetByTrackingNumber(r.Context(), ticket.TrackingNumber(strings.ToUpper(id)))
	}
	if err != nil {
		handleError(w, err)
		return
	}

	// Users can only view their own tickets.
	if a != nil && a.Role == user.RoleUser {
		if t.ReporterUserID == nil || *t.ReporterUserID != a.UserID {
			Error(w, http.StatusForbidden, "forbidden", "not your ticket")
			return
		}
	}

	s.respondTicket(w, r, t, http.StatusOK)
}

func (s *Server) handleTicketEvents(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ticket ID")
		return
	}

	t, err := s.tickets.GetByID(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}

	// Users can only subscribe to their own tickets.
	if a != nil && a.Role == user.RoleUser {
		if t.ReporterUserID == nil || *t.ReporterUserID != a.UserID {
			Error(w, http.StatusForbidden, "forbidden", "not your ticket")
			return
		}
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		Error(w, http.StatusInternalServerError, "internal_error", "streaming not supported")
		return
	}

	// Send initial connection establish comment
	_, _ = w.Write([]byte(":\n\n"))
	flusher.Flush()

	ch := s.sseBroker.Subscribe(id)
	defer s.sseBroker.Unsubscribe(id, ch)

	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			_, err := w.Write([]byte(msg))
			if err != nil {
				return
			}
			flusher.Flush()
		case <-r.Context().Done():
			return
		case <-time.After(15 * time.Second):
			_, err := w.Write([]byte(":\n\n"))
			if err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// PATCH /api/v1/tickets/{id}
func (s *Server) handleUpdateTicket(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ticket ID")
		return
	}

	var body struct {
		StatusID        *uuid.UUID `json:"status_id"`
		AssigneeUserID  *uuid.UUID `json:"assignee_user_id"`
		AssigneeGroupID *uuid.UUID `json:"assignee_group_id"`
		CategoryID      *uuid.UUID `json:"category_id"`
		TypeID          *uuid.UUID `json:"type_id"`
		ItemID          *uuid.UUID `json:"item_id"`
		TicketType      *string    `json:"ticket_type"` // ITSM v4; staff/admin only
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	actor := ticket.Actor{UserID: &a.UserID, Role: a.Role}

	if body.StatusID != nil {
		if _, err := s.tickets.UpdateStatus(r.Context(), id, *body.StatusID, actor); err != nil {
			handleError(w, err)
			return
		}
	}
	if body.AssigneeUserID != nil || body.AssigneeGroupID != nil {
		if _, err := s.tickets.Assign(r.Context(), id, body.AssigneeUserID, body.AssigneeGroupID, actor); err != nil {
			handleError(w, err)
			return
		}
	}
	if body.CategoryID != nil {
		if a.Role == user.RoleUser {
			Error(w, http.StatusForbidden, "forbidden", "only staff can reclassify tickets")
			return
		}
		if _, err := s.tickets.UpdateCTI(r.Context(), id, *body.CategoryID, body.TypeID, body.ItemID); err != nil {
			handleError(w, err)
			return
		}
	}
	// ITSM v4: update ticket_type (staff/admin only, feature must be enabled).
	if body.TicketType != nil && s.adminSvc.ITSMEnabled(r.Context()) {
		if a.Role == user.RoleUser {
			Error(w, http.StatusForbidden, "forbidden", "only staff can set the ticket type")
			return
		}
		tt := ticket.TicketType(*body.TicketType)
		if !ticket.ValidTicketTypes[tt] {
			Error(w, http.StatusBadRequest, "bad_request", "invalid ticket_type")
			return
		}
		if _, err := s.tickets.SetTicketType(r.Context(), id, &tt, actor); err != nil {
			handleError(w, err)
			return
		}
	}

	t, err := s.tickets.GetByID(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	s.sseBroker.Broadcast(id, "refresh", "")
	s.respondTicket(w, r, t, http.StatusOK)
}

// POST /api/v1/tickets/{id}/replies
func (s *Server) handleAddReply(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ticket ID")
		return
	}

	var body struct {
		Body           string `json:"body"`
		Internal       bool   `json:"internal"`
		NotifyCustomer *bool  `json:"notify_customer"` // nil → defaults to true
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	sanitizedBody := bluemonday.UGCPolicy().Sanitize(body.Body)
	if strings.TrimSpace(sanitizedBody) == "" {
		Error(w, http.StatusBadRequest, "bad_request", "body is required")
		return
	}
	body.Body = sanitizedBody

	// Internal replies are staff/admin only.
	if body.Internal && a.Role == user.RoleUser {
		Error(w, http.StatusForbidden, "forbidden", "only staff can post internal notes")
		return
	}

	// notify_customer defaults to true; forced false for internal notes.
	notifyCustomer := body.NotifyCustomer == nil || *body.NotifyCustomer
	if body.Internal {
		notifyCustomer = false
	}

	// Look up the reporter's email so the service can include it in the
	// notification event payload. A lookup failure is non-fatal — we skip
	// the email rather than rejecting the reply.
	var reporterEmail string
	if notifyCustomer {
		if t, err := s.tickets.GetByID(r.Context(), id); err == nil {
			if t.GuestEmail != nil {
				reporterEmail = *t.GuestEmail
			} else if t.ReporterUserID != nil {
				if u, err := s.users.GetByID(r.Context(), *t.ReporterUserID); err == nil {
					reporterEmail = u.Email
				}
			}
		}
	}

	reopenDays := s.adminSvc.ReopenWindowDays(r.Context())
	reopenStatusName := s.adminSvc.ReopenTargetStatusName(r.Context())

	// Look up the reopen target status ID.
	statuses, err := s.tickets.ListStatuses(r.Context())
	if err != nil {
		handleError(w, err)
		return
	}
	var reopenStatusID uuid.UUID
	for _, st := range statuses {
		if st.Name == reopenStatusName {
			reopenStatusID = st.ID
			break
		}
	}

	actor := ticket.Actor{UserID: &a.UserID, Role: a.Role}
	reply, err := s.tickets.AddReply(r.Context(), id, body.Body, body.Internal, notifyCustomer, reporterEmail, actor, reopenDays, reopenStatusID)
	if err != nil {
		handleError(w, err)
		return
	}
	s.sseBroker.Broadcast(id, "refresh", "")
	JSON(w, http.StatusCreated, reply)
}

// GET /api/v1/tickets/{id}/replies
func (s *Server) handleListReplies(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ticket ID")
		return
	}
	replies, err := s.tickets.ListReplies(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, replies)
}

// POST /api/v1/tickets/{id}/resolve
func (s *Server) handleResolveTicket(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ticket ID")
		return
	}
	var body struct {
		Notes string `json:"notes"`
	}
	_ = DecodeJSON(r, &body)

	actor := ticket.Actor{UserID: &a.UserID, Role: a.Role}
	t, err := s.tickets.Resolve(r.Context(), id, body.Notes, actor)
	if err != nil {
		handleError(w, err)
		return
	}
	s.sseBroker.Broadcast(id, "refresh", "")
	JSON(w, http.StatusOK, t)
}

// POST /api/v1/tickets/{id}/reopen
func (s *Server) handleReopenTicket(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	if a.Role == user.RoleUser {
		Error(w, http.StatusForbidden, "forbidden", "users cannot directly reopen tickets")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ticket ID")
		return
	}

	statuses, err := s.tickets.ListStatuses(r.Context())
	if err != nil {
		handleError(w, err)
		return
	}
	targetName := s.adminSvc.ReopenTargetStatusName(r.Context())
	var targetID uuid.UUID
	for _, st := range statuses {
		if st.Name == targetName {
			targetID = st.ID
			break
		}
	}

	actor := ticket.Actor{UserID: &a.UserID, Role: a.Role}
	t, err := s.tickets.Reopen(r.Context(), id, targetID, actor)
	if err != nil {
		handleError(w, err)
		return
	}
	s.sseBroker.Broadcast(id, "refresh", "")
	JSON(w, http.StatusOK, t)
}

// POST /api/v1/tickets/{id}/links
func (s *Server) handleAddLink(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	sourceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ticket ID")
		return
	}
	var body struct {
		TargetID uuid.UUID `json:"target_id"`
		LinkType string    `json:"link_type"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}
	actor := ticket.Actor{UserID: &a.UserID, Role: a.Role}
	if err := s.tickets.AddLink(r.Context(), sourceID, body.TargetID, ticket.LinkType(body.LinkType), actor); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/v1/tickets/{id}/links/{targetId}/{linkType}
func (s *Server) handleRemoveLink(w http.ResponseWriter, r *http.Request) {
	sourceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ticket ID")
		return
	}
	targetID, err := uuid.Parse(chi.URLParam(r, "targetId"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid target ID")
		return
	}
	lt := ticket.LinkType(chi.URLParam(r, "linkType"))
	if err := s.tickets.RemoveLink(r.Context(), sourceID, targetID, lt); err != nil {
		handleError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/v1/tickets/{id}/history
func (s *Server) handleListStatusHistory(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ticket ID")
		return
	}
	// Users may only view history for their own tickets.
	if a != nil && a.Role == user.RoleUser {
		t, err := s.tickets.GetByID(r.Context(), id)
		if err != nil {
			handleError(w, err)
			return
		}
		if t.ReporterUserID == nil || *t.ReporterUserID != a.UserID {
			Error(w, http.StatusForbidden, "forbidden", "not your ticket")
			return
		}
	}
	history, err := s.tickets.ListStatusHistory(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, history)
}

// GET /api/v1/tickets/{id}/links
func (s *Server) handleListLinks(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ticket ID")
		return
	}
	links, err := s.tickets.ListLinks(r.Context(), id)
	if err != nil {
		handleError(w, err)
		return
	}
	JSON(w, http.StatusOK, links)
}

func (s *Server) handleTicketEventsPublic(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ticket ID")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		Error(w, http.StatusInternalServerError, "internal_error", "streaming not supported")
		return
	}

	// Send initial connection establish comment
	_, _ = w.Write([]byte(":\n\n"))
	flusher.Flush()

	ch := s.sseBroker.Subscribe(id)
	defer s.sseBroker.Unsubscribe(id, ch)

	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			_, err := w.Write([]byte(msg))
			if err != nil {
				return
			}
			flusher.Flush()
		case <-r.Context().Done():
			return
		case <-time.After(15 * time.Second):
			_, err := w.Write([]byte(":\n\n"))
			if err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// POST /api/v1/tickets/{id}/rate
func (s *Server) handleRateTicket(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid ticket ID")
		return
	}

	var body struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}
	if err := DecodeJSON(r, &body); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	actor := ticket.Actor{UserID: &a.UserID, Role: a.Role}
	var commentPtr *string
	if body.Comment != "" {
		commentPtr = &body.Comment
	}

	t, err := s.tickets.Rate(r.Context(), id, ticket.RateInput{
		Rating:  body.Rating,
		Comment: commentPtr,
	}, actor)
	if err != nil {
		handleError(w, err)
		return
	}

	s.sseBroker.Broadcast(id, "refresh", "")
	s.respondTicket(w, r, t, http.StatusOK)
}

