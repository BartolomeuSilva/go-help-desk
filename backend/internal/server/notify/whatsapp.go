package notify

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/config"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/admin"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/notification"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/ticket"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/user"
	"github.com/publiciallc/go-help-desk/backend/internal/integration/whatsapp"
)

// WhatsAppDispatcher sends WhatsApp replies to customers via the Evolution API
// when staff posts replies to a WhatsApp-originated ticket.
type WhatsAppDispatcher struct {
	cfg      *config.Config
	adminSvc *admin.Service
	store    ticket.Store
	userSvc  *user.Service
}

// NewWhatsAppDispatcher returns a new WhatsAppDispatcher.
func NewWhatsAppDispatcher(cfg *config.Config, adminSvc *admin.Service, store ticket.Store, userSvc *user.Service) *WhatsAppDispatcher {
	return &WhatsAppDispatcher{
		cfg:      cfg,
		adminSvc: adminSvc,
		store:    store,
		userSvc:  userSvc,
	}
}

// Dispatch processes the notification event.
func (d *WhatsAppDispatcher) Dispatch(ctx context.Context, event notification.Event) error {
	if event.Type != notification.EventTicketReplied &&
		event.Type != notification.EventTicketResolved &&
		event.Type != notification.EventTicketClosed {
		return nil
	}

	if d.adminSvc == nil || !d.adminSvc.WhatsAppEnabled(ctx) {
		return nil
	}

	t, err := d.store.GetByID(ctx, event.TicketID)
	if err != nil {
		slog.Error("whatsapp dispatcher: failed to get ticket details", "ticket_id", event.TicketID, "error", err)
		return nil
	}

	// Only process WhatsApp tickets
	if t.Source != "whatsapp" || t.WhatsappPhone == nil || *t.WhatsappPhone == "" {
		return nil
	}

	if event.Type == notification.EventTicketReplied {
		// Skip if the reply is not from staff (ActorID is nil for customers/webhooks)
		if event.ActorID == nil {
			return nil
		}

		replyBody, _ := event.Payload["ReplyBody"].(string)
		if replyBody == "" {
			return nil
		}

		// Prepend the agent's name if SendAgentName is true
		sendAgentName, _ := event.Payload["SendAgentName"].(bool)
		if sendAgentName && event.ActorID != nil && d.userSvc != nil {
			if u, err := d.userSvc.GetByID(ctx, *event.ActorID); err == nil && u.DisplayName != "" {
				replyBody = "*" + u.DisplayName + ":*\n" + replyBody
			}
		}

		apiURL, apiToken, instanceName := d.adminSvc.WhatsAppConfig(ctx)
		if apiURL == "" || apiToken == "" || instanceName == "" {
			slog.Warn("whatsapp dispatcher: credentials are not configured")
			return nil
		}

		client := whatsapp.NewClient(apiURL, apiToken, instanceName)

		// Send message in the background
		go func() {
			bgCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			if err := client.SendText(bgCtx, *t.WhatsappPhone, replyBody); err != nil {
				slog.Error("whatsapp dispatcher: failed to send outbound message", "phone", *t.WhatsappPhone, "error", err)
			} else {
				slog.Info("whatsapp dispatcher: successfully sent outbound message", "phone", *t.WhatsappPhone)
			}
		}()
	} else if event.Type == notification.EventTicketResolved || event.Type == notification.EventTicketClosed {
		// Only send rating request if the ticket has not been rated yet
		if t.Rating != nil {
			return nil
		}

		// Fetch replies to check if rating was already requested
		replies, err := d.store.ListReplies(ctx, t.ID)
		if err != nil {
			slog.Error("whatsapp dispatcher: failed to list ticket replies", "ticket_id", t.ID, "error", err)
			return nil
		}

		// Check if the last reply contains "1. Excelente"
		if len(replies) > 0 {
			lastReply := replies[len(replies)-1]
			if strings.Contains(lastReply.Body, "1. Excelente") {
				// Already sent, do not send again
				return nil
			}
		}

		// Prepare the rating request message
		ratingMsg := "Como você avalia o nosso atendimento?\n\n1. Excelente\n2. Ótimo\n3. Satisfatório\n4. Ruim\n5. Pessímo"

		apiURL, apiToken, instanceName := d.adminSvc.WhatsAppConfig(ctx)
		if apiURL == "" || apiToken == "" || instanceName == "" {
			slog.Warn("whatsapp dispatcher: credentials are not configured")
			return nil
		}

		client := whatsapp.NewClient(apiURL, apiToken, instanceName)

		// Send message in the background
		go func() {
			bgCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			if err := client.SendText(bgCtx, *t.WhatsappPhone, ratingMsg); err != nil {
				slog.Error("whatsapp dispatcher: failed to send rating request message", "phone", *t.WhatsappPhone, "error", err)
				return
			}
			slog.Info("whatsapp dispatcher: successfully sent rating request message", "phone", *t.WhatsappPhone)

			// Record the rating request as a system reply in the DB.
			reply := ticket.Reply{
				ID:             uuid.New(),
				TicketID:       t.ID,
				AuthorID:       nil,
				Body:           ratingMsg,
				Internal:       false,
				NotifyCustomer: false,
				CreatedAt:      time.Now(),
				Source:         "whatsapp",
			}
			if err := d.store.CreateReply(context.Background(), reply); err != nil {
				slog.Error("whatsapp dispatcher: failed to save rating request reply", "ticket_id", t.ID, "error", err)
			}
		}()
	}

	return nil
}
