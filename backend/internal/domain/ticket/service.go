package ticket

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/audit"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/group"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/notification"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/user"
)

// Actor is the identity performing an operation. Both authenticated users and
// the system scheduler are actors; system actors have a nil UserID.
type Actor struct {
	UserID *uuid.UUID
	Role   user.Role
}

// SystemActor is used by the auto-close scheduler and other system processes.
var SystemActor = Actor{UserID: nil, Role: user.RoleAdmin}

// systemStatuses caches the IDs of the three system statuses after they are
// loaded from the database at startup. This avoids hitting the DB on every
// status check.
type systemStatuses struct {
	newID      uuid.UUID
	resolvedID uuid.UUID
	closedID   uuid.UUID

	// full Status values, needed for CanTransitionStatus
	resolved Status
	closed   Status
}

// Service orchestrates all ticket lifecycle operations.
type Service struct {
	store      Store
	statuses   StatusStore
	groupStore GroupStore
	dispatcher notification.Dispatcher
	auditStore audit.Store
	sla        SLAService // may be nil when SLA is disabled

	// cached at startup
	sys *systemStatuses
}

// GroupStore is the narrow interface the ticket service needs from the group layer.
type GroupStore interface {
	ListGroupsInScope(ctx context.Context, categoryID uuid.UUID, typeID *uuid.UUID) ([]group.Group, error)
}

// SLAService is the narrow interface the ticket service needs from the SLA layer.
type SLAService interface {
	AttachPolicy(ctx context.Context, t Ticket) error
	RecordFirstResponse(ctx context.Context, ticketID uuid.UUID, at time.Time) error
}

// NewService constructs a Service. Call LoadSystemStatuses before use.
func NewService(
	store Store,
	statuses StatusStore,
	groupStore GroupStore,
	dispatcher notification.Dispatcher,
	auditStore audit.Store,
	sla SLAService, // nil when SLA feature is disabled
) *Service {
	return &Service{
		store:      store,
		statuses:   statuses,
		groupStore: groupStore,
		dispatcher: dispatcher,
		auditStore: auditStore,
		sla:        sla,
	}
}

// LoadSystemStatuses loads the three system status IDs from the database and
// caches them. Must be called once after startup before any other method.
func (s *Service) LoadSystemStatuses(ctx context.Context) error {
	newSt, err := s.statuses.GetStatusByName(ctx, StatusNameNew)
	if err != nil {
		return fmt.Errorf("loading New status: %w", err)
	}
	resolvedSt, err := s.statuses.GetStatusByName(ctx, StatusNameResolved)
	if err != nil {
		return fmt.Errorf("loading Resolved status: %w", err)
	}
	closedSt, err := s.statuses.GetStatusByName(ctx, StatusNameClosed)
	if err != nil {
		return fmt.Errorf("loading Closed status: %w", err)
	}
	s.sys = &systemStatuses{
		newID:      newSt.ID,
		resolvedID: resolvedSt.ID,
		closedID:   closedSt.ID,
		resolved:   resolvedSt,
		closed:     closedSt,
	}
	return nil
}

// CreateInput is the data needed to open a new ticket.
type CreateInput struct {
	Subject     string
	Description string
	CategoryID  uuid.UUID
	TypeID      *uuid.UUID
	ItemID      *uuid.UUID
	Priority    Priority
	TicketType  *TicketType // ITSM v4: optional, only used when ITSMEnabled

	// Exactly one of ReporterUserID or GuestEmail must be set.
	ReporterUserID *uuid.UUID
	GuestEmail     *string
	GuestName      string // required when GuestEmail is set
	GuestPhone     string // optional
	Source         string
	WhatsappPhone  *string

	// ReporterEmail is the address to notify about the new ticket. The caller
	// resolves it (the guest's email, or the registered reporter's email) so the
	// domain layer needs no user lookup. Empty when no email should be sent.
	ReporterEmail string
}

