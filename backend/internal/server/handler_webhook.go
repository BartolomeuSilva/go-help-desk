package server

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/admin"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/ticket"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/user"
	"github.com/publiciallc/go-help-desk/backend/internal/integration/gemini"
	"github.com/publiciallc/go-help-desk/backend/internal/integration/whatsapp"
)

// POST /api/v1/webhooks/whatsapp
func (s *Server) handleWhatsAppWebhook(w http.ResponseWriter, r *http.Request) {
	// 1. Validate Token if configured
	apiURL, apiToken, instanceName := s.adminSvc.WhatsAppConfig(r.Context())
	if apiToken != "" {
		reqToken := r.Header.Get("apikey")
		if reqToken == "" {
			reqToken = r.Header.Get("webhook-authorization")
			reqToken = strings.TrimPrefix(reqToken, "Bearer ")
		}
		if reqToken != apiToken {
			slog.Warn("whatsapp webhook unauthorized", "received_token", reqToken, "expected_token", apiToken)
			// Apenas loga o aviso em vez de bloquear com 401 para garantir compatibilidade com Evolution v2 sem headers configurados.
			// Error(w, http.StatusUnauthorized, "unauthorized", "invalid api key")
			// return
		}
	}

	var wsClient *whatsapp.Client
	if apiURL != "" && apiToken != "" && instanceName != "" {
		wsClient = whatsapp.NewClient(apiURL, apiToken, instanceName)
	}

	// 2. Decode Webhook Payload
	var payload struct {
		Event    string `json:"event"`
		Instance string `json:"instance"`
		Data     struct {
			Key struct {
				RemoteJid string `json:"remoteJid"`
				FromMe    bool   `json:"fromMe"`
				ID        string `json:"id"`
			} `json:"key"`
			PushName string `json:"pushName"`
			Message  struct {
				Conversation        string `json:"conversation"`
				Base64              string `json:"base64"`
				ExtendedTextMessage *struct {
					Text string `json:"text"`
				} `json:"extendedTextMessage"`
				ImageMessage *struct {
					Caption  string `json:"caption"`
					Url      string `json:"url"`
					Mimetype string `json:"mimetype"`
				} `json:"imageMessage"`
				DocumentMessage *struct {
					Title    string `json:"title"`
					FileName string `json:"fileName"`
					Caption  string `json:"caption"`
					Url      string `json:"url"`
					Mimetype string `json:"mimetype"`
				} `json:"documentMessage"`
				VideoMessage *struct {
					Caption  string `json:"caption"`
					Url      string `json:"url"`
					Mimetype string `json:"mimetype"`
				} `json:"videoMessage"`
				AudioMessage *struct {
					Url      string `json:"url"`
					Mimetype string `json:"mimetype"`
				} `json:"audioMessage"`
			} `json:"message"`
			MessageType string `json:"messageType"`
		} `json:"data"`
	}

	if err := DecodeJSON(r, &payload); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	slog.Info("whatsapp webhook received", "event", payload.Event, "fromMe", payload.Data.Key.FromMe, "remoteJid", payload.Data.Key.RemoteJid)

	// Check if this is messages.upsert event
	if payload.Event != "messages.upsert" {
		JSON(w, http.StatusOK, map[string]string{"status": "ignored_event"})
		return
	}

	// Ignore messages sent by ourselves (system, bot, or agent replies)
	if payload.Data.Key.FromMe {
		JSON(w, http.StatusOK, map[string]string{"status": "ignored_from_me"})
		return
	}

	jid := payload.Data.Key.RemoteJid
	if !strings.HasSuffix(jid, "@s.whatsapp.net") {
		JSON(w, http.StatusOK, map[string]string{"status": "ignored_non_user_jid"})
		return
	}

	phone := strings.Split(jid, "@")[0]
	externalMsgID := payload.Data.Key.ID

	// Extract message body text and any media (decoded base64 when Evolution
	// includes it in the webhook, plus the URL/mimetype as fallbacks).
	var bodyText string
	var mediaURL string
	var mimeType string
	var defaultFileName string
	mediaBase64 := payload.Data.Message.Base64

	firstNonEmpty := func(vals ...string) string {
		for _, v := range vals {
			if v != "" {
				return v
			}
		}
		return ""
	}

	if payload.Data.Message.Conversation != "" {
		bodyText = payload.Data.Message.Conversation
	} else if payload.Data.Message.ExtendedTextMessage != nil && payload.Data.Message.ExtendedTextMessage.Text != "" {
		bodyText = payload.Data.Message.ExtendedTextMessage.Text
	} else if payload.Data.Message.ImageMessage != nil {
		bodyText = payload.Data.Message.ImageMessage.Caption
		if bodyText == "" {
			bodyText = "[Imagem]"
		}
		mediaURL = payload.Data.Message.ImageMessage.Url
		mimeType = firstNonEmpty(payload.Data.Message.ImageMessage.Mimetype, "image/jpeg")
		defaultFileName = "image.jpg"
	} else if payload.Data.Message.DocumentMessage != nil {
		bodyText = payload.Data.Message.DocumentMessage.Caption
		if bodyText == "" {
			bodyText = payload.Data.Message.DocumentMessage.Title
		}
		if bodyText == "" {
			bodyText = "[Documento]"
		}
		mediaURL = payload.Data.Message.DocumentMessage.Url
		mimeType = firstNonEmpty(payload.Data.Message.DocumentMessage.Mimetype, "application/octet-stream")
		defaultFileName = firstNonEmpty(payload.Data.Message.DocumentMessage.FileName, payload.Data.Message.DocumentMessage.Title, "document.bin")
	} else if payload.Data.Message.VideoMessage != nil {
		bodyText = payload.Data.Message.VideoMessage.Caption
		if bodyText == "" {
			bodyText = "[Vídeo]"
		}
		mediaURL = payload.Data.Message.VideoMessage.Url
		mimeType = firstNonEmpty(payload.Data.Message.VideoMessage.Mimetype, "video/mp4")
		defaultFileName = "video.mp4"
	} else if payload.Data.Message.AudioMessage != nil {
		bodyText = "[Áudio]"
		mediaURL = payload.Data.Message.AudioMessage.Url
		mimeType = firstNonEmpty(payload.Data.Message.AudioMessage.Mimetype, "audio/ogg")
		defaultFileName = "audio.ogg"
	}

	hasMedia := mediaBase64 != "" || mediaURL != ""

	if bodyText == "" {
		JSON(w, http.StatusOK, map[string]string{"status": "empty_body"})
		return
	}

	pushName := payload.Data.PushName
	if pushName == "" {
		pushName = "WhatsApp User"
	}

	// Check if we have an active ticket or a recent ticket
	latestTicket, err := s.tickets.GetLatestTicketByWhatsApp(r.Context(), phone)
	hasTicket := err == nil
	if err != nil && !errors.Is(err, ticket.ErrNotFound) && !errors.Is(err, sql.ErrNoRows) {
		slog.Error("failed to query latest ticket by whatsapp", "phone", phone, "error", err)
		Error(w, http.StatusInternalServerError, "db_error", "failed to check latest ticket")
		return
	}

	var statusName string
	if hasTicket {
		statuses, err := s.tickets.ListStatuses(r.Context())
		if err == nil {
			for _, st := range statuses {
				if st.ID == latestTicket.StatusID {
					statusName = st.Name
					break
				}
			}
		} else {
			slog.Error("failed to list statuses", "error", err)
			Error(w, http.StatusInternalServerError, "db_error", "failed to list statuses")
			return
		}
	}

	hasActive := false
	if hasTicket {
		slog.Info("whatsapp webhook: found ticket", "ticket_id", latestTicket.ID, "statusName", statusName, "fromMe", payload.Data.Key.FromMe)
		
		statusNameLower := strings.ToLower(statusName)
		isResolved := latestTicket.ResolvedAt != nil ||
			statusName == ticket.StatusNameResolved ||
			statusNameLower == "resolvido" ||
			statusNameLower == "resolved"
		isClosed := latestTicket.ClosedAt != nil ||
			statusName == ticket.StatusNameClosed ||
			statusNameLower == "fechado" ||
			statusNameLower == "closed" ||
			statusNameLower == "encerrado" ||
			statusNameLower == "finalizado" ||
			statusNameLower == "cancelado"

		if !isResolved && !isClosed {
			hasActive = true
		} else if isResolved {
			chatbotEnabled := s.adminSvc.WhatsAppChatbotEnabled(r.Context())
			if chatbotEnabled {
				// If chatbot is enabled, resolved tickets are not reopened via WhatsApp;
				// we treat them as inactive so they trigger the chatbot menu flow again.
				hasActive = false
			} else {
				// Check if reopen window has expired
				reopenDays := s.adminSvc.ReopenWindowDays(r.Context())
				windowExpired := true
				if latestTicket.ResolvedAt != nil {
					deadline := latestTicket.ResolvedAt.AddDate(0, 0, reopenDays)
					windowExpired = time.Now().After(deadline)
				}
				slog.Info("whatsapp webhook: resolved ticket reopen check", "ticket_id", latestTicket.ID, "reopenDays", reopenDays, "windowExpired", windowExpired, "resolvedAt", latestTicket.ResolvedAt)
				
				if !windowExpired {
					if !payload.Data.Key.FromMe {
						// Client message. Check if it's a rating response.
						choice := strings.TrimSpace(bodyText)
						isRatingChoice := choice == "1" || choice == "2" || choice == "3" || choice == "4" || choice == "5"
						
						isWaitingForRating := false
						if isRatingChoice && latestTicket.Rating == nil {
							// Verify that the last reply was indeed the rating request
							replies, err := s.tickets.ListReplies(r.Context(), latestTicket.ID)
							if err == nil && len(replies) > 0 {
								lastReply := replies[len(replies)-1]
								if strings.Contains(lastReply.Body, "1. Excelente") {
									isWaitingForRating = true
								}
							}
						}
						
						if isWaitingForRating {
							slog.Info("whatsapp webhook: treating as rating response", "ticket_id", latestTicket.ID, "choice", choice)
							// Treating as not active so we fall into the rating flow
							hasActive = false
						} else {
							slog.Info("whatsapp webhook: treating as reopen trigger", "ticket_id", latestTicket.ID, "bodyText", bodyText)
							// Normal message, treating as active to reopen it
							hasActive = true
						}
					} else {
						// Message from the company. Do not treat as active for reopen.
						hasActive = false
					}
				} else {
					// Window expired
					hasActive = false
				}
			}
		} else {
			// Status is Closed
			hasActive = false
		}
	}
	slog.Info("whatsapp webhook: hasActive resolved", "hasActive", hasActive, "hasTicket", hasTicket, "phone", phone)

	// 48 hours session check
	if hasActive && time.Since(latestTicket.UpdatedAt) >= 48*time.Hour {
		hasActive = false
	}

	activeTicket := latestTicket

	if payload.Data.Key.FromMe {
		// Message sent from the company's WhatsApp phone directly
		if !hasActive {
			// No active ticket, ignore outbound sync
			JSON(w, http.StatusOK, map[string]string{"status": "ignored_outbound_no_active_ticket"})
			return
		}

		// Deduplicate: check if external message ID already exists
		if externalMsgID != "" {
			if _, err := s.tickets.GetReplyByExternalID(r.Context(), externalMsgID); err == nil {
				JSON(w, http.StatusOK, map[string]string{"status": "duplicate"})
				return
			}
		}

		// Add reply to active ticket as admin/staff
		// Since it was sent from the phone directly, we don't have the user ID of the staff who sent it.
		// We use SystemActor to bypass validation.
		reply, err := s.tickets.AddReply(
			r.Context(),
			activeTicket.ID,
			bodyText,
			false, // internal
			false, // notifyCustomer (already sent via WhatsApp)
			"",    // reporterEmail
			ticket.SystemActor,
			0,          // reopenWindowDays
			uuid.Nil,   // reopenTargetStatusID
			"whatsapp", // source
			&externalMsgID,
			false,      // sendAgentName
		)
		if err != nil {
			slog.Error("failed to save outbound whatsapp message as reply", "ticket_id", activeTicket.ID, "error", err)
			Error(w, http.StatusInternalServerError, "db_error", "failed to save reply")
			return
		}

		// Download and attach media if present
		if hasMedia {
			go s.attachMedia(context.Background(), activeTicket.ID, mediaBase64, externalMsgID, mediaURL, defaultFileName, mimeType)
		}

		s.sseBroker.Broadcast(activeTicket.ID, "refresh", "")
		JSON(w, http.StatusOK, reply)
		return

	} else {
		// Message received from the customer
		if hasActive {
			// Deduplicate message
			if externalMsgID != "" {
				if _, err := s.tickets.GetReplyByExternalID(r.Context(), externalMsgID); err == nil {
					JSON(w, http.StatusOK, map[string]string{"status": "duplicate"})
					return
				}
			}

			// Add reply to active ticket
			actor := ticket.Actor{UserID: nil, Role: user.RoleUser}
			reopenDays := s.adminSvc.ReopenWindowDays(r.Context())
			reopenStatusName := s.adminSvc.ReopenTargetStatusName(r.Context())

			var reopenStatusID uuid.UUID
			if statuses, err := s.tickets.ListStatuses(r.Context()); err == nil {
				for _, st := range statuses {
					if st.Name == reopenStatusName {
						reopenStatusID = st.ID
						break
					}
				}
			}

			reply, err := s.tickets.AddReply(
				r.Context(),
				activeTicket.ID,
				bodyText,
				false, // internal
				false, // notifyCustomer
				"",    // reporterEmail
				actor,
				reopenDays,
				reopenStatusID,
				"whatsapp",
				&externalMsgID,
				false, // sendAgentName
			)
			if err != nil {
				slog.Error("failed to save customer whatsapp message as reply", "ticket_id", activeTicket.ID, "error", err)
				Error(w, http.StatusInternalServerError, "db_error", "failed to save reply")
				return
			}

			// Download and attach media if present
			if hasMedia {
				go s.attachMedia(context.Background(), activeTicket.ID, mediaBase64, externalMsgID, mediaURL, defaultFileName, mimeType)
			}

			s.sseBroker.Broadcast(activeTicket.ID, "refresh", "")
			aiEnabled, _, _, _ := s.adminSvc.WhatsAppAIConfig(r.Context())
			slog.Info("whatsapp webhook: check AI support activation",
				"ticket_id", activeTicket.ID,
				"ticket_ai_active", activeTicket.AIActive,
				"ai_enabled", aiEnabled,
			)
			if activeTicket.AIActive && aiEnabled {
				go s.processAISupport(context.Background(), activeTicket, bodyText, wsClient, phone)
			}
			// Ring the bell for the support team so the inbound message is seen
			// even by agents not viewing this ticket.
			s.broadcastReplyNotification(r.Context(), activeTicket, reply, false)
			JSON(w, http.StatusOK, reply)
			return

		} else {
			// No active ticket or ticket is older than 48 hours.
			choice := strings.TrimSpace(bodyText)
			isRatingChoice := choice == "1" || choice == "2" || choice == "3" || choice == "4" || choice == "5"

			chatbotEnabled := s.adminSvc.WhatsAppChatbotEnabled(r.Context())
			welcomeMessage, menuConfigJSON := s.adminSvc.WhatsAppChatbotConfig(r.Context())

			var session ticket.WhatsAppSession
			var sessionErr error
			hasSession := false

			if chatbotEnabled && welcomeMessage != "" && menuConfigJSON != "" && menuConfigJSON != "{}" {
				session, sessionErr = s.tickets.GetWhatsAppSession(r.Context(), phone)
				hasSession = sessionErr == nil
			}

			isResolved := latestTicket.ResolvedAt != nil ||
				statusName == ticket.StatusNameResolved ||
				strings.ToLower(statusName) == "resolvido" ||
				strings.ToLower(statusName) == "resolved"
			isClosed := latestTicket.ClosedAt != nil ||
				statusName == ticket.StatusNameClosed ||
				strings.ToLower(statusName) == "fechado" ||
				strings.ToLower(statusName) == "closed" ||
				strings.ToLower(statusName) == "encerrado" ||
				strings.ToLower(statusName) == "finalizado" ||
				strings.ToLower(statusName) == "cancelado"

			if isRatingChoice && !hasSession && hasTicket && (isResolved || isClosed) && latestTicket.Rating == nil {
				// We found a recently resolved or closed ticket for this number that is not yet rated!
				// Let's verify that a rating request was actually sent (to prevent randomly typing "1" from rating a random ticket).
				// We check if the last reply on the ticket contains the rating options: "1. Excelente".
				replies, err := s.tickets.ListReplies(r.Context(), latestTicket.ID)
				if err == nil && len(replies) > 0 {
					lastReply := replies[len(replies)-1]
					if strings.Contains(lastReply.Body, "1. Excelente") {
						var ratingVal int
						switch choice {
						case "1":
							ratingVal = 5
						case "2":
							ratingVal = 4
						case "3":
							ratingVal = 3
						case "4":
							ratingVal = 2
						case "5":
							ratingVal = 1
						}

						// Rate the ticket
						comment := "Avaliado via WhatsApp"
						actor := ticket.Actor{UserID: nil, Role: user.RoleUser}
						_, err = s.tickets.Rate(r.Context(), latestTicket.ID, ticket.RateInput{
							Rating:  ratingVal,
							Comment: &comment,
						}, actor)
						if err == nil {
							// Send thank you message
							thanksMsg := "Obrigado por sua avaliação. Ela é importante para que nós possamos melhorar cada vez mais o atendimento."
							if wsClient != nil {
								_ = wsClient.SendText(r.Context(), phone, thanksMsg)
							}

							// Record client's rating response and system thank you message as replies in the DB
							actorUser := ticket.Actor{UserID: nil, Role: user.RoleUser}
							_, _ = s.tickets.AddReply(
								r.Context(),
								latestTicket.ID,
								bodyText,
								false, // internal
								false, // notifyCustomer
								"",    // reporterEmail
								actorUser,
								0,          // reopenWindowDays (do not reopen when rating)
								uuid.Nil,   // reopenTargetStatusID
								"whatsapp",
								nil,        // externalMsgID
								false,      // sendAgentName
							)

							_, _ = s.tickets.AddReply(
								r.Context(),
								latestTicket.ID,
								thanksMsg,
								false, // internal
								false, // notifyCustomer
								"",    // reporterEmail
								ticket.SystemActor,
								0,          // reopenWindowDays
								uuid.Nil,   // reopenTargetStatusID
								"whatsapp",
								nil,        // externalMsgID
								false,      // sendAgentName
							)

							s.sseBroker.Broadcast(latestTicket.ID, "refresh", "")
							JSON(w, http.StatusOK, map[string]string{"status": "rated"})
							return
						} else {
							slog.Error("failed to rate ticket from whatsapp webhook", "ticket_id", latestTicket.ID, "error", err)
						}
					}
				}
			}

			if chatbotEnabled && welcomeMessage != "" && menuConfigJSON != "" && menuConfigJSON != "{}" {
				// Chatbot is active, check for temporary session
				if sessionErr != nil {
					if errors.Is(sessionErr, ticket.ErrNotFound) {
						// 1. First contact: Create temporary session and send welcome message.
						// Media is attached only after the customer picks a menu option,
						// so we stash it now: the decrypted base64 if the webhook carried
						// it, otherwise the message ID to fetch on demand. (The raw URL is
						// end-to-end encrypted and useless on its own.)
						mediaRef := ""
						if mediaBase64 != "" {
							mediaRef = "b64:" + mediaBase64
						} else if mediaURL != "" {
							mediaRef = "id:" + externalMsgID
						}
						if err := s.tickets.CreateWhatsAppSession(r.Context(), phone, bodyText, mediaRef, mimeType); err != nil {
							slog.Error("failed to create whatsapp session", "phone", phone, "error", err)
							Error(w, http.StatusInternalServerError, "db_error", "failed to initialize chatbot session")
							return
						}

						if wsClient != nil {
							if err := wsClient.SendText(r.Context(), phone, welcomeMessage); err != nil {
								slog.Error("failed to send whatsapp welcome message", "phone", phone, "error", err)
							}
						}

						JSON(w, http.StatusOK, map[string]string{"status": "welcome_sent"})
						return
					}

					slog.Error("failed to query whatsapp session", "phone", phone, "error", err)
					Error(w, http.StatusInternalServerError, "db_error", "failed to check chatbot session")
					return
				}

				// 2. Subsequent contact: Client chose an option
				choice := strings.TrimSpace(bodyText)
				var menuConfig map[string]string
				if err := json.Unmarshal([]byte(menuConfigJSON), &menuConfig); err != nil {
					slog.Error("failed to parse whatsapp menu config JSON", "error", err)
					choice = "" // fallback to invalid
				}

				categoryIDStr, ok := menuConfig[choice]
				var categoryID uuid.UUID
				if ok {
					var err error
					categoryID, err = uuid.Parse(categoryIDStr)
					if err != nil {
						ok = false
					}
				}

				if ok {
					// Client selected a valid category option. Create the ticket!
					subjectText := session.InitialMessage
					if len(subjectText) > 50 {
						subjectText = subjectText[:47] + "..."
					}
					subject := "WhatsApp: " + subjectText

					guestEmail := phone + "@whatsapp.invalid"

					in := ticket.CreateInput{
						Subject:       subject,
						Description:   session.InitialMessage,
						CategoryID:    categoryID,
						GuestName:     pushName,
						GuestPhone:    phone,
						GuestEmail:    &guestEmail,
						Source:        "whatsapp",
						WhatsappPhone: &phone,
						Priority:      ticket.PriorityMedium,
					}

					newTicket, err := s.tickets.Create(r.Context(), in)
					if err != nil {
						slog.Error("failed to create new ticket from whatsapp chatbot", "phone", phone, "error", err)
						Error(w, http.StatusInternalServerError, "db_error", "failed to create ticket")
						return
					}

					// Send confirmation message to customer on WhatsApp
					confMsg := fmt.Sprintf("Perfeito! Seu chamado foi aberto com sucesso sob o número *%s*.\n\nUm atendente entrará em contato em breve.", newTicket.TrackingNumber)
					if wsClient != nil {
						if err := wsClient.SendText(r.Context(), phone, confMsg); err != nil {
							slog.Error("failed to send whatsapp confirmation message", "phone", phone, "error", err)
						}
					}

					// Attach media from the first message (session stashed either the
					// decrypted base64 as "b64:…" or the message ID as "id:…").
					if session.MediaURL != "" {
						b64, msgID := parseSessionMediaRef(session.MediaURL)
						go s.attachMedia(context.Background(), newTicket.ID, b64, msgID, "", "attachment", session.MimeType)
					}
					// Also attach media if present in the current option message
					if hasMedia {
						go s.attachMedia(context.Background(), newTicket.ID, mediaBase64, externalMsgID, mediaURL, defaultFileName, mimeType)
					}

					// Delete session
					_ = s.tickets.DeleteWhatsAppSession(r.Context(), phone)

					s.sseBroker.Broadcast(newTicket.ID, "refresh", "")
					s.notifyNewWhatsAppTicket(r.Context(), newTicket, session.InitialMessage, pushName)
					aiEnabled, _, _, _ := s.adminSvc.WhatsAppAIConfig(r.Context())
					if newTicket.AIActive && aiEnabled && !isGreetingOrShort(session.InitialMessage) {
						go s.processAISupport(context.Background(), newTicket, session.InitialMessage, wsClient, phone)
					}
					JSON(w, http.StatusCreated, newTicket)
					return
				} else {
					// Option didn't match the menu: just resend the menu cleanly.
					// No "invalid option" prefix — on first contact the customer
					// hasn't seen the options yet, so scolding them is confusing.
					if wsClient != nil {
						if err := wsClient.SendText(r.Context(), phone, welcomeMessage); err != nil {
							slog.Error("failed to resend whatsapp menu on unmatched input", "phone", phone, "error", err)
						}
					}

					JSON(w, http.StatusOK, map[string]string{"status": "invalid_option_sent"})
					return
				}
			}

			// Fallback behavior: chatbot disabled or unconfigured. Create ticket directly in first category.
			// 1. Get a category
			cats, err := s.categories.ListCategories(r.Context(), true)
			if err != nil || len(cats) == 0 {
				slog.Error("failed to fetch categories for whatsapp ticket creation", "error", err)
				Error(w, http.StatusInternalServerError, "db_error", "no categories found to assign ticket")
				return
			}
			categoryID := cats[0].ID

			// 2. Format Subject (WhatsApp: <first 50 chars of first message>)
			subjectText := bodyText
			if len(subjectText) > 50 {
				subjectText = subjectText[:47] + "..."
			}
			subject := "WhatsApp: " + subjectText

			guestEmail := phone + "@whatsapp.invalid"

			// Create ticket
			in := ticket.CreateInput{
				Subject:       subject,
				Description:   bodyText,
				CategoryID:    categoryID,
				GuestName:     pushName,
				GuestPhone:    phone,
				GuestEmail:    &guestEmail,
				Source:        "whatsapp",
				WhatsappPhone: &phone,
				Priority:      ticket.PriorityMedium,
			}

			newTicket, err := s.tickets.Create(r.Context(), in)
			if err != nil {
				slog.Error("failed to create new ticket from whatsapp webhook", "phone", phone, "error", err)
				Error(w, http.StatusInternalServerError, "db_error", "failed to create ticket")
				return
			}

			// Download and attach media if present
			if hasMedia {
				go s.attachMedia(context.Background(), newTicket.ID, mediaBase64, externalMsgID, mediaURL, defaultFileName, mimeType)
			}

			s.sseBroker.Broadcast(newTicket.ID, "refresh", "")
			s.notifyNewWhatsAppTicket(r.Context(), newTicket, bodyText, pushName)
			JSON(w, http.StatusCreated, newTicket)
			return
		}
	}
}

