// Package notify implements the notification.Dispatcher interface for email
// and webhook delivery.
package notify

import (
	"bytes"
	"context"
	"crypto/tls"
	"embed"
	"encoding/json"
	"fmt"
	"mime/quotedprintable"
	"net/http"
	"net/mail"
	"net/smtp"
	"strings"
	"text/template"
	"time"

	"github.com/publiciallc/go-help-desk/backend/internal/config"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/admin"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/notification"
)

//go:embed templates/*.tmpl
var templateFS embed.FS

var smtpSendMail = smtp.SendMail

// EmailDispatcher sends email notifications on ticket events.
type EmailDispatcher struct {
	cfg       *config.Config
	adminSvc  *admin.Service
	templates *template.Template
}

// NewEmailDispatcher loads templates and returns an EmailDispatcher.
func NewEmailDispatcher(cfg *config.Config, adminSvc *admin.Service) (*EmailDispatcher, error) {
	tmpl, err := template.ParseFS(templateFS, "templates/*.tmpl")
	if err != nil {
		return nil, fmt.Errorf("parsing email templates: %w", err)
	}
	return &EmailDispatcher{cfg: cfg, adminSvc: adminSvc, templates: tmpl}, nil
}

// sanitizeHeader strips CR and LF so user-controlled values interpolated into
// email headers cannot inject additional headers.
func sanitizeHeader(s string) string {
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	return strings.TrimSpace(s)
}

// sanitizePayload returns a shallow copy of payload where all string values are
// header/body-safe normalized text (CR/LF removed, trimmed).
func sanitizePayload(payload map[string]any) map[string]any {
	if payload == nil {
		return nil
	}
	out := make(map[string]any, len(payload))
	for k, v := range payload {
		if s, ok := v.(string); ok {
			out[k] = sanitizeHeader(s)
			continue
		}
		out[k] = v
	}
	return out
}

// EmailEnabled returns true when SMTP/Resend is configured via DB settings or fallback variables.
func (d *EmailDispatcher) EmailEnabled(ctx context.Context) bool {
	if d.adminSvc == nil {
		return d.cfg.EmailEnabled()
	}
	provider := d.adminSvc.EmailProvider(ctx)
	if provider == "disabled" {
		return false
	}
	if provider == "smtp" {
		host, _, _, _, from := d.adminSvc.SMTPConfig(ctx)
		return host != "" && from != ""
	}
	if provider == "resend" {
		apiKey, from := d.adminSvc.ResendConfig(ctx)
		return apiKey != "" && from != ""
	}
	return d.cfg.EmailEnabled()
}

// Dispatch sends an email for supported event types. Unsupported events are
// silently ignored — the dispatcher never returns an error to the caller.
func (d *EmailDispatcher) Dispatch(ctx context.Context, event notification.Event) error {
	if !d.EmailEnabled(ctx) {
		return nil
	}

	templateName, subject, to, data, ok := d.eventToEmail(event)
	if !ok || to == "" || strings.HasSuffix(to, "@whatsapp.invalid") {
		return nil
	}

	var buf bytes.Buffer
	if err := d.templates.ExecuteTemplate(&buf, templateName, data); err != nil {
		return nil // template failure is non-fatal
	}

	return d.send(ctx, to, subject, buf.Bytes())
}

func (d *EmailDispatcher) eventToEmail(event notification.Event) (templateName, subject, to string, data any, ok bool) {
	payload := sanitizePayload(event.Payload)
	switch event.Type {
	case notification.EventTicketCreated:
		// Prefer the explicit recipient (registered reporter or guest) resolved by
		// the caller; fall back to the guest email for older payloads.
		recipient, _ := payload["reporter_email"].(string)
		if recipient == "" {
			recipient, _ = payload["guest_email"].(string)
		}
		if recipient == "" {
			recipient, _ = payload["GuestEmail"].(string)
		}
		tracking, _ := payload["TrackingNumber"].(string)
		subj, _ := payload["Subject"].(string)
		if recipient == "" {
			return "", "", "", nil, false
		}
		return "ticket_created.tmpl",
			fmt.Sprintf("[%s] %s", tracking, subj),
			recipient, payload, true
	case notification.EventTicketReplied:
		reporterEmail, _ := payload["reporter_email"].(string)
		if reporterEmail == "" {
			reporterEmail, _ = payload["ReporterEmail"].(string)
		}
		tracking, _ := payload["TrackingNumber"].(string)
		subj, _ := payload["Subject"].(string)
		return "ticket_replied.tmpl",
			fmt.Sprintf("Re: [%s] %s", tracking, subj),
			reporterEmail, payload, true
	}
	return "", "", "", nil, false
}

// SendVerificationEmail sends a transactional email containing the account
// verification link. It implements registration.Mailer.
func (d *EmailDispatcher) SendVerificationEmail(to, token, baseURL string) error {
	ctx := context.Background()
	if !d.EmailEnabled(ctx) {
		return nil
	}
	verifyURL := baseURL + "/verify-email?token=" + token
	var buf bytes.Buffer
	if err := d.templates.ExecuteTemplate(&buf, "email_verification.tmpl", map[string]string{
		"VerifyURL": verifyURL,
	}); err != nil {
		return fmt.Errorf("rendering verification email: %w", err)
	}
	return d.send(ctx, to, "Verify your email address", buf.Bytes())
}

