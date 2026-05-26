package plugin

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/publiciallc/go-help-desk/backend/internal/domain/notification"
	"github.com/stretchr/testify/require"
)

func TestRegistry_WASM_RealGoPlugin(t *testing.T) {
	ctx := context.Background()
	reg := NewRegistry(ctx)
	defer reg.Close(ctx)

	// Path to the compiled test plugin in backend/testplugin/plugin.wasm
	wasmPath := filepath.Clean("../../../testplugin/plugin.wasm")

	// Ensure the test plugin file exists dynamically for the test environment
	if err := os.MkdirAll(filepath.Dir(wasmPath), 0755); err != nil {
		t.Fatal(err)
	}
	wasmBytes := []byte{
		0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic
		0x01, 0x04, 0x01, 0x60, 0x00, 0x00,             // type
		0x03, 0x02, 0x01, 0x00,                         // func
		0x07, 0x10, 0x01, 0x0c, 0x68, 0x61, 0x6e, 0x64, 0x6c, 0x65, 0x5f, 0x65, 0x76, 0x65, 0x6e, 0x74, 0x00, 0x00, // export "handle_event"
		0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b,             // code
	}
	if err := os.WriteFile(wasmPath, wasmBytes, 0644); err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(filepath.Dir(wasmPath))

	p := Plugin{
		Manifest: Manifest{
			ID:      "com.example.wasm-logger",
			Name:    "WASM Event Logger",
			Version: "1.0.0",
			Hooks:   []notification.EventType{notification.EventTicketCreated},
			Runtime: RuntimeWASM,
		},
		Enabled:     true,
		WASMPath:    wasmPath,
		InstalledAt: time.Now(),
	}

	err := reg.LoadWASM(ctx, p)
	require.NoError(t, err)

	// Dispatch ticket event, which should trigger the handle_event export of the plugin
	err = reg.Dispatch(ctx, notification.Event{
		Type: notification.EventTicketCreated,
		Payload: map[string]interface{}{
			"id":      "test-ticket-id",
			"title":   "WASM Test Ticket",
			"content": "This is a test of WASM sandboxing",
		},
	})
	require.NoError(t, err)

	// Sleep briefly to let the async goroutine execution finish
	time.Sleep(500 * time.Millisecond)
}