// notifyNewWhatsAppTicket rings the support team's bell for a ticket that was
// just opened from WhatsApp. It reuses the per-user notification stream by
// synthesising a customer "reply" from the ticket's first message.
func (s *Server) notifyNewWhatsAppTicket(ctx context.Context, t ticket.Ticket, message, authorName string) {
	name := authorName
	s.broadcastReplyNotification(ctx, t, ticket.Reply{
		ID:         uuid.New(),
		TicketID:   t.ID,
		AuthorName: &name,
		Body:       message,
		CreatedAt:  time.Now(),
	}, false)
}

// parseSessionMediaRef decodes the media reference stashed on a chatbot session:
// "b64:<base64>" carries the decrypted file, "id:<messageID>" is fetched later.
func parseSessionMediaRef(ref string) (base64Data, messageID string) {
	switch {
	case strings.HasPrefix(ref, "b64:"):
		return strings.TrimPrefix(ref, "b64:"), ""
	case strings.HasPrefix(ref, "id:"):
		return "", strings.TrimPrefix(ref, "id:")
	default:
		return "", ref // legacy value: treat as a message ID
	}
}

// attachMedia saves an inbound WhatsApp media file as a ticket attachment. It
// tries, in order: base64 carried in the webhook, the Evolution getBase64 API
// (by message ID), then a direct URL download. WhatsApp media URLs are
// end-to-end encrypted, so the first two are the reliable paths.
func (s *Server) attachMedia(ctx context.Context, ticketID uuid.UUID, base64Data, messageID, mediaURL, defaultName, mimeType string) {
	if base64Data == "" && messageID == "" && mediaURL == "" {
		return
	}

	var data []byte
	fileName := defaultName

	// Preferred: base64 included directly in the webhook (Evolution decrypts it).
	if base64Data != "" {
		if b, err := base64.StdEncoding.DecodeString(base64Data); err == nil {
			data = b
		} else {
			slog.Error("failed to decode webhook media base64", "ticket_id", ticketID, "error", err)
		}
	}

	if data == nil && messageID != "" {
		apiURL, apiToken, instanceName := s.adminSvc.WhatsAppConfig(ctx)
		if apiURL != "" && apiToken != "" && instanceName != "" {
			client := whatsapp.NewClient(apiURL, apiToken, instanceName)
			b, mt, fn, err := client.GetMediaBase64(ctx, messageID)
			if err != nil {
				slog.Error("failed to fetch media from Evolution", "message_id", messageID, "error", err)
			} else {
				data = b
				if mt != "" {
					mimeType = mt
				}
				if fn != "" {
					fileName = fn
				}
			}
		}
	}

	if data == nil && mediaURL != "" {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL, nil)
		if err != nil {
			slog.Error("failed to create media download request", "url", mediaURL, "error", err)
			return
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			slog.Error("failed to download media", "url", mediaURL, "error", err)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			slog.Error("media download returned non-200", "status", resp.StatusCode, "url", mediaURL)
			return
		}
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			slog.Error("failed to read downloaded media body", "error", err)
			return
		}
		data = body
		if lastSlash := strings.LastIndex(mediaURL, "/"); lastSlash != -1 {
			potentialName := mediaURL[lastSlash+1:]
			if strings.Contains(potentialName, ".") && len(potentialName) < 100 {
				fileName = potentialName
			}
		}
	}

	if len(data) == 0 {
		slog.Error("media attach produced no data", "ticket_id", ticketID, "message_id", messageID)
		return
	}

	if fileName == "" {
		fileName = "attachment"
	}
	ext := strings.ToLower(filepath.Ext(fileName))
	if ext == "" {
		switch {
		case mimeType == "image/jpeg":
			ext = ".jpg"
		case mimeType == "image/png":
			ext = ".png"
		case mimeType == "application/pdf":
			ext = ".pdf"
		case strings.HasPrefix(mimeType, "audio/"):
			ext = ".ogg"
		case strings.HasPrefix(mimeType, "video/"):
			ext = ".mp4"
		default:
			ext = ".bin"
		}
		fileName += ext
	}

	// Write to disk
	storageID := uuid.New()
	subdir := filepath.Join(s.cfg.AttachmentDir, "tickets", ticketID.String())
	if err := os.MkdirAll(subdir, 0o755); err != nil {
		slog.Error("failed to create attachment directory", "dir", subdir, "error", err)
		return
	}

	diskPath := filepath.Join(subdir, storageID.String()+ext)
	if err := os.WriteFile(diskPath, data, 0o644); err != nil {
		slog.Error("failed to write attachment to disk", "path", diskPath, "error", err)
		return
	}

	// 4. Create database record
	att := ticket.Attachment{
		ID:          storageID,
		TicketID:    ticketID,
		Filename:    fileName,
		MimeType:    mimeType,
		SizeBytes:   int64(len(data)),
		StoragePath: diskPath,
		CreatedAt:   time.Now(),
	}

	if err := s.tickets.CreateAttachment(ctx, att); err != nil {
		_ = os.Remove(diskPath)
		slog.Error("failed to save attachment metadata in database", "error", err)
		return
	}

	s.sseBroker.Broadcast(ticketID, "refresh", "")
}