// Create opens a new ticket, fires the created event, and optionally attaches
// an SLA policy.
func (s *Service) Create(ctx context.Context, in CreateInput) (Ticket, error) {
	if strings.TrimSpace(in.Subject) == "" {
		return Ticket{}, fmt.Errorf("subject is required")
	}
	if in.ReporterUserID == nil && (in.GuestEmail == nil || *in.GuestEmail == "") {
		return Ticket{}, fmt.Errorf("reporter user or guest email is required")
	}

	seq, err := s.store.NextSeq(ctx)
	if err != nil {
		return Ticket{}, fmt.Errorf("getting ticket sequence: %w", err)
	}

	now := time.Now()
	source := "web"
	if in.Source != "" {
		source = in.Source
	}

	t := Ticket{
		ID:             uuid.New(),
		TrackingNumber: GenerateTrackingNumber(now.Year(), seq),
		Subject:        strings.TrimSpace(in.Subject),
		Description:    in.Description,
		CategoryID:     in.CategoryID,
		TypeID:         in.TypeID,
		ItemID:         in.ItemID,
		Priority:       in.Priority,
		StatusID:       s.sys.newID,
		ReporterUserID: in.ReporterUserID,
		GuestEmail:     in.GuestEmail,
		GuestName:      in.GuestName,
		GuestPhone:     in.GuestPhone,
		TicketType:     in.TicketType,
		CreatedAt:      now,
		UpdatedAt:      now,
		Source:         source,
		WhatsappPhone:  in.WhatsappPhone,
		AIActive:       true,
	}

	// Auto-routing based on CTI scope: find groups responsible for this classification.
	if s.groupStore != nil {
		groups, err := s.groupStore.ListGroupsInScope(ctx, t.CategoryID, t.TypeID)
		if err == nil && len(groups) > 0 {
			t.AssigneeGroupID = &groups[0].ID
		}
	}

	if err := s.store.Create(ctx, t); err != nil {
		return Ticket{}, fmt.Errorf("creating ticket: %w", err)
	}

	s.recordStatusChange(ctx, t.ID, nil, s.sys.newID, Actor{UserID: in.ReporterUserID})
	s.writeAudit(ctx, in.ReporterUserID, "ticket", t.ID, "created", nil, ticketMap(t))

	if s.sla != nil {
		_ = s.sla.AttachPolicy(ctx, t) // SLA failure is non-fatal
	}

	createdPayload := map[string]any{
		"TrackingNumber": string(t.TrackingNumber),
		"Subject":        t.Subject,
		"Priority":       string(t.Priority),
	}
	if t.GuestEmail != nil {
		createdPayload["guest_email"] = *t.GuestEmail
	}
	if in.ReporterEmail != "" {
		createdPayload["reporter_email"] = in.ReporterEmail
	}
	_ = s.dispatcher.Dispatch(ctx, notification.Event{
		Type:       notification.EventTicketCreated,
		TicketID:   t.ID,
		ActorID:    in.ReporterUserID,
		Payload:    createdPayload,
		OccurredAt: now,
	})

	return t, nil
}

// UpdateStatus changes the ticket status after verifying the actor has
// permission to make that transition.
func (s *Service) UpdateStatus(ctx context.Context, ticketID, newStatusID uuid.UUID, actor Actor) (Ticket, error) {
	t, err := s.store.GetByID(ctx, ticketID)
	if err != nil {
		return Ticket{}, err
	}

	newStatus, err := s.getStatusByID(ctx, newStatusID)
	if err != nil {
		return Ticket{}, err
	}

	if err := CanTransitionStatus(newStatus, actor.Role); err != nil {
		return Ticket{}, fmt.Errorf("status transition not allowed: %w", err)
	}

	before := ticketMap(t)
	oldStatusID := t.StatusID
	t.StatusID = newStatusID
	t.UpdatedAt = time.Now()

	if err := s.store.Update(ctx, t); err != nil {
		return Ticket{}, fmt.Errorf("updating ticket status: %w", err)
	}

	s.recordStatusChange(ctx, t.ID, &oldStatusID, newStatusID, actor)
	s.writeAudit(ctx, actor.UserID, "ticket", t.ID, "status_changed", before, ticketMap(t))
	_ = s.dispatcher.Dispatch(ctx, notification.Event{
		Type:       notification.EventTicketStatusChanged,
		TicketID:   t.ID,
		ActorID:    actor.UserID,
		Payload:    map[string]any{"new_status_id": newStatusID},
		OccurredAt: time.Now(),
	})

	return t, nil
}

