package sla

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/ticket"
)

// Service evaluates SLA policies against tickets.
type Service struct {
	store     Store
	isEnabled func(context.Context) bool
}

// NewService returns a Service backed by the given Store.
func NewService(store Store) *Service { return &Service{store: store} }

// WithEnabledFunc configures the service with a dynamic check for whether SLA is enabled.
func (s *Service) WithEnabledFunc(fn func(context.Context) bool) *Service {
	s.isEnabled = fn
	return s
}

// AttachPolicy finds the best matching SLA policy for a ticket and creates an
// SLA record for it. Called when a new ticket is created.
func (s *Service) AttachPolicy(ctx context.Context, t ticket.Ticket) error {
	if s.isEnabled != nil && !s.isEnabled(ctx) {
		return nil
	}
	policy, err := s.store.FindPolicy(ctx, t.Priority, t.CategoryID)
	if err != nil {
		return fmt.Errorf("finding SLA policy: %w", err)
	}
	if policy == nil {
		return nil // no policy configured for this priority/category
	}
	return s.store.CreateRecord(ctx, Record{
		TicketID: t.ID,
		PolicyID: policy.ID,
	})
}

// RecordFirstResponse marks the time of the first staff reply on a ticket.
// It is a no-op when already recorded.
func (s *Service) RecordFirstResponse(ctx context.Context, ticketID uuid.UUID, at time.Time) error {
	if s.isEnabled != nil && !s.isEnabled(ctx) {
		return nil
	}
	record, err := s.store.GetRecord(ctx, ticketID)
	if err != nil {
		return nil // no SLA record for this ticket
	}
	if record.FirstResponseAt != nil {
		return nil // already recorded
	}
	record.FirstResponseAt = &at
	return s.store.UpdateRecord(ctx, record)
}

// EvaluateBreaches checks whether a ticket has breached its SLA targets and
// stamps the breach timestamps if so. Called on a schedule.
func (s *Service) EvaluateBreaches(ctx context.Context, t ticket.Ticket, now time.Time) error {
	if s.isEnabled != nil && !s.isEnabled(ctx) {
		return nil
	}
	record, err := s.store.GetRecord(ctx, t.ID)
	if err != nil {
		return nil // no SLA record
	}
	policy, err := s.store.GetPolicy(ctx, record.PolicyID)
	if err != nil {
		return fmt.Errorf("getting SLA policy: %w", err)
	}

	changed := false
	if record.ResponseBreachedAt == nil && IsResponseBreached(record, policy, t.CreatedAt, now) {
		record.ResponseBreachedAt = &now
		changed = true
	}
	if record.ResolutionBreachedAt == nil && IsResolutionBreached(record, policy, t.CreatedAt, now) {
		record.ResolutionBreachedAt = &now
		changed = true
	}
	if changed {
		return s.store.UpdateRecord(ctx, record)
	}
	return nil
}

