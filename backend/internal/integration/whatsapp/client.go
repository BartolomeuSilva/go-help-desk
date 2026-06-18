package whatsapp

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client handles communication with the Evolution API.
type Client struct {
	apiURL       string
	apiToken     string
	instanceName string
	httpClient   *http.Client
}

// NewClient creates a new Client instance.
func NewClient(apiURL, apiToken, instanceName string) *Client {
	// Normalize API URL to not have a trailing slash
	apiURL = strings.TrimSuffix(apiURL, "/")

	return &Client{
		apiURL:       apiURL,
		apiToken:     apiToken,
		instanceName: instanceName,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// SendText sends a plain text message to a specific number.
func (c *Client) SendText(ctx context.Context, number, text string) error {
	if c.apiURL == "" || c.apiToken == "" || c.instanceName == "" {
		return fmt.Errorf("whatsapp client is not fully configured")
	}

	// Normalize phone number (remove any leading '+')
	number = strings.TrimPrefix(number, "+")

	url := fmt.Sprintf("%s/message/sendText/%s", c.apiURL, c.instanceName)

	payload := map[string]any{
		"number": number,
		"text":   text,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshaling sendText payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return fmt.Errorf("creating sendText request: %w", err)
	}

	req.Header.Set("apikey", c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("calling sendText API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("sendText API returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// SendMedia sends an image or document from a URL to a specific number.
func (c *Client) SendMedia(ctx context.Context, number, mediaURL, fileName, caption string) error {
	if c.apiURL == "" || c.apiToken == "" || c.instanceName == "" {
		return fmt.Errorf("whatsapp client is not fully configured")
	}

	number = strings.TrimPrefix(number, "+")
	url := fmt.Sprintf("%s/message/sendMedia/%s", c.apiURL, c.instanceName)

	// Detect if it is an image or document by file extension
	mediaType := "document"
	lowerName := strings.ToLower(fileName)
	if strings.HasSuffix(lowerName, ".png") || strings.HasSuffix(lowerName, ".jpg") || strings.HasSuffix(lowerName, ".jpeg") || strings.HasSuffix(lowerName, ".gif") {
		mediaType = "image"
	}

	payload := map[string]any{
		"number": number,
		"mediaMessage": map[string]any{
			"mediatype": mediaType,
			"media":     mediaURL,
			"fileName":  fileName,
			"caption":   caption,
		},
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshaling sendMedia payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return fmt.Errorf("creating sendMedia request: %w", err)
	}

	req.Header.Set("apikey", c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("calling sendMedia API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("sendMedia API returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// GetMediaBase64 fetches and decrypts a received media message from the
// Evolution server, returning the raw file bytes. WhatsApp media URLs in the
// webhook payload are end-to-end encrypted and cannot be downloaded directly;
// this endpoint returns the decoded content for a given message ID.
func (c *Client) GetMediaBase64(ctx context.Context, messageID string) (data []byte, mimeType, fileName string, err error) {
	if c.apiURL == "" || c.apiToken == "" || c.instanceName == "" {
		return nil, "", "", fmt.Errorf("whatsapp client is not fully configured")
	}
	if messageID == "" {
		return nil, "", "", fmt.Errorf("message id is required")
	}

	url := fmt.Sprintf("%s/chat/getBase64FromMediaMessage/%s", c.apiURL, c.instanceName)
	payload := map[string]any{
		"message":      map[string]any{"key": map[string]any{"id": messageID}},
		"convertToMp4": false,
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, "", "", fmt.Errorf("marshaling getBase64 payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return nil, "", "", fmt.Errorf("creating getBase64 request: %w", err)
	}
	req.Header.Set("apikey", c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, "", "", fmt.Errorf("calling getBase64 API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, "", "", fmt.Errorf("getBase64 API returned status %d: %s", resp.StatusCode, string(body))
	}

	var res struct {
		Base64   string `json:"base64"`
		FileName string `json:"fileName"`
		MimeType string `json:"mimetype"`
		MimeAlt  string `json:"mimeType"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, "", "", fmt.Errorf("decoding getBase64 response: %w", err)
	}
	if res.Base64 == "" {
		return nil, "", "", fmt.Errorf("getBase64 API returned empty media")
	}
	data, err = base64.StdEncoding.DecodeString(res.Base64)
	if err != nil {
		return nil, "", "", fmt.Errorf("decoding media base64: %w", err)
	}
	return data, firstNonEmpty(res.MimeType, res.MimeAlt), res.FileName, nil
}

// SendMediaBase64 sends a file to a number, embedding it as base64 (Evolution v2
// flat payload) so the Evolution server doesn't need to fetch an authenticated
// URL from this app.
func (c *Client) SendMediaBase64(ctx context.Context, number string, data []byte, mimeType, fileName, caption string) error {
	if c.apiURL == "" || c.apiToken == "" || c.instanceName == "" {
		return fmt.Errorf("whatsapp client is not fully configured")
	}

	number = strings.TrimPrefix(number, "+")
	url := fmt.Sprintf("%s/message/sendMedia/%s", c.apiURL, c.instanceName)

	payload := map[string]any{
		"number":    number,
		"mediatype": mediaTypeFor(mimeType, fileName),
		"mimetype":  mimeType,
		"media":     base64.StdEncoding.EncodeToString(data),
		"fileName":  fileName,
		"caption":   caption,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshaling sendMedia payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return fmt.Errorf("creating sendMedia request: %w", err)
	}
	req.Header.Set("apikey", c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("calling sendMedia API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("sendMedia API returned status %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

// mediaTypeFor maps a MIME type (with filename fallback) to the Evolution
// media category: "image", "video", "audio" or "document".
func mediaTypeFor(mimeType, fileName string) string {
	m := strings.ToLower(mimeType)
	switch {
	case strings.HasPrefix(m, "image/"):
		return "image"
	case strings.HasPrefix(m, "video/"):
		return "video"
	case strings.HasPrefix(m, "audio/"):
		return "audio"
	}
	f := strings.ToLower(fileName)
	switch {
	case hasAnySuffix(f, ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"):
		return "image"
	case hasAnySuffix(f, ".mp4", ".mov", ".avi", ".mkv"):
		return "video"
	case hasAnySuffix(f, ".mp3", ".ogg", ".oga", ".m4a", ".wav"):
		return "audio"
	}
	return "document"
}

func hasAnySuffix(s string, suffixes ...string) bool {
	for _, suf := range suffixes {
		if strings.HasSuffix(s, suf) {
			return true
		}
	}
	return false
}

// GetConnectionStatus checks if the WhatsApp instance is connected.
// Returns status: "open", "close", "connecting", or error.
func (c *Client) GetConnectionStatus(ctx context.Context) (string, error) {
	if c.apiURL == "" || c.apiToken == "" || c.instanceName == "" {
		return "disconnected", nil
	}

	url := fmt.Sprintf("%s/instance/connectionState/%s", c.apiURL, c.instanceName)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("creating connectionState request: %w", err)
	}

	req.Header.Set("apikey", c.apiToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("calling connectionState API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// If instance doesn't exist yet, it's not connected
		if resp.StatusCode == http.StatusNotFound {
			return "disconnected", nil
		}
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("connectionState API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse every known shape: the state may live under "instance.state",
	// "instance.status", "instance.connectionStatus", or at the top level,
	// depending on the Evolution API version. Reading only one of these caused
	// a connected instance to look disconnected in the app.
	var res struct {
		State    string `json:"state"`
		Status   string `json:"status"`
		Instance *struct {
			State            string `json:"state"`
			Status           string `json:"status"`
			ConnectionStatus string `json:"connectionStatus"`
		} `json:"instance"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", fmt.Errorf("decoding connectionState response: %w", err)
	}

	state := firstNonEmpty(res.State, res.Status)
	if res.Instance != nil {
		state = firstNonEmpty(
			res.Instance.State,
			res.Instance.Status,
			res.Instance.ConnectionStatus,
			state,
		)
	}
	return state, nil
}

// firstNonEmpty returns the first non-empty string from the arguments.
func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

// ConnectionInfo holds status and number for the WhatsApp instance connection.
type ConnectionInfo struct {
	State  string `json:"state"`
	Number string `json:"number"`
}

// GetConnectionInfo retrieves both connection state and the registered phone number.
func (c *Client) GetConnectionInfo(ctx context.Context) (ConnectionInfo, error) {
	var info ConnectionInfo
	if c.apiURL == "" || c.apiToken == "" || c.instanceName == "" {
		info.State = "disconnected"
		return info, nil
	}

	state, err := c.GetConnectionStatus(ctx)
	if err != nil {
		return info, err
	}
	info.State = state

	if state == "open" {
		url := fmt.Sprintf("%s/instance/fetchInstances", c.apiURL)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return info, fmt.Errorf("creating fetchInstances request: %w", err)
		}
		req.Header.Set("apikey", c.apiToken)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return info, fmt.Errorf("calling fetchInstances API: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			type rawInstance struct {
				Name     string `json:"name"`
				Number   string `json:"number"`
				Instance *struct {
					InstanceName string `json:"instanceName"`
				} `json:"instance"`
				Owner string `json:"owner"`
				Phone *struct {
					User string `json:"user"`
				} `json:"phone"`
			}
			var instances []rawInstance
			if err := json.NewDecoder(resp.Body).Decode(&instances); err == nil {
				for _, inst := range instances {
					name := inst.Name
					if name == "" && inst.Instance != nil {
						name = inst.Instance.InstanceName
					}
					if name == c.instanceName {
						number := inst.Number
						if number == "" && inst.Phone != nil {
							number = inst.Phone.User
						}
						if number == "" && inst.Owner != "" {
							number = strings.Split(inst.Owner, "@")[0]
						}
						info.Number = number
						break
					}
				}
			}
		}
	}

	return info, nil
}

// GetQRCode fetches the Base64 QR Code string to pair the device.
//
// Evolution API generates the QR asynchronously: right after an instance is
// (re)connected the response can come back without a QR yet. It also varies the
// response shape across versions (the base64/code may sit under "qrcode" or at
// the top level). We therefore parse every known shape and retry a few times
// until a QR shows up, which makes pairing reliable instead of intermittent.
func (c *Client) GetQRCode(ctx context.Context) (string, error) {
	if c.apiURL == "" || c.apiToken == "" || c.instanceName == "" {
		return "", fmt.Errorf("whatsapp client is not fully configured")
	}

	const maxAttempts = 5
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(1500 * time.Millisecond):
			}
		}

		code, err := c.fetchQRCode(ctx)
		if err != nil {
			return "", err
		}
		if code != "" {
			return code, nil
		}
	}

	return "", nil
}

// fetchQRCode performs a single call to the connect endpoint and extracts the
// QR payload from whichever shape the API returned (empty string if none yet).
func (c *Client) fetchQRCode(ctx context.Context) (string, error) {
	url := fmt.Sprintf("%s/instance/connect/%s", c.apiURL, c.instanceName)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("creating connect request: %w", err)
	}

	req.Header.Set("apikey", c.apiToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("calling connect API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("connect API returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse all known response shapes: base64/code may be nested under "qrcode"
	// or live at the top level depending on the Evolution API version.
	var res struct {
		Base64 string `json:"base64"`
		Code   string `json:"code"`
		QRCode *struct {
			Base64 string `json:"base64"`
			Code   string `json:"code"`
		} `json:"qrcode"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", fmt.Errorf("decoding connect response: %w", err)
	}

	if res.QRCode != nil {
		if res.QRCode.Base64 != "" {
			return res.QRCode.Base64, nil
		}
		if res.QRCode.Code != "" {
			return res.QRCode.Code, nil
		}
	}
	if res.Base64 != "" {
		return res.Base64, nil
	}
	return res.Code, nil
}

// SetWebhook registers the given URL on the Evolution instance so that inbound
// messages (messages.upsert) are delivered to the help desk. Pairing a device
// via QR only connects it; without this call the instance never forwards
// messages and the attendance flow never starts. Uses the Evolution v2 payload
// shape (nested "webhook" object, uppercase event names).
func (c *Client) SetWebhook(ctx context.Context, webhookURL string) error {
	if c.apiURL == "" || c.apiToken == "" || c.instanceName == "" {
		return fmt.Errorf("whatsapp client is not fully configured")
	}

	url := fmt.Sprintf("%s/webhook/set/%s", c.apiURL, c.instanceName)

	payload := map[string]any{
		"webhook": map[string]any{
			"enabled":  true,
			"url":      webhookURL,
			"byEvents": false,
			"base64":   false,
			"events":   []string{"MESSAGES_UPSERT"},
		},
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshaling setWebhook payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return fmt.Errorf("creating setWebhook request: %w", err)
	}

	req.Header.Set("apikey", c.apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("calling setWebhook API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("setWebhook API returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// Logout disconnects the paired device from the WhatsApp instance, so a new
// number can be paired by scanning a fresh QR Code.
func (c *Client) Logout(ctx context.Context) error {
	if c.apiURL == "" || c.apiToken == "" || c.instanceName == "" {
		return fmt.Errorf("whatsapp client is not fully configured")
	}

	url := fmt.Sprintf("%s/instance/logout/%s", c.apiURL, c.instanceName)

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return fmt.Errorf("creating logout request: %w", err)
	}

	req.Header.Set("apikey", c.apiToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("calling logout API: %w", err)
	}
	defer resp.Body.Close()

	// A not-yet-connected instance returns 4xx on logout; treat that as success
	// since the desired end state (no device paired) already holds.
	if resp.StatusCode == http.StatusNotFound {
		return nil
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("logout API returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