// Assign sets the assignee user and/or group on a ticket.
func (s *Service) Assign(ctx context.Context, ticketID uuid.UUID, assigneeUserID, assigneeGroupID *uuid.UUID, actor Actor) (Ticket, error) {
	t, err := s.store.GetByID(ctx, ticketID)
	if err != nil {
		return Ticket{}, err
	}
	before := ticketMap(t)
	t.AssigneeUserID = assigneeUserID
	t.AssigneeGroupID = assigneeGroupID
	t.UpdatedAt = time.Now()

	if err := s.store.Update(ctx, t); err != nil {
		return Ticket{}, fmt.Errorf("assigning ticket: %w", err)
	}

	s.writeAudit(ctx, actor.UserID, "ticket", t.ID, "assigned", before, ticketMap(t))
	_ = s.dispatcher.Dispatch(ctx, notification.Event{
		Type:       notification.EventTicketAssigned,
		TicketID:   t.ID,
		ActorID:    actor.UserID,
		OccurredAt: time.Now(),
	})

	return t, nil
}

// AddReply appends a reply to a ticket. If the actor is a user replying to a
// Resolved ticket within the reopen window, the ticket is automatically
// reopened to the configured target status.
//
// notifyCustomer controls whether a ticket-update email is sent to the
// reporter. It is forced false for internal notes. reporterEmail is the
// recipient address; callers are responsible for looking it up.
func (s *Service) AddReply(ctx context.Context, ticketID uuid.UUID, body string, internal bool, notifyCustomer bool, reporterEmail string, actor Actor, reopenWindowDays int, reopenTargetStatusID uuid.UUID, source string, externalMessageID *string, sendAgentName bool) (Reply, error) {
	t, err := s.store.GetByID(ctx, ticketID)
	if err != nil {
		return Reply{}, err
	}

	currentStatus, err := s.getStatusByID(ctx, t.StatusID)
	if err != nil {
		return Reply{}, err
	}

	u := user.User{Role: actor.Role}
	if err := CanUserUpdate(t, u, currentStatus, reopenWindowDays); err != nil {
		return Reply{}, fmt.Errorf("cannot reply to ticket: %w", err)
	}

	// Internal notes are never sent to customers.
	if internal {
		notifyCustomer = false
		reporterEmail = ""
	}

	replySource := "web"
	if source != "" {
		replySource = source
	}

	reply := Reply{
		ID:                uuid.New(),
		TicketID:          ticketID,
		AuthorID:          actor.UserID,
		Body:              body,
		Internal:          internal,
		NotifyCustomer:    notifyCustomer,
		CreatedAt:         time.Now(),
		Source:            replySource,
		ExternalMessageID: externalMessageID,
	}
	if err := s.store.CreateReply(ctx, reply); err != nil {
		return Reply{}, fmt.Errorf("creating reply: %w", err)
	}

	// Auto-ownership: if the ticket has no individual assignee and the reply is
	// from staff/admin, assign it to the responder automatically.
	if t.AssigneeUserID == nil && actor.Role != user.RoleUser && actor.UserID != nil {
		t.AssigneeUserID = actor.UserID
		t.UpdatedAt = time.Now()
		_ = s.store.Update(ctx, t)
	}

	// Auto-deactivate AI: if a reply is made by a human staff/admin, pause the AI support.
	// We check actor.UserID != nil to distinguish human agents from the system actor.
	if actor.Role != user.RoleUser && actor.UserID != nil && t.AIActive {
		t.AIActive = false
		t.UpdatedAt = time.Now()
		_ = s.store.Update(ctx, t)
	}

	// Auto-reopen: user reply to a Resolved ticket within the window.
	if actor.Role == user.RoleUser && currentStatus.Name == StatusNameResolved {
		oldStatusID := t.StatusID
		t.StatusID = reopenTargetStatusID
		t.ResolvedAt = nil
		t.UpdatedAt = time.Now()
		_ = s.store.Update(ctx, t)
		s.recordStatusChange(ctx, t.ID, &oldStatusID, reopenTargetStatusID, actor)
		_ = s.dispatcher.Dispatch(ctx, notification.Event{
			Type:       notification.EventTicketReopened,
			TicketID:   t.ID,
			ActorID:    actor.UserID,
			OccurredAt: time.Now(),
		})
	}

	// Record first staff response for SLA.
	if s.sla != nil && actor.Role != user.RoleUser {
		_ = s.sla.RecordFirstResponse(ctx, ticketID, reply.CreatedAt)
	}

	// Dispatch reply event. reporter_email is only populated when notifyCustomer
	// is true; the email dispatcher skips sending when the address is empty.
	_ = s.dispatcher.Dispatch(ctx, notification.Event{
		Type:     notification.EventTicketReplied,
		TicketID: t.ID,
		ActorID:  actor.UserID,
		Payload: map[string]any{
			"reporter_email": reporterEmail, // used by dispatcher to set To address
			"TrackingNumber": string(t.TrackingNumber),
			"Subject":        t.Subject,
			"ReplyBody":      body,
			"SendAgentName":   sendAgentName,
		},
		OccurredAt: time.Now(),
	})

	return reply, nil
}

