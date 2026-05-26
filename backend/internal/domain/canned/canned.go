package canned

import (
	"time"

	"github.com/google/uuid"
)

// CannedResponse represents a pre-defined text template that support staff
// can quickly insert when replying to tickets.
type CannedResponse struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
