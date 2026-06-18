package notify

import (
	"context"
	"fmt"
	"net/smtp"
	"strings"
	"testing"

	"github.com/publiciallc/go-help-desk/backend/internal/domain/admin"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/notification"
)

// mapStore is an in-memory admin.Store for tests.
type mapStore map[string][]byte

func (m mapStore) Get(_ context.Context, key string) ([]byte, error) {
	v, ok := m[key]
	if !ok {
		return nil, fmt.Errorf("setting %q not found", key)
	}
	return v, nil
}
func (m mapStore) Set(_ context.Context, key string, value []byte) error {
	m[key] = value
	return nil
}
func (m mapStore) List(_ context.Context) (map[string][]byte, error) { return m, nil }

// smtpAdminSvc returns an admin.Service configured for SMTP with the given
// sender address, backed by an in-memory store.
func smtpAdminSvc(t *testing.T, from string) *admin.Service {
	t.Helper()
	svc := admin.NewService(mapStore{})
	ctx := context.Background()
	for key, val := range map[string]string{
		admin.KeyEmailProvider: "smtp",
		admin.KeyEmailSMTPHost: "localhost",
		admin.KeyEmailSMTPFrom: from,
	} {
		if err := svc.SetString(ctx, key, val); err != nil {
			t.Fatalf("seeding setting %q: %v", key, err)
		}
	}
	return svc
}