// Resolve transitions a ticket to Resolved and records resolution notes.
func (s *Service) Resolve(ctx context.Context, ticketID uuid.UUID, notes string, actor Actor) (Ticket, error) {
	if err := CanTransitionStatus(s.sys.resolved, actor.Role); err != nil {
		return Ticket{}, fmt.Errorf("cannot resolve ticket: %w", err)
	}
	t, err := s.store.GetByID(ctx, ticketID)
	if err != nil {
		return Ticket{}, err
	}
	before := ticketMap(t)
	oldStatusID := t.StatusID
	now := time.Now()
	t.StatusID = s.sys.resolvedID
	t.ResolutionNotes = &notes
	t.ResolvedAt = &now
	t.UpdatedAt = now

	if err := s.store.Update(ctx, t); err != nil {
		return Ticket{}, fmt.Errorf("resolving ticket: %w", err)
	}

	s.recordStatusChange(ctx, t.ID, &oldStatusID, s.sys.resolvedID, actor)
	s.writeAudit(ctx, actor.UserID, "ticket", t.ID, "resolved", before, ticketMap(t))
	_ = s.dispatcher.Dispatch(ctx, notification.Event{
		Type:       notification.EventTicketResolved,
		TicketID:   t.ID,
		ActorID:    actor.UserID,
		OccurredAt: now,
	})

	return t, nil
}

// RateInput contains rating and rating comment.
type RateInput struct {
	Rating  int
	Comment *string
}

// Rate sets the rating and rating comment on a resolved or closed ticket.
func (s *Service) Rate(ctx context.Context, ticketID uuid.UUID, in RateInput, actor Actor) (Ticket, error) {
	t, err := s.store.GetByID(ctx, ticketID)
	if err != nil {
		return Ticket{}, err
	}

	// 1. Apenas o repórter do ticket (se cadastrado) pode avaliar.
	if t.ReporterUserID != nil {
		if actor.UserID == nil || *actor.UserID != *t.ReporterUserID {
			return Ticket{}, fmt.Errorf("only the ticket reporter can rate this ticket")
		}
	} else {
		// Para tickets de guest, somente o próprio guest pode ratear. O handler se encarrega de validar se
		// a requisição é legítima por token ou email de guest. Aqui apenas garantimos que o actor não seja
		// um usuário cadastrado diferente.
		if actor.UserID != nil {
			return Ticket{}, fmt.Errorf("only the guest reporter can rate this guest ticket")
		}
	}

	// 2. O ticket deve estar resolvido ou fechado.
	status, err := s.getStatusByID(ctx, t.StatusID)
	if err != nil {
		return Ticket{}, err
	}
	if status.Name != StatusNameResolved && status.Name != StatusNameClosed {
		return Ticket{}, fmt.Errorf("ticket must be resolved or closed to be rated")
	}

	// 3. O ticket não pode ter sido avaliado ainda.
	if t.Rating != nil {
		return Ticket{}, fmt.Errorf("ticket has already been rated")
	}

	if in.Rating < 0 || in.Rating > 5 {
		return Ticket{}, fmt.Errorf("rating must be between 0 and 5")
	}

	before := ticketMap(t)
	now := time.Now()

	if err := s.store.UpdateRating(ctx, ticketID, in.Rating, in.Comment, now); err != nil {
		return Ticket{}, fmt.Errorf("saving rating: %w", err)
	}

	t.Rating = &in.Rating
	t.RatingComment = in.Comment
	t.RatedAt = &now
	t.UpdatedAt = now

	s.writeAudit(ctx, actor.UserID, "ticket", t.ID, "rated", before, ticketMap(t))

	return t, nil
}

