package ticketstore

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/publiciallc/go-help-desk/backend/internal/dbgen"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/ticket"
)

// CreateWhatsAppSession registers a new temporary triage session.
func (s *Store) CreateWhatsAppSession(ctx context.Context, phone string, initialMessage string, mediaURL string, mimeType string) error {
	params := dbgen.CreateWhatsAppSessionParams{
		Phone:          phone,
		InitialMessage: initialMessage,
		MediaUrl:       mediaURL,
		MimeType:       mimeType,
	}
	if err := s.q.CreateWhatsAppSession(ctx, params); err != nil {
		return fmt.Errorf("creating whatsapp session: %w", err)
	}
	return nil
}

// GetWhatsAppSession retrieves a temporary session.
func (s *Store) GetWhatsAppSession(ctx context.Context, phone string) (ticket.WhatsAppSession, error) {
	row, err := s.q.GetWhatsAppSession(ctx, phone)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ticket.WhatsAppSession{}, fmt.Errorf("%w: whatsapp session not found for phone %s", ticket.ErrNotFound, phone)
		}
		return ticket.WhatsAppSession{}, fmt.Errorf("getting whatsapp session: %w", err)
	}
	return ticket.WhatsAppSession{
		Phone:          phone,
		InitialMessage: row.InitialMessage,
		MediaURL:       row.MediaUrl,
		MimeType:       row.MimeType,
	}, nil
}

// DeleteWhatsAppSession removes a temporary triage session.
func (s *Store) DeleteWhatsAppSession(ctx context.Context, phone string) error {
	if err := s.q.DeleteWhatsAppSession(ctx, phone); err != nil {
		return fmt.Errorf("deleting whatsapp session: %w", err)
	}
	return nil
}
