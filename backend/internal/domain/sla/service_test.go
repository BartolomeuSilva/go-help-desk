package sla_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/sla"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/ticket"
	"github.com/stretchr/testify/require"
)

// fakeSLAStore is an in-memory implementation of sla.Store.
type fakeSLAStore struct {
	policies map[uuid.UUID]sla.Policy
	records  map[uuid.UUID]sla.Record
	// findPolicy returns a policy if one is set for (priority, categoryID).
	findResult *sla.Policy
}

func newFakeSLAStore() *fakeSLAStore {
	return &fakeSLAStore{
		policies: make(map[uuid.UUID]sla.Policy),
		records:  make(map[uuid.UUID]sla.Record),
	}
}

func (f *fakeSLAStore) CreatePolicy(_ context.Context, p sla.Policy) error {
	f.policies[p.ID] = p
	return nil
}
func (f *fakeSLAStore) GetPolicy(_ context.Context, id uuid.UUID) (sla.Policy, error) {
	p, ok := f.policies[id]
	if !ok {
		return sla.Policy{}, errors.New("policy not found")
	}
	return p, nil
}
func (f *fakeSLAStore) UpdatePolicy(_ context.Context, p sla.Policy) error {
	f.policies[p.ID] = p
	return nil
}
func (f *fakeSLAStore) DeletePolicy(_ context.Context, id uuid.UUID) error {
	delete(f.policies, id)
	return nil
}
func (f *fakeSLAStore) ListPolicies(_ context.Context) ([]sla.Policy, error) {
	out := make([]sla.Policy, 0, len(f.policies))
	for _, p := range f.policies {
		out = append(out, p)
	}
	return out, nil
}
func (f *fakeSLAStore) FindPolicy(_ context.Context, _ ticket.Priority, _ uuid.UUID) (*sla.Policy, error) {
	return f.findResult, nil
}
func (f *fakeSLAStore) CreateRecord(_ context.Context, r sla.Record) error {
	f.records[r.TicketID] = r
	return nil
}
func (f *fakeSLAStore) GetRecord(_ context.Context, ticketID uuid.UUID) (sla.Record, error) {
	r, ok := f.records[ticketID]
	if !ok {
		return sla.Record{}, errors.New("record not found")
	}
	return r, nil
}
func (f *fakeSLAStore) UpdateRecord(_ context.Context, r sla.Record) error {
	f.records[r.TicketID] = r
	return nil
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestSLAService_AttachPolicy_NoPolicy(t *testing.T) {
	store := newFakeSLAStore()
	store.findResult = nil // no matching policy

	svc := sla.NewService(store)
	tk := ticket.Ticket{
		ID:         uuid.New(),
		CategoryID: uuid.New(),
		Priority:   ticket.PriorityMedium,
	}

	require.NoError(t, svc.AttachPolicy(context.Background(), tk))
	require.Empty(t, store.records, "no record should be created when no policy matches")
}

func TestSLAService_AttachPolicy_WithPolicy(t *testing.T) {
	store := newFakeSLAStore()
	policy := sla.Policy{
		ID:                  uuid.New(),
		Name:                "Standard",
		Priority:            ticket.PriorityMedium,
		ResponseTargetMin:   60,
		ResolutionTargetMin: 480,
	}
	store.policies[policy.ID] = policy
	store.findResult = &policy

	svc := sla.NewService(store)
	tk := ticket.Ticket{
		ID:         uuid.New(),
		CategoryID: uuid.New(),
		Priority:   ticket.PriorityMedium,
	}

	require.NoError(t, svc.AttachPolicy(context.Background(), tk))
	rec, ok := store.records[tk.ID]
	require.True(t, ok, "record should be created")
	require.Equal(t, policy.ID, rec.PolicyID)
}

func TestSLAService_RecordFirstResponse_Idempotent(t *testing.T) {
	store := newFakeSLAStore()
	policyID := uuid.New()
	ticketID := uuid.New()
	firstTime := time.Now().Add(-10 * time.Minute)

	// Pre-seed a record with a first response already recorded.
	store.records[ticketID] = sla.Record{
		TicketID:        ticketID,
		PolicyID:        policyID,
		FirstResponseAt: &firstTime,
	}

	svc := sla.NewService(store)
	later := time.Now()
	require.NoError(t, svc.RecordFirstResponse(context.Background(), ticketID, later))

	// The stored timestamp must not have changed.
	rec := store.records[ticketID]
	require.Equal(t, firstTime.Unix(), rec.FirstResponseAt.Unix(), "timestamp must not be overwritten")
}

func TestSLAService_EvaluateBreaches(t *testing.T) {
	store := newFakeSLAStore()
	policyID := uuid.New()
	ticketID := uuid.New()

	policy := sla.Policy{
		ID:                  policyID,
		ResponseTargetMin:   30,
		ResolutionTargetMin: 120,
	}
	store.policies[policyID] = policy
	store.records[ticketID] = sla.Record{
		TicketID: ticketID,
		PolicyID: policyID,
	}

	createdAt := time.Now().Add(-3 * time.Hour) // ticket created 3h ago
	now := time.Now()

	tk := ticket.Ticket{
		ID:        ticketID,
		CreatedAt: createdAt,
	}

	svc := sla.NewService(store)
	require.NoError(t, svc.EvaluateBreaches(context.Background(), tk, now))

	rec := store.records[ticketID]
	require.NotNil(t, rec.ResponseBreachedAt, "response should be breached")
	require.NotNil(t, rec.ResolutionBreachedAt, "resolution should be breached")
}

func TestSLAService_GetSLASummary(t *testing.T) {
	store := newFakeSLAStore()
	policyID := uuid.New()
	ticketID := uuid.New()
	pendingStatusID := uuid.New()
	otherStatusID := uuid.New()

	policy := sla.Policy{
		ID:                  policyID,
		ResponseTargetMin:   60,  // 1 hour
		ResolutionTargetMin: 240, // 4 hours
	}
	store.policies[policyID] = policy
	store.records[ticketID] = sla.Record{
		TicketID: ticketID,
		PolicyID: policyID,
	}

	createdAt := time.Now().Add(-2 * time.Hour) // created 2h ago
	tk := ticket.Ticket{
		ID:        ticketID,
		CreatedAt: createdAt,
		StatusID:  otherStatusID,
	}

	svc := sla.NewService(store)

	t.Run("without pending duration - breached (red)", func(t *testing.T) {
		// Response target is 1 hour, ticket is 2 hours old -> breached
		summary, err := svc.GetSLASummary(context.Background(), tk, time.Now(), nil, pendingStatusID)
		require.NoError(t, err)
		require.NotNil(t, summary)
		require.Equal(t, "red", summary.Status)
		require.Equal(t, createdAt.Add(60*time.Minute).Unix(), summary.ResponseDeadline.Unix())
	})

	t.Run("with pending duration - extending deadline to green", func(t *testing.T) {
		// Ticket was in Pending for 1.5 hours:
		// Created (t=0): entered otherStatusID
		// t=15m: moved to Pending
		// t=1h45m (1.5h later): moved to otherStatusID
		history := []ticket.StatusHistoryEntry{
			{
				ID:           uuid.New(),
				TicketID:     ticketID,
				ToStatusID:   otherStatusID,
				CreatedAt:    createdAt,
			},
			{
				ID:           uuid.New(),
				TicketID:     ticketID,
				ToStatusID:   pendingStatusID,
				CreatedAt:    createdAt.Add(15 * time.Minute),
			},
			{
				ID:           uuid.New(),
				TicketID:     ticketID,
				ToStatusID:   otherStatusID,
				CreatedAt:    createdAt.Add(105 * time.Minute), // 1h45m
			},
		}

		// Adjusted response deadline = createdAt + 60m + 90m (pending) = createdAt + 150m (2.5h)
		// Current time is 2h after creation, so we are at 120m -> within green zone (120m / 150m = 80%, remaining 30m is 50% of original 60m target)
		summary, err := svc.GetSLASummary(context.Background(), tk, createdAt.Add(120*time.Minute), history, pendingStatusID)
		require.NoError(t, err)
		require.NotNil(t, summary)
		require.Equal(t, "green", summary.Status)
		require.Equal(t, createdAt.Add(150*time.Minute).Unix(), summary.ResponseDeadline.Unix())
	})

	t.Run("with pending duration - amber status", func(t *testing.T) {
		// Target = 60m. Amber threshold (20% remaining) = 12m before deadline.
		// Adjusted response deadline = createdAt + 150m (2.5h)
		// We test at t=2h20m (140m), which leaves 10m remaining (<= 12m) -> should be amber
		history := []ticket.StatusHistoryEntry{
			{
				ID:           uuid.New(),
				TicketID:     ticketID,
				ToStatusID:   otherStatusID,
				CreatedAt:    createdAt,
			},
			{
				ID:           uuid.New(),
				TicketID:     ticketID,
				ToStatusID:   pendingStatusID,
				CreatedAt:    createdAt.Add(15 * time.Minute),
			},
			{
				ID:           uuid.New(),
				TicketID:     ticketID,
				ToStatusID:   otherStatusID,
				CreatedAt:    createdAt.Add(105 * time.Minute),
			},
		}

		summary, err := svc.GetSLASummary(context.Background(), tk, createdAt.Add(140*time.Minute), history, pendingStatusID)
		require.NoError(t, err)
		require.NotNil(t, summary)
		require.Equal(t, "amber", summary.Status)
	})
}