// GetSLASummary calculates the current SLA status, response/resolution deadlines,
// and breach status for a ticket, taking into account any time spent in the "Pending" status.
func (s *Service) GetSLASummary(ctx context.Context, t ticket.Ticket, now time.Time, history []ticket.StatusHistoryEntry, pendingStatusID uuid.UUID) (*SLASummary, error) {
	if s.isEnabled != nil && !s.isEnabled(ctx) {
		return nil, nil
	}

	record, err := s.store.GetRecord(ctx, t.ID)
	if err != nil {
		return nil, nil // No SLA record exists for this ticket
	}

	policy, err := s.store.GetPolicy(ctx, record.PolicyID)
	if err != nil {
		return nil, fmt.Errorf("getting SLA policy: %w", err)
	}

	// Calculate total duration spent in "Pending" status.
	// We iterate through the status history in chronological order.
	var pendingDuration time.Duration
	currentStatusID := t.StatusID // Start with current status fallback if no history
	currentStartTime := t.CreatedAt

	if len(history) > 0 {
		currentStartTime = t.CreatedAt
		currentStatusID = history[0].ToStatusID
	}

	for _, entry := range history {
		if entry.CreatedAt.After(currentStartTime) {
			if currentStatusID == pendingStatusID {
				pendingDuration += entry.CreatedAt.Sub(currentStartTime)
			}
			currentStatusID = entry.ToStatusID
			currentStartTime = entry.CreatedAt
		}
	}

	// Add the time spent in the current status up to 'now' (or resolution/closure if the ticket is completed)
	endTime := now
	if t.ResolvedAt != nil {
		endTime = *t.ResolvedAt
	} else if t.ClosedAt != nil {
		endTime = *t.ClosedAt
	}

	if endTime.After(currentStartTime) && currentStatusID == pendingStatusID {
		pendingDuration += endTime.Sub(currentStartTime)
	}

	// Adjust deadlines based on the pending duration
	responseDeadline := t.CreatedAt.Add(time.Duration(policy.ResponseTargetMin)*time.Minute + pendingDuration)
	resolutionDeadline := t.CreatedAt.Add(time.Duration(policy.ResolutionTargetMin)*time.Minute + pendingDuration)

	// Determine response status
	var responseStatus string
	if record.FirstResponseAt != nil {
		if record.FirstResponseAt.After(responseDeadline) {
			responseStatus = "red"
		} else {
			responseStatus = "green"
		}
	} else {
		if now.After(responseDeadline) {
			responseStatus = "red"
		} else {
			// Amber if remaining time is <= 20% of target
			targetDuration := time.Duration(policy.ResponseTargetMin) * time.Minute
			amberStart := responseDeadline.Add(-targetDuration / 5) // 20% of target
			if now.After(amberStart) || now.Equal(amberStart) {
				responseStatus = "amber"
			} else {
				responseStatus = "green"
			}
		}
	}

	// Determine resolution status
	var resolutionStatus string
	resolvedAt := record.ResolvedAt
	if resolvedAt == nil && t.ResolvedAt != nil {
		resolvedAt = t.ResolvedAt
	}

	if resolvedAt != nil {
		if resolvedAt.After(resolutionDeadline) {
			resolutionStatus = "red"
		} else {
			resolutionStatus = "green"
		}
	} else {
		if now.After(resolutionDeadline) {
			resolutionStatus = "red"
		} else {
			// Amber if remaining time is <= 20% of target
			targetDuration := time.Duration(policy.ResolutionTargetMin) * time.Minute
			amberStart := resolutionDeadline.Add(-targetDuration / 5) // 20% of target
			if now.After(amberStart) || now.Equal(amberStart) {
				resolutionStatus = "amber"
			} else {
				resolutionStatus = "green"
			}
		}
	}

	// Overall status is the worst of response and resolution status
	overallStatus := "green"
	if responseStatus == "red" || resolutionStatus == "red" {
		overallStatus = "red"
	} else if responseStatus == "amber" || resolutionStatus == "amber" {
		overallStatus = "amber"
	}

	// Sync breach fields in memory/db if they have breached
	dbRecordChanged := false
	if record.ResponseBreachedAt == nil && responseStatus == "red" {
		record.ResponseBreachedAt = &responseDeadline
		dbRecordChanged = true
	}
	if record.ResolutionBreachedAt == nil && resolutionStatus == "red" {
		record.ResolutionBreachedAt = &resolutionDeadline
		dbRecordChanged = true
	}
	if dbRecordChanged {
		_ = s.store.UpdateRecord(ctx, record)
	}

	return &SLASummary{
		Status:               overallStatus,
		ResponseDeadline:     &responseDeadline,
		ResolutionDeadline:   &resolutionDeadline,
		ResponseBreachedAt:   record.ResponseBreachedAt,
		ResolutionBreachedAt: record.ResolutionBreachedAt,
		FirstResponseAt:      record.FirstResponseAt,
		ResolvedAt:           resolvedAt,
	}, nil
}

// ── Policy CRUD ───────────────────────────────────────────────────────────────

func (s *Service) CreatePolicy(ctx context.Context, p Policy) (Policy, error) {
	if p.Name == "" {
		return Policy{}, fmt.Errorf("policy name is required")
	}
	if p.ResponseTargetMin <= 0 {
		return Policy{}, fmt.Errorf("response target must be greater than zero")
	}
	if p.ResolutionTargetMin <= 0 {
		return Policy{}, fmt.Errorf("resolution target must be greater than zero")
	}
	p.ID = uuid.New()
	if err := s.store.CreatePolicy(ctx, p); err != nil {
		return Policy{}, fmt.Errorf("creating SLA policy: %w", err)
	}
	return p, nil
}

func (s *Service) GetPolicy(ctx context.Context, id uuid.UUID) (Policy, error) {
	return s.store.GetPolicy(ctx, id)
}

func (s *Service) UpdatePolicy(ctx context.Context, p Policy) error {
	if p.Name == "" {
		return fmt.Errorf("policy name is required")
	}
	if p.ResponseTargetMin <= 0 {
		return fmt.Errorf("response target must be greater than zero")
	}
	if p.ResolutionTargetMin <= 0 {
		return fmt.Errorf("resolution target must be greater than zero")
	}
	return s.store.UpdatePolicy(ctx, p)
}

func (s *Service) DeletePolicy(ctx context.Context, id uuid.UUID) error {
	return s.store.DeletePolicy(ctx, id)
}

func (s *Service) ListPolicies(ctx context.Context) ([]Policy, error) {
	return s.store.ListPolicies(ctx)
}
