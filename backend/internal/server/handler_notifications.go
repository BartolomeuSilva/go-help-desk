package server

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/microcosm-cc/bluemonday"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/ticket"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/user"
	authmw "github.com/publiciallc/go-help-desk/backend/internal/middleware"
)

// replyNotification is the payload pushed over the per-user SSE stream when a new
// message arrives on a ticket the user is involved in.
type replyNotification struct {
	ReplyID       uuid.UUID `json:"reply_id"`
	TicketID      uuid.UUID `json:"ticket_id"`
	TicketSubject string    `json:"ticket_subject"`
	Author        string    `json:"author"`
	Preview       string    `json:"preview"`
	CreatedAt     time.Time `json:"created_at"`
}

// GET /api/v1/notifications/stream
// Streams notification events for the authenticated user, regardless of which
// page they have open. One user may hold several connections (multiple tabs).
func (s *Server) handleNotificationStream(w http.ResponseWriter, r *http.Request) {
	a := authmw.GetActor(r)
	if a == nil {
		Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
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

	_, _ = w.Write([]byte(":\n\n"))
	flusher.Flush()

	ch := s.userBroker.Subscribe(a.UserID)
	defer s.userBroker.Unsubscribe(a.UserID, ch)

	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			if _, err := w.Write([]byte(msg)); err != nil {
				return
			}
			flusher.Flush()
		case <-r.Context().Done():
			return
		case <-time.After(15 * time.Second):
			if _, err := w.Write([]byte(":\n\n")); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// broadcastReplyNotification pushes a "notification" event to the other side of
// the conversation, except the reply's author. authorIsStaff tells us which
// direction the message flows: a staff reply notifies the customer, a customer
// reply notifies the whole support team.
func (s *Server) broadcastReplyNotification(ctx context.Context, t ticket.Ticket, reply ticket.Reply, authorIsStaff bool) {
	author := ""
	if reply.AuthorName != nil {
		author = *reply.AuthorName
	}

	payload := replyNotification{
		ReplyID:       reply.ID,
		TicketID:      t.ID,
		TicketSubject: t.Subject,
		Author:        author,
		Preview:       previewText(reply.Body),
		CreatedAt:     reply.CreatedAt,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}

	for _, uid := range s.replyRecipients(ctx, t, reply, authorIsStaff) {
		s.userBroker.Broadcast(uid, "notification", string(data))
	}
}

// replyRecipients returns the de-duplicated set of user IDs that should be
// notified about a reply, excluding its author.
func (s *Server) replyRecipients(ctx context.Context, t ticket.Ticket, reply ticket.Reply, authorIsStaff bool) []uuid.UUID {
	seen := map[uuid.UUID]bool{}
	if reply.AuthorID != nil {
		seen[*reply.AuthorID] = true // never notify the author
	}
	var out []uuid.UUID
	add := func(id *uuid.UUID) {
		if id == nil || seen[*id] {
			return
		}
		seen[*id] = true
		out = append(out, *id)
	}

	switch {
	case reply.Internal:
		// Internal notes are staff-only.
		s.addStaffRecipients(ctx, add)
	case authorIsStaff:
		// Support replied → notify the customer who opened the ticket.
		add(t.ReporterUserID)
	default:
		// Customer replied → notify the support team. Tickets are often
		// unassigned, so notifying all staff/admins is what keeps support
		// from missing a message.
		s.addStaffRecipients(ctx, add)
	}
	return out
}

// addStaffRecipients passes the ID of every active staff/admin user to add().
func (s *Server) addStaffRecipients(ctx context.Context, add func(*uuid.UUID)) {
	users, err := s.users.List(ctx, 10000, 0)
	if err != nil {
		return
	}
	for i := range users {
		if users[i].Disabled {
			continue
		}
		if users[i].Role == user.RoleStaff || users[i].Role == user.RoleAdmin {
			add(&users[i].ID)
		}
	}
}

// previewText strips HTML from a reply body to produce a short plain-text preview.
func previewText(body string) string {
	text := bluemonday.StrictPolicy().Sanitize(body)
	runes := []rune(text)
	if len(runes) > 200 {
		return string(runes[:200]) + "…"
	}
	return text
}