func TestSendRejectsHeaderInjection(t *testing.T) {
	// Intercept and mock smtp.SendMail to prevent dialing a real server during tests
	oldSendMail := smtpSendMail
	defer func() { smtpSendMail = oldSendMail }()
	smtpSendMail = func(addr string, a smtp.Auth, from string, to []string, msg []byte) error {
		return nil
	}

	cases := []struct {
		name      string
		to        string
		from      string
		wantErr   string
		wantError bool
	}{
		{
			name:      "CRLF in recipient",
			to:        "victim@example.com\r\nBcc: attacker@evil.com",
			from:      "noreply@example.com",
			wantErr:   "invalid recipient address",
			wantError: true,
		},
		{
			name:      "LF in recipient",
			to:        "victim@example.com\nBcc: attacker@evil.com",
			from:      "noreply@example.com",
			wantErr:   "invalid recipient address",
			wantError: true,
		},
		{
			name:      "malformed recipient",
			to:        "not-an-email",
			from:      "noreply@example.com",
			wantErr:   "invalid recipient address",
			wantError: true,
		},
		{
			name:      "CRLF in sender config",
			to:        "user@example.com",
			from:      "noreply@example.com\r\nBcc: attacker@evil.com",
			wantErr:   "invalid sender address",
			wantError: true,
		},
		{
			name:      "valid recipient and sender",
			to:        "user@example.com",
			from:      "noreply@example.com",
			wantErr:   "",
			wantError: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			d := &EmailDispatcher{adminSvc: smtpAdminSvc(t, tc.from)}
			err := d.send(context.Background(), tc.to, "test subject", []byte("body"))
			if !tc.wantError {
				if err != nil {
					t.Fatalf("expected no error for valid addresses, got %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.wantErr)
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expected error to contain %q, got %q", tc.wantErr, err.Error())
			}
		})
	}
}

func TestBuildMessageIncludesDateAndMessageID(t *testing.T) {
	msg, err := buildMessage("Support <support@example.com>", "user@example.org", "Re: [HD-1] Hello", []byte("a reply"))
	if err != nil {
		t.Fatalf("buildMessage returned error: %v", err)
	}
	headers := string(msg)

	if !strings.Contains(headers, "\r\nDate: ") && !strings.HasPrefix(headers, "Date: ") {
		t.Errorf("message missing Date header:\n%s", headers)
	}
	// Message-ID must be present and scoped to the sender's domain so receiving
	// servers accept it; its absence is a strong spam signal.
	if !strings.Contains(headers, "Message-ID: <") {
		t.Errorf("message missing Message-ID header:\n%s", headers)
	}
	if !strings.Contains(headers, "@example.com>") {
		t.Errorf("Message-ID not scoped to sender domain:\n%s", headers)
	}
	if !strings.Contains(headers, "From: ") || !strings.Contains(headers, "Subject: Re: [HD-1] Hello") {
		t.Errorf("message missing core headers:\n%s", headers)
	}
}

func TestBuildMessageRejectsBadAddresses(t *testing.T) {
	if _, err := buildMessage("not-an-address", "user@example.org", "s", []byte("b")); err == nil {
		t.Errorf("expected error for invalid sender address")
	}
	if _, err := buildMessage("support@example.com", "bad", "s", []byte("b")); err == nil {
		t.Errorf("expected error for invalid recipient address")
	}
}

func TestSanitizeHeaderStripsControlChars(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"clean subject", "clean subject"},
		{"with\r\nCRLF", "with  CRLF"},
		{"with\nLF only", "with LF only"},
		{"with\rCR only", "with CR only"},
		{"Bcc: attacker@evil.com\r\n", "Bcc: attacker@evil.com"},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got := sanitizeHeader(tc.in)
			if got != tc.want {
				t.Errorf("sanitizeHeader(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestEventToEmailTicketCreatedAcceptsPascalCaseGuestEmail(t *testing.T) {
	d := &EmailDispatcher{}
	templateName, subject, to, data, ok := d.eventToEmail(notification.Event{
		Type: notification.EventTicketCreated,
		Payload: map[string]any{
			"GuestEmail":     "guest@example.com",
			"TrackingNumber": "HD-123",
			"Subject":        "Need help",
		},
	})

	if !ok {
		t.Fatalf("expected event to map to email")
	}
	if templateName != "ticket_created.tmpl" {
		t.Fatalf("unexpected template: %q", templateName)
	}
	if subject != "[HD-123] Need help" {
		t.Fatalf("unexpected subject: %q", subject)
	}
	if to != "guest@example.com" {
		t.Fatalf("unexpected recipient: %q", to)
	}
	if data == nil {
		t.Fatalf("expected template data")
	}
}

func TestEventToEmailTicketRepliedAcceptsPascalCaseReporterEmail(t *testing.T) {
	d := &EmailDispatcher{}
	templateName, subject, to, data, ok := d.eventToEmail(notification.Event{
		Type: notification.EventTicketReplied,
		Payload: map[string]any{
			"ReporterEmail":  "reporter@example.com",
			"TrackingNumber": "HD-456",
			"Subject":        "Update",
			"ReplyBody":      "some reply text",
		},
	})

	if !ok {
		t.Fatalf("expected event to map to email")
	}
	if templateName != "ticket_replied.tmpl" {
		t.Fatalf("unexpected template: %q", templateName)
	}
	if subject != "Re: [HD-456] Update" {
		t.Fatalf("unexpected subject: %q", subject)
	}
	if to != "reporter@example.com" {
		t.Fatalf("unexpected recipient: %q", to)
	}
	if data == nil {
		t.Fatalf("expected template data")
	}
}

func TestEventToEmailTicketRepliedEmptyBodyDoesNotMap(t *testing.T) {
	d := &EmailDispatcher{}
	_, _, _, _, ok := d.eventToEmail(notification.Event{
		Type: notification.EventTicketReplied,
		Payload: map[string]any{
			"ReporterEmail":  "reporter@example.com",
			"TrackingNumber": "HD-000",
			"Subject":        "Attachment only",
			"ReplyBody":      "",
		},
	})
	if ok {
		t.Fatalf("attachment-only reply (empty body) must not produce an email")
	}
}

func TestEventToEmailTicketRepliedMissingReporterEmailStillMaps(t *testing.T) {
	d := &EmailDispatcher{}
	templateName, subject, to, data, ok := d.eventToEmail(notification.Event{
		Type: notification.EventTicketReplied,
		Payload: map[string]any{
			"TrackingNumber": "HD-789",
			"Subject":        "No recipient",
			"ReplyBody":      "some reply text",
		},
	})

	if !ok {
		t.Fatalf("expected event to map to email even when ReporterEmail is missing")
	}
	if templateName != "ticket_replied.tmpl" {
		t.Fatalf("unexpected template: %q", templateName)
	}
	if subject != "Re: [HD-789] No recipient" {
		t.Fatalf("unexpected subject: %q", subject)
	}
	if to != "" {
		t.Fatalf("expected empty recipient when ReporterEmail is missing, got: %q", to)
	}
	if data == nil {
		t.Fatalf("expected template data")
	}
}