// performHandover transitions a WhatsApp ticket to a human agent, updates its status to 'New', and deactivates AI support for it.
func (s *Server) performHandover(ctx context.Context, t ticket.Ticket, handoverMsg string, wsClient *whatsapp.Client, phone string) {
	err := s.tickets.UpdateAIState(ctx, t.ID, false, true)
	if err != nil {
		slog.Error("failed to update ticket AI state to inactive", "ticket_id", t.ID, "error", err)
	}

	_, err = s.tickets.AddReply(
		ctx,
		t.ID,
		handoverMsg,
		false, // internal
		false, // notifyCustomer
		"",    // reporterEmail
		ticket.SystemActor,
		0,          // reopenWindowDays
		uuid.Nil,   // reopenTargetStatusID
		"whatsapp", // source
		nil,        // externalMsgID
		false,      // sendAgentName
	)
	if err != nil {
		slog.Error("failed to save handover message to database", "ticket_id", t.ID, "error", err)
	}

	if wsClient != nil {
		if err := wsClient.SendText(ctx, phone, handoverMsg); err != nil {
			slog.Error("failed to send handover message via WhatsApp", "phone", phone, "error", err)
		}
	}

	var newStatusID uuid.UUID
	if statuses, err := s.tickets.ListStatuses(ctx); err == nil {
		for _, st := range statuses {
			if st.Name == ticket.StatusNameNew {
				newStatusID = st.ID
				break
			}
		}
	}

	if newStatusID != uuid.Nil {
		_, _ = s.tickets.UpdateStatus(ctx, t.ID, newStatusID, ticket.SystemActor)
	}

	s.sseBroker.Broadcast(t.ID, "refresh", "")
	s.notifyNewWhatsAppTicket(ctx, t, handoverMsg, "Zendflow AI")
}

