package sla

import (
	"time"

	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/ticket"
)

// Policy defines the response and resolution time targets for a given
// priority level, optionally narrowed to a specific category.
type Policy struct {
	ID                  uuid.UUID       `json:"id"`
	Name                string          `json:"name"`
	Priority            ticket.Priority `json:"priority"`
	CategoryID          *uuid.UUID      `json:"category_id,omitempty"`
	ResponseTargetMin   int             `json:"response_target_min"`
	ResolutionTargetMin int             `json:"resolution_target_min"`
}

// Record tracks SLA state for a single ticket.
type Record struct {
	TicketID             uuid.UUID
	PolicyID             uuid.UUID
	FirstResponseAt      *time.Time
	ResolvedAt           *time.Time
	ResponseBreachedAt   *time.Time
	ResolutionBreachedAt *time.Time
}

// SLASummary holds the calculated SLA status and deadlines for a ticket.
type SLASummary struct {
	Status               string     `json:"status"` // "green", "amber", "red"
	ResponseDeadline     *time.Time `json:"response_deadline,omitempty"`
	ResolutionDeadline   *time.Time `json:"resolution_deadline,omitempty"`
	ResponseBreachedAt   *time.Time `json:"response_breached_at,omitempty"`
	ResolutionBreachedAt *time.Time `json:"resolution_breached_at,omitempty"`
	FirstResponseAt      *time.Time `json:"first_response_at,omitempty"`
	ResolvedAt           *time.Time `json:"resolved_at,omitempty"`
}

// IsResponseBreached returns true when the response target has elapsed and no
// first response has been recorded.
func IsResponseBreached(r Record, p Policy, ticketCreatedAt, now time.Time) bool {
	if r.FirstResponseAt != nil {
		return false // already responded
	}
	deadline := ticketCreatedAt.Add(time.Duration(p.ResponseTargetMin) * time.Minute)
	return now.After(deadline)
}

// IsResolutionBreached returns true when the resolution target has elapsed and
// the ticket has not been resolved.
func IsResolutionBreached(r Record, p Policy, ticketCreatedAt, now time.Time) bool {
	if r.ResolvedAt != nil {
		return false // already resolved
	}
	deadline := ticketCreatedAt.Add(time.Duration(p.ResolutionTargetMin) * time.Minute)
	return now.After(deadline)
}