// Close transitions a ticket to Closed. Used by the auto-close scheduler and
// admin overrides. It does NOT call CanTransitionStatus — the caller decides
// whether this is authorised.
func (s *Service) Close(ctx context.Context, ticketID uuid.UUID) error {
	t, err := s.store.GetByID(ctx, ticketID)
	if err != nil {
		return err
	}
	oldStatusID := t.StatusID
	now := time.Now()
	t.StatusID = s.sys.closedID
	t.ClosedAt = &now
	t.UpdatedAt = now

	if err := s.store.Update(ctx, t); err != nil {
		return fmt.Errorf("closing ticket: %w", err)
	}

	s.recordStatusChange(ctx, t.ID, &oldStatusID, s.sys.closedID, SystemActor)
	_ = s.dispatcher.Dispatch(ctx, notification.Event{
		Type:       notification.EventTicketClosed,
		TicketID:   t.ID,
		OccurredAt: now,
	})
	return nil
}

// Reopen transitions a Closed ticket back to the target status. Staff/Admin only.
func (s *Service) Reopen(ctx context.Context, ticketID uuid.UUID, targetStatusID uuid.UUID, actor Actor) (Ticket, error) {
	if actor.Role == user.RoleUser {
		return Ticket{}, ErrForbidden
	}
	t, err := s.store.GetByID(ctx, ticketID)
	if err != nil {
		return Ticket{}, err
	}
	if t.StatusID != s.sys.closedID && t.StatusID != s.sys.resolvedID {
		return Ticket{}, fmt.Errorf("ticket must be resolved or closed to be reopened")
	}
	before := ticketMap(t)
	oldStatusID := t.StatusID
	t.StatusID = targetStatusID
	t.ClosedAt = nil
	t.ResolvedAt = nil
	t.UpdatedAt = time.Now()

	if err := s.store.Update(ctx, t); err != nil {
		return Ticket{}, fmt.Errorf("reopening ticket: %w", err)
	}

	s.recordStatusChange(ctx, t.ID, &oldStatusID, targetStatusID, actor)
	s.writeAudit(ctx, actor.UserID, "ticket", t.ID, "reopened", before, ticketMap(t))
	_ = s.dispatcher.Dispatch(ctx, notification.Event{
		Type:       notification.EventTicketReopened,
		TicketID:   t.ID,
		ActorID:    actor.UserID,
		OccurredAt: time.Now(),
	})
	return t, nil
}

// recordStatusChange writes a status history entry. Non-fatal: errors are silently dropped
// so that a history-write failure never blocks the main operation.
func (s *Service) recordStatusChange(ctx context.Context, ticketID uuid.UUID, fromStatusID *uuid.UUID, toStatusID uuid.UUID, actor Actor) {
	_ = s.store.CreateStatusHistoryEntry(ctx, StatusHistoryEntry{
		ID:              uuid.New(),
		TicketID:        ticketID,
		FromStatusID:    fromStatusID,
		ToStatusID:      toStatusID,
		ChangedByUserID: actor.UserID,
		CreatedAt:       time.Now(),
	})
}

// ListStatusHistory returns the status transition history for a ticket.
func (s *Service) ListStatusHistory(ctx context.Context, ticketID uuid.UUID) ([]StatusHistoryEntry, error) {
	return s.store.ListStatusHistory(ctx, ticketID)
}

// AddLink creates a directed link between two tickets.
func (s *Service) AddLink(ctx context.Context, sourceID, targetID uuid.UUID, lt LinkType, actor Actor) error {
	if sourceID == targetID {
		return fmt.Errorf("cannot link a ticket to itself")
	}
	link := TicketLink{SourceTicketID: sourceID, TargetTicketID: targetID, LinkType: lt}
	if err := s.store.CreateLink(ctx, link); err != nil {
		return fmt.Errorf("creating link: %w", err)
	}
	_ = s.dispatcher.Dispatch(ctx, notification.Event{
		Type:       notification.EventTicketLinked,
		TicketID:   sourceID,
		ActorID:    actor.UserID,
		Payload:    map[string]any{"target_id": targetID, "link_type": lt},
		OccurredAt: time.Now(),
	})
	return nil
}

