package server

import (
	"log/slog"
	"net/http"

	"github.com/google/uuid"
	authmw "github.com/publiciallc/go-help-desk/backend/internal/middleware"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/ticket"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/user"
)

type dashboardSummary struct {
	Statuses               []ticket.Status `json:"statuses"`
	MyRecentTickets        []ticket.Ticket `json:"my_recent_tickets"`
	UnassignedGroupTickets []ticket.Ticket `json:"unassigned_group_tickets"`
}

// GET /api/v1/dashboard/summary
// Returns a consolidated view for the dashboard, including status counts,
// recent tickets assigned to the user, and unassigned tickets in their groups.
func (s *Server) handleDashboardSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	a := authmw.GetActor(r)
	if a == nil {
		Error(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}

	summary := dashboardSummary{
		MyRecentTickets:        []ticket.Ticket{},
		UnassignedGroupTickets: []ticket.Ticket{},
	}

	// 1. Status Counts
	statuses, err := s.tickets.ListStatuses(ctx)
	if err != nil {
		handleError(w, err)
		return
	}

	var groupIDs []uuid.UUID
	if a.Role == user.RoleStaff {
		groups, err := s.groups.ListGroupsForUser(ctx, a.UserID)
		if err != nil {
			slog.Error("dashboard: failed to list groups for user", "user_id", a.UserID, "error", err)
		} else {
			groupIDs = make([]uuid.UUID, len(groups))
			for i, g := range groups {
				groupIDs[i] = g.ID
			}
		}
	}

	for i := range statuses {
		var count int64
		var cerr error
		switch {
		case a.Role == user.RoleAdmin:
			count, cerr = s.tickets.CountByStatus(ctx, statuses[i].ID)
		case a.Role != user.RoleUser:
			count, cerr = s.tickets.CountByStatusForAssignee(ctx, statuses[i].ID, a.UserID, groupIDs)
		default:
			count, cerr = s.tickets.CountByStatusForReporter(ctx, statuses[i].ID, a.UserID)
		}
		if cerr == nil {
			statuses[i].TicketCount = count
		}
	}
	summary.Statuses = statuses

	// 2. Recent and Unassigned Tickets (Staff/Admin only)
	if a.Role != user.RoleUser {
		// My Recent Tickets
		recent, err := s.tickets.ListByAssigneeUser(ctx, a.UserID, 5, 0)
		if err == nil {
			summary.MyRecentTickets = recent
		} else {
			slog.Error("dashboard: failed to list recent tickets", "user_id", a.UserID, "error", err)
		}

		// Unassigned Group Tickets (Staff/Admin)
		// For admins, show general unassigned. For staff, show group-unassigned.
		if a.Role == user.RoleAdmin {
			unassigned, err := s.tickets.ListUnassigned(ctx, 10, 0)
			if err == nil {
				summary.UnassignedGroupTickets = unassigned
			}
		} else if len(groupIDs) > 0 {
			var unassigned []ticket.Ticket
			seen := make(map[uuid.UUID]bool)
			for _, gid := range groupIDs {
				gTickets, err := s.tickets.ListByAssigneeGroup(ctx, gid, 15, 0)
				if err == nil {
					for _, t := range gTickets {
						if t.AssigneeUserID == nil && !seen[t.ID] {
							seen[t.ID] = true
							unassigned = append(unassigned, t)
						}
					}
				}
				if len(unassigned) >= 10 {
					break
				}
			}
			summary.UnassignedGroupTickets = unassigned
		}
	}

	JSON(w, http.StatusOK, summary)
}
