package whatsapp

import (
	"bytes"
	"context"
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

	var res struct {
		Instance struct {
			State string `json:"state"`
		} `json:"instance"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", fmt.Errorf("decoding connectionState response: %w", err)
	}

	return res.Instance.State, nil
}

// GetQRCode fetches the Base64 QR Code string to pair the device.
func (c *Client) GetQRCode(ctx context.Context) (string, error) {
	if c.apiURL == "" || c.apiToken == "" || c.instanceName == "" {
		return "", fmt.Errorf("whatsapp client is not fully configured")
	}

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

	var res struct {
		Code string `json:"code"` // Base64 image payload (e.g. data:image/png;base64,...)
	}

	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", fmt.Errorf("decoding connect response: %w", err)
	}

	return res.Code, nil
}