// RemoveLink deletes a directed link between two tickets.
func (s *Service) RemoveLink(ctx context.Context, sourceID, targetID uuid.UUID, lt LinkType) error {
	return s.store.DeleteLink(ctx, sourceID, targetID, lt)
}

// GetByID returns the ticket with the given ID.
func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (Ticket, error) {
	return s.store.GetByID(ctx, id)
}

// UpdateCTI changes the category/type/item classification of a ticket.
// Only staff and admin may call this; enforcement is at the handler layer.
func (s *Service) UpdateCTI(ctx context.Context, id, categoryID uuid.UUID, typeID, itemID *uuid.UUID) (Ticket, error) {
	if err := s.store.UpdateCTI(ctx, id, categoryID, typeID, itemID); err != nil {
		return Ticket{}, fmt.Errorf("updating ticket CTI: %w", err)
	}
	return s.store.GetByID(ctx, id)
}

// SetTicketType sets or clears the ITSM ticket type on a ticket.
// Only staff and admin may call this; enforcement is at the handler layer.
func (s *Service) SetTicketType(ctx context.Context, id uuid.UUID, tt *TicketType, actor Actor) (Ticket, error) {
	t, err := s.store.GetByID(ctx, id)
	if err != nil {
		return Ticket{}, err
	}
	before := ticketMap(t)
	t.TicketType = tt
	t.UpdatedAt = time.Now()
	if err := s.store.Update(ctx, t); err != nil {
		return Ticket{}, fmt.Errorf("setting ticket type: %w", err)
	}
	s.writeAudit(ctx, actor.UserID, "ticket", t.ID, "ticket_type_set", before, ticketMap(t))
	return t, nil
}

// GetByTrackingNumber returns the ticket with the given tracking number.
func (s *Service) GetByTrackingNumber(ctx context.Context, tn TrackingNumber) (Ticket, error) {
	return s.store.GetByTrackingNumber(ctx, tn)
}

// ListReplies returns all replies for a ticket.
func (s *Service) ListReplies(ctx context.Context, ticketID uuid.UUID) ([]Reply, error) {
	return s.store.ListReplies(ctx, ticketID)
}

// ListLinks returns all links for a ticket.
func (s *Service) ListLinks(ctx context.Context, ticketID uuid.UUID) ([]TicketLink, error) {
	return s.store.ListLinks(ctx, ticketID)
}

// ListByReporter returns tickets submitted by the given user.
func (s *Service) ListByReporter(ctx context.Context, userID uuid.UUID, limit, offset int) ([]Ticket, error) {
	return s.store.ListByReporter(ctx, userID, limit, offset)
}

// ListByAssigneeUser returns tickets assigned to the given user.
func (s *Service) ListByAssigneeUser(ctx context.Context, userID uuid.UUID, limit, offset int) ([]Ticket, error) {
	return s.store.ListByAssigneeUser(ctx, userID, limit, offset)
}

// ListByAssigneeGroup returns tickets assigned to the given group.
func (s *Service) ListByAssigneeGroup(ctx context.Context, groupID uuid.UUID, limit, offset int) ([]Ticket, error) {
	return s.store.ListByAssigneeGroup(ctx, groupID, limit, offset)
}

// SearchByReporter filters the reporter's tickets by tracking number, subject, or description.
func (s *Service) SearchByReporter(ctx context.Context, userID uuid.UUID, q string, limit, offset int) ([]Ticket, error) {
	return s.store.SearchByReporter(ctx, userID, q, limit, offset)
}

// SearchByAssigneeUser filters tickets assigned to the user by tracking number, subject, or description.
func (s *Service) SearchByAssigneeUser(ctx context.Context, userID uuid.UUID, q string, limit, offset int) ([]Ticket, error) {
	return s.store.SearchByAssigneeUser(ctx, userID, q, limit, offset)
}