// send builds a MIME message and hands it to the configured email provider (SMTP or Resend)
// in the background. Address parsing is performed synchronously to report immediate formatting errors.
func (d *EmailDispatcher) send(ctx context.Context, to, subject string, body []byte) error {
	toAddr, err := mail.ParseAddress(to)
	if err != nil {
		return fmt.Errorf("invalid recipient address: %w", err)
	}

	provider := "disabled"
	if d.adminSvc != nil {
		provider = d.adminSvc.EmailProvider(ctx)
	}

	// Default fallback to environment variables SMTP if not explicitly disabled or configured in DB
	if provider == "disabled" && d.cfg.EmailEnabled() {
		provider = "smtp"
	}

	var apiKey, from string
	var host, user, password string
	var port int

	if provider == "resend" {
		apiKey, from = d.adminSvc.ResendConfig(ctx)
	} else if provider == "smtp" {
		if d.adminSvc != nil && d.adminSvc.EmailProvider(ctx) == "smtp" {
			host, port, user, password, from = d.adminSvc.SMTPConfig(ctx)
		} else {
			host = d.cfg.SMTPHost
			port = d.cfg.SMTPPort
			user = d.cfg.SMTPUser
			password = d.cfg.SMTPPassword
			from = d.cfg.SMTPFrom
		}
	}

	fromAddr, err := mail.ParseAddress(from)
	if err != nil {
		return fmt.Errorf("invalid sender address: %w", err)
	}

	var msg bytes.Buffer
	fmt.Fprintf(&msg, "From: %s\r\n", fromAddr.String())
	fmt.Fprintf(&msg, "To: %s\r\n", toAddr.String())
	fmt.Fprintf(&msg, "Subject: %s\r\n", sanitizeHeader(subject))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	msg.WriteString("Content-Transfer-Encoding: quoted-printable\r\n")
	msg.WriteString("\r\n")

	qp := quotedprintable.NewWriter(&msg)
	if _, err := qp.Write(body); err != nil {
		return fmt.Errorf("encoding body: %w", err)
	}
	if err := qp.Close(); err != nil {
		return fmt.Errorf("closing encoder: %w", err)
	}

	msgBytes := msg.Bytes()

	// Perform the actual network operation asynchronously to avoid blocking HTTP request threads
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		var sendErr error
		if provider == "resend" {
			sendErr = d.sendViaResend(bgCtx, apiKey, from, toAddr.Address, subject, body)
		} else if provider == "smtp" {
			addr := fmt.Sprintf("%s:%d", host, port)
			var auth smtp.Auth
			if user != "" {
				auth = smtp.PlainAuth("", user, password, host)
			}
			
			if port == 465 {
				sendErr = sendMailSSL(addr, auth, fromAddr.Address, []string{toAddr.Address}, msgBytes, host)
			} else {
				sendErr = smtpSendMail(addr, auth, fromAddr.Address, []string{toAddr.Address}, msgBytes)
			}
		}

		if sendErr != nil {
			// Log background error to help debugging, but do not crash the goroutine
			fmt.Printf("Background email send error: %v\n", sendErr)
		}
	}()

	return nil
}

// sendViaResend delivers an email using the Resend HTTP API.
func (d *EmailDispatcher) sendViaResend(ctx context.Context, apiKey, from, to, subject string, body []byte) error {
	type ResendPayload struct {
		From    string   `json:"from"`
		To      []string `json:"to"`
		Subject string   `json:"subject"`
		Text    string   `json:"text"`
	}

	payload := ResendPayload{
		From:    from,
		To:      []string{to},
		Subject: subject,
		Text:    string(body),
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshaling resend payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewBuffer(payloadBytes))
	if err != nil {
		return fmt.Errorf("creating resend request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("calling resend api: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errResp struct {
			Message string `json:"message"`
			Name    string `json:"name"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		return fmt.Errorf("resend api error (status %d): %s (%s)", resp.StatusCode, errResp.Message, errResp.Name)
	}

	return nil
}

// SendCSATFeedbackEmail envia um e-mail estruturado de coaching da IA para o atendente.
func (d *EmailDispatcher) SendCSATFeedbackEmail(to, agentName, sentimentSummary string, coachingTips []string) error {
	ctx := context.Background()
	if !d.EmailEnabled(ctx) {
		return nil
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Olá %s,\n\nAqui está um resumo de feedback de satisfação do cliente (CSAT) e dicas de treinamento geradas pela nossa IA para o seu atendimento:\n\n", agentName))
	sb.WriteString("=== Sentimento dos Clientes ===\n")
	sb.WriteString(sentimentSummary)
	sb.WriteString("\n\n=== Recomendações Práticas de Treinamento ===\n")
	for i, tip := range coachingTips {
		sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, tip))
	}
	sb.WriteString("\nContinue o bom trabalho!\n\nAtenciosamente,\nAdministração")

	return d.send(ctx, to, "Feedback de Atendimento & Coaching IA", []byte(sb.String()))
}

// sendMailSSL connects to an SMTP server using implicit SSL/TLS (commonly port 465)
// and delivers the email.
func sendMailSSL(addr string, auth smtp.Auth, from string, to []string, msg []byte, host string) error {
	tlsconfig := &tls.Config{
		ServerName: host,
	}

	conn, err := tls.Dial("tcp", addr, tlsconfig)
	if err != nil {
		return fmt.Errorf("tls dial error: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("smtp client error: %w", err)
	}
	defer client.Close()

	if auth != nil {
		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth error: %w", err)
		}
	}

	if err = client.Mail(from); err != nil {
		return fmt.Errorf("smtp mail from error: %w", err)
	}

	for _, rcpt := range to {
		if err = client.Rcpt(rcpt); err != nil {
			return fmt.Errorf("smtp rcpt to error: %w", err)
		}
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data error: %w", err)
	}

	if _, err = w.Write(msg); err != nil {
		return fmt.Errorf("smtp write error: %w", err)
	}

	if err = w.Close(); err != nil {
		return fmt.Errorf("smtp data close error: %w", err)
	}

	return client.Quit()
}