// processAISupport processes incoming customer messages on tickets where AI support is active.
// It retrieves semantically similar articles from the knowledge base and queries the Gemini
// API. If it can answer the query confidently, it responds; otherwise, it triggers a handover
// to human agents.
func (s *Server) processAISupport(ctx context.Context, t ticket.Ticket, messageText string, wsClient *whatsapp.Client, phone string) {
	slog.Info("AI Support: processAISupport started", "ticket_id", t.ID, "message", messageText)

	// 1. Check if AI is enabled globally
	aiEnabled, err1 := s.adminSvc.GetBool(ctx, admin.KeyWhatsAppAIEnabled)
	apiKey, err2 := s.adminSvc.GetString(ctx, admin.KeyGeminiAPIKey)

	slog.Info("AI Support: Settings fetched", "ticket_id", t.ID, "ai_enabled", aiEnabled, "err1", err1, "has_api_key", apiKey != "", "err2", err2)

	if !aiEnabled {
		return
	}
	if apiKey == "" {
		slog.Warn("AI support is enabled but gemini_api_key is empty")
		return
	}

	// 2. Fetch AI settings
	systemPrompt, _ := s.adminSvc.GetString(ctx, admin.KeyWhatsAppAIPrompt)
	handoverMsg, _ := s.adminSvc.GetString(ctx, admin.KeyWhatsAppAIHandoverMsg)
	if handoverMsg == "" {
		handoverMsg = "Não tenho essa resposta na minha base de conhecimento. Vou transferir você para um atendente humano. Por favor, aguarde um momento."
	}

	// 3. Initialize Gemini client
	geminiClient := gemini.NewClient(apiKey)

	// 4. Generate embedding of user message
	emb, err := geminiClient.GenerateEmbedding(ctx, messageText)
	if err != nil {
		slog.Error("failed to generate embedding for AI support, triggering handover", "ticket_id", t.ID, "error", err)
		s.performHandover(ctx, t, handoverMsg, wsClient, phone)
		return
	}

	// 5. Search similar articles in KB
	articles, err := s.kb.GetSimilarArticles(ctx, emb, 3)
	if err != nil {
		slog.Error("failed to search similar articles for AI support, triggering handover", "ticket_id", t.ID, "error", err)
		s.performHandover(ctx, t, handoverMsg, wsClient, phone)
		return
	}

	// Fetch threshold setting
	thresholdStr, _ := s.adminSvc.GetString(ctx, admin.KeyWhatsAppAIThreshold)
	threshold := 0.4 // default
	if thresholdStr != "" {
		if val, err := strconv.ParseFloat(thresholdStr, 64); err == nil {
			threshold = val
		}
	}

	slog.Info("AI Support: Search similar articles",
		"ticket_id", t.ID,
		"message", messageText,
		"threshold", threshold,
		"found_articles_count", len(articles),
	)

	// Check if we have any articles meeting the similarity threshold.
	// pgvector distance is cosine distance (0 to 2, where 0 is identical).
	// Cosine similarity is 1.0 - distance.
	// So we need similarity >= threshold, which is (1.0 - distance) >= threshold.
	hasMatchingArticle := false
	for i, art := range articles {
		similarity := 1.0 - float64(art.Distance)
		slog.Info("AI Support: Checked article similarity",
			"index", i+1,
			"article_id", art.ID,
			"title", art.Title,
			"status", art.Status,
			"distance", art.Distance,
			"similarity", similarity,
			"passes_threshold", similarity >= threshold,
		)
		if similarity >= threshold {
			hasMatchingArticle = true
		}
	}

	if !hasMatchingArticle {
		slog.Info("no similar articles found above confidence threshold, triggering handover", "ticket_id", t.ID, "threshold", threshold)
		s.performHandover(ctx, t, handoverMsg, wsClient, phone)
		return
	}

	var kbContext strings.Builder
	for i, art := range articles {
		similarity := 1.0 - float64(art.Distance)
		if similarity >= threshold {
			kbContext.WriteString(fmt.Sprintf("Artigo %d:\nTítulo: %s\nConteúdo:\n%s\n\n", i+1, art.Title, art.Content))
		}
	}

	// 6. Formulate prompt for Gemini
	prompt := fmt.Sprintf(`%s

Artigos da Base de Conhecimento disponíveis:
%s

Dúvida do Cliente: "%s"

Responda estritamente no formato JSON abaixo, sem formatação markdown adicional (não inclua '''json ou '''):
{
  "answered": true,
  "response_text": "sua resposta aqui...",
  "needs_human_handover": false
}
`, systemPrompt, kbContext.String(), messageText)

	// 7. Generate content from Gemini
	slog.Info("AI Support: Sending prompt to Gemini", "ticket_id", t.ID)
	resText, err := geminiClient.GenerateContent(ctx, "gemini-2.5-flash", prompt, true)
	if err != nil {
		slog.Error("failed to generate content from Gemini for AI support, triggering handover", "ticket_id", t.ID, "error", err)
		s.performHandover(ctx, t, handoverMsg, wsClient, phone)
		return
	}
	slog.Info("AI Support: Raw response from Gemini", "ticket_id", t.ID, "response", resText)

	type aiResponse struct {
		Answered           bool   `json:"answered"`
		ResponseText       string `json:"response_text"`
		NeedsHumanHandover bool   `json:"needs_human_handover"`
	}

	// Clean code block ticks if any (Gemini sometimes returns markdown despite instructions)
	resTextClean := strings.TrimSpace(resText)
	resTextClean = strings.TrimPrefix(resTextClean, "```json")
	resTextClean = strings.TrimPrefix(resTextClean, "```")
	resTextClean = strings.TrimSuffix(resTextClean, "```")
	resTextClean = strings.TrimSpace(resTextClean)

	var aiRes aiResponse
	if err := json.Unmarshal([]byte(resTextClean), &aiRes); err != nil {
		slog.Error("failed to parse AI response JSON, triggering handover", "ticket_id", t.ID, "raw", resText, "error", err)
		s.performHandover(ctx, t, handoverMsg, wsClient, phone)
		return
	}
	slog.Info("AI Support: Parsed Gemini response",
		"ticket_id", t.ID,
		"answered", aiRes.Answered,
		"needs_human_handover", aiRes.NeedsHumanHandover,
		"response_length", len(aiRes.ResponseText),
	)

	// 8. Act on response
	if !aiRes.NeedsHumanHandover && aiRes.Answered && aiRes.ResponseText != "" {
		// AI successfully answered the client
		_, err = s.tickets.AddReply(
			ctx,
			t.ID,
			aiRes.ResponseText,
			false, // internal
			false, // notifyCustomer
			"",    // reporterEmail
			ticket.SystemActor,
			0,          // reopenWindowDays
			uuid.Nil,   // reopenTargetStatusID
			"whatsapp", // source
			nil,        // externalMsgID
			false,      // sendAgentName
		)
		if err != nil {
			slog.Error("failed to save AI reply to database", "ticket_id", t.ID, "error", err)
		}

		if wsClient != nil {
			if err := wsClient.SendText(ctx, phone, aiRes.ResponseText); err != nil {
				slog.Error("failed to send AI response via WhatsApp", "phone", phone, "error", err)
			}
		}

		s.sseBroker.Broadcast(t.ID, "refresh", "")
	} else {
		slog.Info("AI response requested handover", "ticket_id", t.ID, "needs_handover", aiRes.NeedsHumanHandover, "answered", aiRes.Answered)
		s.performHandover(ctx, t, handoverMsg, wsClient, phone)
	}
}

func isGreetingOrShort(msg string) bool {
	m := strings.TrimSpace(strings.ToLower(msg))
	// Remove basic punctuation
	m = strings.ReplaceAll(m, "!", "")
	m = strings.ReplaceAll(m, "?", "")
	m = strings.ReplaceAll(m, ".", "")
	m = strings.ReplaceAll(m, ",", "")
	m = strings.TrimSpace(m)

	if len(m) < 4 { // "oi", "ola", "hi", "ok", "1"
		return true
	}

	greetings := map[string]bool{
		"olá":       true,
		"ola":       true,
		"oi":        true,
		"hi":        true,
		"hello":     true,
		"bom dia":   true,
		"boa tarde": true,
		"boa noite": true,
		"tudo bem":  true,
		"como vai":  true,
		"teste":     true,
		"test":      true,
		"suporte":   true,
		"ajuda":     true,
	}

	return greetings[m]
}