// SearchByAssigneeGroup filters tickets assigned to the group by tracking number, subject, or description.
func (s *Service) SearchByAssigneeGroup(ctx context.Context, groupID uuid.UUID, q string, limit, offset int) ([]Ticket, error) {
	return s.store.SearchByAssigneeGroup(ctx, groupID, q, limit, offset)
}

// ListAll returns every ticket, newest first. Intended for admin-scope views.
func (s *Service) ListAll(ctx context.Context, limit, offset int) ([]Ticket, error) {
	return s.store.ListAll(ctx, limit, offset)
}

// SearchAll filters every ticket by tracking number, subject, or description.
func (s *Service) SearchAll(ctx context.Context, q string, limit, offset int) ([]Ticket, error) {
	return s.store.SearchAll(ctx, q, limit, offset)
}

// ListUnassigned returns tickets with neither an assignee user nor an assignee group.
func (s *Service) ListUnassigned(ctx context.Context, limit, offset int) ([]Ticket, error) {
	return s.store.ListUnassigned(ctx, limit, offset)
}

// SearchUnassigned filters unassigned tickets by tracking number, subject, or description.
func (s *Service) SearchUnassigned(ctx context.Context, q string, limit, offset int) ([]Ticket, error) {
	return s.store.SearchUnassigned(ctx, q, limit, offset)
}

// ListResolvedBefore is used by the auto-close scheduler.
func (s *Service) ListResolvedBefore(ctx context.Context, before time.Time, limit int) ([]Ticket, error) {
	return s.store.ListResolvedBefore(ctx, before, limit)
}

// ListStatuses returns all configured statuses.
func (s *Service) ListStatuses(ctx context.Context) ([]Status, error) {
	return s.statuses.ListStatuses(ctx)
}

// AddStatus creates a new custom status entry.
func (s *Service) AddStatus(ctx context.Context, st Status) error {
	st.Active = true
	return s.statuses.CreateStatus(ctx, st)
}

// SaveStatus persists changes to an existing status record.
func (s *Service) SaveStatus(ctx context.Context, st Status) error {
	return s.statuses.UpdateStatus(ctx, st)
}

// CountByStatus returns the number of tickets currently in the given status.
func (s *Service) CountByStatus(ctx context.Context, id uuid.UUID) (int64, error) {
	return s.statuses.CountByStatus(ctx, id)
}

// CountByStatusForReporter counts tickets in the given status reported by a user.
func (s *Service) CountByStatusForReporter(ctx context.Context, statusID, userID uuid.UUID) (int64, error) {
	return s.statuses.CountByStatusForReporter(ctx, statusID, userID)
}

// CountByStatusForAssignee counts tickets in the given status assigned to a user
// or to any of the supplied groups.
func (s *Service) CountByStatusForAssignee(ctx context.Context, statusID, userID uuid.UUID, groupIDs []uuid.UUID) (int64, error) {
	return s.statuses.CountByStatusForAssignee(ctx, statusID, userID, groupIDs)
}

// RemoveStatus hard-deletes a custom status. Blocked if the status is a
// system status or if any tickets currently have this status.
func (s *Service) RemoveStatus(ctx context.Context, id uuid.UUID) error {
	st, err := s.getStatusByID(ctx, id)
	if err != nil {
		return err
	}
	if st.Kind != StatusKindCustom {
		return fmt.Errorf("cannot delete system status %q", st.Name)
	}
	count, err := s.statuses.CountByStatus(ctx, id)
	if err != nil {
		return fmt.Errorf("counting tickets for status: %w", err)
	}
	if count > 0 {
		return fmt.Errorf("status %q has %d ticket(s); deactivate it instead of deleting", st.Name, count)
	}
	return s.statuses.DeleteStatus(ctx, id)
}

// getStatusByID fetches a status; returns a descriptive error on miss.
func (s *Service) getStatusByID(ctx context.Context, id uuid.UUID) (Status, error) {
	statuses, err := s.statuses.ListStatuses(ctx)
	if err != nil {
		return Status{}, fmt.Errorf("listing statuses: %w", err)
	}
	for _, st := range statuses {
		if st.ID == id {
			return st, nil
		}
	}
	return Status{}, fmt.Errorf("status %s not found", id)
}

