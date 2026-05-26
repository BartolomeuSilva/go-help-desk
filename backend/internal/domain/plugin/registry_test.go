package plugin

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/publiciallc/go-help-desk/backend/internal/domain/notification"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRegistry_Native(t *testing.T) {
	ctx := context.Background()
	reg := NewRegistry(ctx)
	defer reg.Close(ctx)

	called := false
	m := Manifest{
		ID:      "com.example.native-test",
		Name:    "Native Test",
		Version: "1.0.0",
		Hooks:   []notification.EventType{notification.EventTicketCreated},
		Runtime: RuntimeNative,
	}

	err := reg.Register(m, func(ctx context.Context, event notification.Event) error {
		called = true
		assert.Equal(t, notification.EventTicketCreated, event.Type)
		return nil
	})
	require.NoError(t, err)

	// List
	list := reg.List()
	require.Len(t, list, 1)
	assert.Equal(t, m.ID, list[0].Manifest.ID)
	assert.True(t, list[0].Enabled)

	// Dispatch
	err = reg.Dispatch(ctx, notification.Event{
		Type: notification.EventTicketCreated,
	})
	require.NoError(t, err)
	assert.True(t, called)

	// Disable
	err = reg.Disable(m.ID)
	require.NoError(t, err)

	called = false
	err = reg.Dispatch(ctx, notification.Event{
		Type: notification.EventTicketCreated,
	})
	require.NoError(t, err)
	assert.False(t, called)
}

func TestRegistry_WASM_Minimal(t *testing.T) {
	ctx := context.Background()
	reg := NewRegistry(ctx)
	defer reg.Close(ctx)

	// Create a temp minimal WASM file (8-byte WASM magic header)
	tmpDir, err := os.MkdirTemp("", "wasm-test")
	require.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	wasmPath := filepath.Join(tmpDir, "test.wasm")
	minimalWASM := []byte{0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00}
	err = os.WriteFile(wasmPath, minimalWASM, 0644)
	require.NoError(t, err)

	p := Plugin{
		Manifest: Manifest{
			ID:      "com.example.wasm-test",
			Name:    "WASM Test",
			Version: "1.0.0",
			Hooks:   []notification.EventType{notification.EventTicketCreated},
			Runtime: RuntimeWASM,
		},
		Enabled:     true,
		WASMPath:    wasmPath,
		InstalledAt: time.Now(),
	}

	err = reg.LoadWASM(ctx, p)
	require.NoError(t, err)

	list := reg.List()
	require.Len(t, list, 1)
	assert.Equal(t, p.Manifest.ID, list[0].Manifest.ID)

	// Dispatch (should not panic even though handle_event is not exported, it will log warning/error internally)
	err = reg.Dispatch(ctx, notification.Event{
		Type: notification.EventTicketCreated,
	})
	require.NoError(t, err)
}
