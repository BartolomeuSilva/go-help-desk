package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/ticket"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/user"
	"github.com/publiciallc/go-help-desk/backend/internal/integration/whatsapp"
)

// POST /api/v1/webhooks/whatsapp
func (s *Server) handleWhatsAppWebhook(w http.ResponseWriter, r *http.Request) {
	// 1. Validate Token if configured
	_, apiToken, _ := s.adminSvc.WhatsAppConfig(r.Context())
	if apiToken != "" {
		reqToken := r.Header.Get("apikey")
		if reqToken == "" {
			reqToken = r.Header.Get("webhook-authorization")
			reqToken = strings.TrimPrefix(reqToken, "Bearer ")
		}
		if reqToken != apiToken {
			Error(w, http.StatusUnauthorized, "unauthorized", "invalid api key")
			return
		}
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
				ExtendedTextMessage *struct {
					Text string `json:"text"`
				} `json:"extendedTextMessage"`
				ImageMessage *struct {
					Caption string `json:"caption"`
					Url     string `json:"url"`
				} `json:"imageMessage"`
				DocumentMessage *struct {
					Title   string `json:"title"`
					Caption string `json:"caption"`
					Url     string `json:"url"`
				} `json:"documentMessage"`
				VideoMessage *struct {
					Caption string `json:"caption"`
					Url     string `json:"url"`
				} `json:"videoMessage"`
				AudioMessage *struct {
					Url     string `json:"url"`
				} `json:"audioMessage"`
			} `json:"message"`
			MessageType string `json:"messageType"`
		} `json:"data"`
	}

	if err := DecodeJSON(r, &payload); err != nil {
		Error(w, http.StatusBadRequest, "bad_request", "invalid JSON")
		return
	}

	// Check if this is messages.upsert event
	if payload.Event != "messages.upsert" {
		JSON(w, http.StatusOK, map[string]string{"status": "ignored_event"})
		return
	}

	jid := payload.Data.Key.RemoteJid
	if !strings.HasSuffix(jid, "@s.whatsapp.net") {
		JSON(w, http.StatusOK, map[string]string{"status": "ignored_non_user_jid"})
		return
	}

	phone := strings.Split(jid, "@")[0]
	externalMsgID := payload.Data.Key.ID

	// Extract message body text
	var bodyText string
	var mediaURL string
	var mimeType string
	var defaultFileName string

	if payload.Data.Message.Conversation != "" {
		bodyText = payload.Data.Message.Conversation
	} else if payload.Data.Message.ExtendedTextMessage != nil && payload.Data.Message.ExtendedTextMessage.Text != "" {
		bodyText = payload.Data.Message.ExtendedTextMessage.Text
	} else if payload.Data.Message.ImageMessage != nil {
		bodyText = payload.Data.Message.ImageMessage.Caption
		if bodyText == "" {
			bodyText = "[Imagem]"
		}
		if payload.Data.Message.ImageMessage.Url != "" {
			mediaURL = payload.Data.Message.ImageMessage.Url
			mimeType = "image/jpeg"
			defaultFileName = "image.jpg"
		}
	} else if payload.Data.Message.DocumentMessage != nil {
		bodyText = payload.Data.Message.DocumentMessage.Caption
		if bodyText == "" {
			bodyText = payload.Data.Message.DocumentMessage.Title
		}
		if bodyText == "" {
			bodyText = "[Documento]"
		}
		if payload.Data.Message.DocumentMessage.Url != "" {
			mediaURL = payload.Data.Message.DocumentMessage.Url
			mimeType = "application/octet-stream"
			defaultFileName = payload.Data.Message.DocumentMessage.Title
			if defaultFileName == "" {
				defaultFileName = "document.bin"
			}
		}
	} else if payload.Data.Message.VideoMessage != nil {
		bodyText = payload.Data.Message.VideoMessage.Caption
		if bodyText == "" {
			bodyText = "[Vídeo]"
		}
		if payload.Data.Message.VideoMessage.Url != "" {
			mediaURL = payload.Data.Message.VideoMessage.Url
			mimeType = "video/mp4"
			defaultFileName = "video.mp4"
		}
	} else if payload.Data.Message.AudioMessage != nil {
		bodyText = "[Áudio]"
		if payload.Data.Message.AudioMessage.Url != "" {
			mediaURL = payload.Data.Message.AudioMessage.Url
			mimeType = "audio/ogg"
			defaultFileName = "audio.ogg"
		}
	}

	if bodyText == "" {
		JSON(w, http.StatusOK, map[string]string{"status": "empty_body"})
		return
	}

	pushName := payload.Data.PushName
	if pushName == "" {
		pushName = "WhatsApp User"
	}

	// Check if we have an active ticket
	activeTicket, err := s.tickets.GetActiveTicketByWhatsApp(r.Context(), phone)
	hasActive := err == nil
	if err != nil && !errors.Is(err, ticket.ErrNotFound) && !errors.Is(err, sql.ErrNoRows) {
		slog.Error("failed to query active ticket by whatsapp", "phone", phone, "error", err)
		Error(w, http.StatusInternalServerError, "db_error", "failed to check active ticket")
		return
	}

	// 48 hours session check
	if hasActive && time.Since(activeTicket.UpdatedAt) >= 48*time.Hour {
		// Session expired, mark active ticket as resolved or closed? No, we just ignore it and create a new ticket.
		hasActive = false
	}

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
		if mediaURL != "" {
			go s.downloadAndAttachMedia(context.Background(), activeTicket.ID, mediaURL, bodyText, defaultFileName, mimeType)
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
			if mediaURL != "" {
				go s.downloadAndAttachMedia(context.Background(), activeTicket.ID, mediaURL, bodyText, defaultFileName, mimeType)
			}

			s.sseBroker.Broadcast(activeTicket.ID, "refresh", "")
			JSON(w, http.StatusOK, reply)
			return

		} else {
			// No active ticket or ticket is older than 48 hours.
			chatbotEnabled := s.adminSvc.WhatsAppChatbotEnabled(r.Context())
			welcomeMessage, menuConfigJSON := s.adminSvc.WhatsAppChatbotConfig(r.Context())

			if chatbotEnabled && welcomeMessage != "" && menuConfigJSON != "" && menuConfigJSON != "{}" {
				// Chatbot is active, check for temporary session
				session, err := s.tickets.GetWhatsAppSession(r.Context(), phone)
				if err != nil {
					if errors.Is(err, ticket.ErrNotFound) {
						// 1. First contact: Create temporary session and send welcome message
						if err := s.tickets.CreateWhatsAppSession(r.Context(), phone, bodyText, mediaURL, mimeType); err != nil {
							slog.Error("failed to create whatsapp session", "phone", phone, "error", err)
							Error(w, http.StatusInternalServerError, "db_error", "failed to initialize chatbot session")
							return
						}

						apiURL, apiToken, instanceName := s.adminSvc.WhatsAppConfig(r.Context())
						wsClient := whatsapp.NewClient(apiURL, apiToken, instanceName)
						if err := wsClient.SendText(r.Context(), phone, welcomeMessage); err != nil {
							slog.Error("failed to send whatsapp welcome message", "phone", phone, "error", err)
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
					apiURL, apiToken, instanceName := s.adminSvc.WhatsAppConfig(r.Context())
					wsClient := whatsapp.NewClient(apiURL, apiToken, instanceName)
					if err := wsClient.SendText(r.Context(), phone, confMsg); err != nil {
						slog.Error("failed to send whatsapp confirmation message", "phone", phone, "error", err)
					}

					// Download and attach media if saved in the session
					if session.MediaURL != "" {
						go s.downloadAndAttachMedia(context.Background(), newTicket.ID, session.MediaURL, session.InitialMessage, "attachment", session.MimeType)
					}
					// Also download and attach media if present in the current option message
					if mediaURL != "" {
						go s.downloadAndAttachMedia(context.Background(), newTicket.ID, mediaURL, bodyText, defaultFileName, mimeType)
					}

					// Delete session
					_ = s.tickets.DeleteWhatsAppSession(r.Context(), phone)

					s.sseBroker.Broadcast(newTicket.ID, "refresh", "")
					JSON(w, http.StatusCreated, newTicket)
					return
				} else {
					// Client typed an invalid option: resend the welcome menu message
					apiURL, apiToken, instanceName := s.adminSvc.WhatsAppConfig(r.Context())
					wsClient := whatsapp.NewClient(apiURL, apiToken, instanceName)
					
					invalidMsg := "Opção inválida. Por favor, selecione uma das opções do menu:\n\n" + welcomeMessage
					if err := wsClient.SendText(r.Context(), phone, invalidMsg); err != nil {
						slog.Error("failed to send whatsapp welcome message on invalid input", "phone", phone, "error", err)
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
			if mediaURL != "" {
				go s.downloadAndAttachMedia(context.Background(), newTicket.ID, mediaURL, bodyText, defaultFileName, mimeType)
			}

			s.sseBroker.Broadcast(newTicket.ID, "refresh", "")
			JSON(w, http.StatusCreated, newTicket)
			return
		}
	}
}

func (s *Server) downloadAndAttachMedia(ctx context.Context, ticketID uuid.UUID, mediaURL, caption, defaultName, mimeType string) {
	if mediaURL == "" {
		return
	}

	// 1. Download file
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL, nil)
	if err != nil {
		slog.Error("failed to create media download request", "url", mediaURL, "error", err)
		return
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Error("failed to download media from Evolution API", "url", mediaURL, "error", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		slog.Error("Evolution API media download returned non-200", "status", resp.StatusCode, "url", mediaURL)
		return
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		slog.Error("failed to read downloaded media body", "error", err)
		return
	}

	// 2. Determine file name
	fileName := defaultName
	if lastSlash := strings.LastIndex(mediaURL, "/"); lastSlash != -1 {
		potentialName := mediaURL[lastSlash+1:]
		if strings.Contains(potentialName, ".") && len(potentialName) < 100 {
			fileName = potentialName
		}
	}

	ext := strings.ToLower(filepath.Ext(fileName))
	if ext == "" {
		switch mimeType {
		case "image/jpeg":
			ext = ".jpg"
		case "image/png":
			ext = ".png"
		case "application/pdf":
			ext = ".pdf"
		default:
			ext = ".bin"
		}
		fileName += ext
	}

	// 3. Write to disk
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