// writeAudit logs an audit entry, swallowing errors (audit failure is non-fatal).
func (s *Service) writeAudit(ctx context.Context, actorID *uuid.UUID, entityType string, entityID uuid.UUID, action string, before, after map[string]any) {
	_ = s.auditStore.Create(ctx, audit.Entry{
		ID:         uuid.New(),
		ActorID:    actorID,
		EntityType: entityType,
		EntityID:   entityID,
		Action:     action,
		Before:     before,
		After:      after,
		CreatedAt:  time.Now(),
	})
}

// ticketMap produces a shallow map representation of a ticket for audit logs.
func ticketMap(t Ticket) map[string]any {
	m := map[string]any{
		"id":        t.ID,
		"status_id": t.StatusID,
		"priority":  t.Priority,
		"subject":   t.Subject,
	}
	if t.Rating != nil {
		m["rating"] = *t.Rating
	}
	return m
}

// ErrNotFound is returned when a requested resource does not exist.
var ErrNotFound = errors.New("not found")

// ── Attachments ───────────────────────────────────────────────────────────────

// CreateAttachment records attachment metadata after the file has been written to disk.
func (s *Service) CreateAttachment(ctx context.Context, a Attachment) error {
	return s.store.CreateAttachment(ctx, a)
}

// GetAttachment returns a single attachment by ID.
func (s *Service) GetAttachment(ctx context.Context, id uuid.UUID) (Attachment, error) {
	return s.store.GetAttachmentByID(ctx, id)
}

// ListAttachments returns all attachments for a ticket.
func (s *Service) ListAttachments(ctx context.Context, ticketID uuid.UUID) ([]Attachment, error) {
	return s.store.ListAttachments(ctx, ticketID)
}

// DeleteAttachment removes attachment metadata from the DB. Callers are
// responsible for deleting the file on disk.
func (s *Service) DeleteAttachment(ctx context.Context, id uuid.UUID) error {
	return s.store.DeleteAttachment(ctx, id)
}

// GetReplyByExternalID fetches a reply by its external ID.
func (s *Service) GetReplyByExternalID(ctx context.Context, extID string) (Reply, error) {
	return s.store.GetReplyByExternalID(ctx, extID)
}

// GetActiveTicketByWhatsApp fetches an active ticket for a WhatsApp phone number.
func (s *Service) GetActiveTicketByWhatsApp(ctx context.Context, phone string) (Ticket, error) {
	return s.store.GetActiveTicketByWhatsApp(ctx, phone)
}

// GetUnratedTicketByWhatsApp fetches a resolved/closed unrated ticket for a WhatsApp phone number.
func (s *Service) GetUnratedTicketByWhatsApp(ctx context.Context, phone string) (Ticket, error) {
	return s.store.GetUnratedTicketByWhatsApp(ctx, phone)
}

// GetLatestTicketByWhatsApp fetches the most recent ticket for a WhatsApp phone number, regardless of status.
func (s *Service) GetLatestTicketByWhatsApp(ctx context.Context, phone string) (Ticket, error) {
	return s.store.GetLatestTicketByWhatsApp(ctx, phone)
}

// CreateWhatsAppSession registers a new temporary triage session.
func (s *Service) CreateWhatsAppSession(ctx context.Context, phone string, initialMessage string, mediaURL string, mimeType string) error {
	return s.store.CreateWhatsAppSession(ctx, phone, initialMessage, mediaURL, mimeType)
}

// GetWhatsAppSession retrieves a temporary session.
func (s *Service) GetWhatsAppSession(ctx context.Context, phone string) (WhatsAppSession, error) {
	return s.store.GetWhatsAppSession(ctx, phone)
}

// DeleteWhatsAppSession removes a temporary triage session.
func (s *Service) DeleteWhatsAppSession(ctx context.Context, phone string) error {
	return s.store.DeleteWhatsAppSession(ctx, phone)
}

// UpdateAIState updates the AI active and transferred flags for a ticket.
func (s *Service) UpdateAIState(ctx context.Context, ticketID uuid.UUID, aiActive, aiTransferred bool) error {
	return s.store.UpdateAIState(ctx, ticketID, aiActive, aiTransferred)
}
