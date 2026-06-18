package whatsapp

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestGetQRCode(t *testing.T) {
	const wantCode = "2@abc123"

	cases := []struct {
		name string
		body string
	}{
		{
			name: "nested qrcode.base64",
			body: `{"qrcode":{"base64":"2@abc123"}}`,
		},
		{
			name: "nested qrcode.code",
			body: `{"qrcode":{"code":"2@abc123"}}`,
		},
		{
			name: "top-level base64",
			body: `{"base64":"2@abc123"}`,
		},
		{
			name: "top-level code",
			body: `{"code":"2@abc123"}`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Write([]byte(tc.body))
			}))
			defer srv.Close()

			c := NewClient(srv.URL, "token", "inst")
			got, err := c.GetQRCode(context.Background())
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != wantCode {
				t.Errorf("got %q, want %q", got, wantCode)
			}
		})
	}
}

func TestGetQRCodeRetriesUntilQRReady(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// First two calls return an empty body (QR not generated yet),
		// then the QR appears — mirroring Evolution's async behavior.
		if atomic.AddInt32(&calls, 1) < 3 {
			w.Write([]byte(`{}`))
			return
		}
		w.Write([]byte(`{"qrcode":{"base64":"2@ready"}}`))
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "token", "inst")
	got, err := c.GetQRCode(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "2@ready" {
		t.Errorf("got %q, want %q", got, "2@ready")
	}
	if calls < 3 {
		t.Errorf("expected at least 3 attempts, got %d", calls)
	}
}

func TestGetQRCodeUnconfigured(t *testing.T) {
	c := NewClient("", "", "")
	if _, err := c.GetQRCode(context.Background()); err == nil {
		t.Fatal("expected error for unconfigured client")
	}
}

func TestGetConnectionStatus(t *testing.T) {
	cases := []struct {
		name string
		body string
		want string
	}{
		{"nested instance.state", `{"instance":{"state":"open"}}`, "open"},
		{"nested instance.status", `{"instance":{"status":"open"}}`, "open"},
		{"nested connectionStatus", `{"instance":{"connectionStatus":"open"}}`, "open"},
		{"top-level state", `{"state":"open"}`, "open"},
		{"top-level status", `{"status":"connecting"}`, "connecting"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Write([]byte(tc.body))
			}))
			defer srv.Close()

			c := NewClient(srv.URL, "token", "inst")
			got, err := c.GetConnectionStatus(context.Background())
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestGetConnectionStatusNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "token", "inst")
	got, err := c.GetConnectionStatus(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "disconnected" {
		t.Errorf("got %q, want %q", got, "disconnected")
	}
}

func TestSetWebhook(t *testing.T) {
	t.Run("sends v2 payload to the correct endpoint", func(t *testing.T) {
		var gotPath string
		var gotBody map[string]any
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotPath = r.URL.Path
			body, _ := io.ReadAll(r.Body)
			_ = json.Unmarshal(body, &gotBody)
			w.WriteHeader(http.StatusCreated)
		}))
		defer srv.Close()

		c := NewClient(srv.URL, "token", "inst")
		if err := c.SetWebhook(context.Background(), "https://hd.example.com/api/v1/webhooks/whatsapp"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if gotPath != "/webhook/set/inst" {
			t.Errorf("path = %q, want /webhook/set/inst", gotPath)
		}
		wh, ok := gotBody["webhook"].(map[string]any)
		if !ok {
			t.Fatalf("payload missing nested webhook object: %v", gotBody)
		}
		if wh["url"] != "https://hd.example.com/api/v1/webhooks/whatsapp" {
			t.Errorf("url = %v", wh["url"])
		}
		if wh["enabled"] != true {
			t.Errorf("enabled = %v, want true", wh["enabled"])
		}
		events, ok := wh["events"].([]any)
		if !ok || len(events) != 1 || events[0] != "MESSAGES_UPSERT" {
			t.Errorf("events = %v, want [MESSAGES_UPSERT]", wh["events"])
		}
	})

	t.Run("error on non-2xx", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
		}))
		defer srv.Close()

		c := NewClient(srv.URL, "token", "inst")
		if err := c.SetWebhook(context.Background(), "https://x/y"); err == nil {
			t.Fatal("expected error on 400")
		}
	})

	t.Run("unconfigured", func(t *testing.T) {
		c := NewClient("", "", "")
		if err := c.SetWebhook(context.Background(), "https://x/y"); err == nil {
			t.Fatal("expected error for unconfigured client")
		}
	})
}

func TestGetMediaBase64(t *testing.T) {
	want := []byte("hello-bytes")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/getBase64FromMediaMessage/inst" {
			t.Errorf("path = %q", r.URL.Path)
		}
		resp := map[string]any{
			"base64":   base64.StdEncoding.EncodeToString(want),
			"fileName": "print.jpg",
			"mimetype": "image/jpeg",
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "token", "inst")
	data, mime, name, err := c.GetMediaBase64(context.Background(), "MSGID")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(data) != string(want) {
		t.Errorf("data = %q, want %q", data, want)
	}
	if mime != "image/jpeg" {
		t.Errorf("mime = %q", mime)
	}
	if name != "print.jpg" {
		t.Errorf("name = %q", name)
	}
}

func TestSendMediaBase64(t *testing.T) {
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/message/sendMedia/inst" {
			t.Errorf("path = %q", r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &gotBody)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "token", "inst")
	if err := c.SendMediaBase64(context.Background(), "+5511999", []byte("x"), "image/png", "a.png", "cap"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotBody["mediatype"] != "image" {
		t.Errorf("mediatype = %v, want image", gotBody["mediatype"])
	}
	if gotBody["number"] != "5511999" {
		t.Errorf("number = %v (should strip +)", gotBody["number"])
	}
	if gotBody["media"] != base64.StdEncoding.EncodeToString([]byte("x")) {
		t.Errorf("media not base64-encoded: %v", gotBody["media"])
	}
}

func TestMediaTypeFor(t *testing.T) {
	cases := []struct{ mime, file, want string }{
		{"image/jpeg", "x", "image"},
		{"video/mp4", "x", "video"},
		{"audio/ogg", "x", "audio"},
		{"application/pdf", "doc.pdf", "document"},
		{"", "photo.PNG", "image"},
		{"", "clip.mp4", "video"},
		{"", "file.unknown", "document"},
	}
	for _, tc := range cases {
		if got := mediaTypeFor(tc.mime, tc.file); got != tc.want {
			t.Errorf("mediaTypeFor(%q,%q) = %q, want %q", tc.mime, tc.file, got, tc.want)
		}
	}
}

func TestLogout(t *testing.T) {
	t.Run("success on 2xx", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodDelete {
				t.Errorf("expected DELETE, got %s", r.Method)
			}
			w.WriteHeader(http.StatusOK)
		}))
		defer srv.Close()

		c := NewClient(srv.URL, "token", "inst")
		if err := c.Logout(context.Background()); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("not found is treated as success", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
		}))
		defer srv.Close()

		c := NewClient(srv.URL, "token", "inst")
		if err := c.Logout(context.Background()); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("error on 5xx", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))
		defer srv.Close()

		c := NewClient(srv.URL, "token", "inst")
		if err := c.Logout(context.Background()); err == nil {
			t.Fatal("expected error on 500")
		}
	})

	t.Run("unconfigured", func(t *testing.T) {
		c := NewClient("", "", "")
		if err := c.Logout(context.Background()); err == nil {
			t.Fatal("expected error for unconfigured client")
		}
	})
}
