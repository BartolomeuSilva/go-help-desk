package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/publiciallc/go-help-desk/backend/internal/domain/notification"
	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/imports/wasi_snapshot_preview1"
	"github.com/tetratelabs/wazero/sys"
)

type loadedPlugin struct {
	manifest Manifest
	handler  Handler // for native plugins
	compiled wazero.CompiledModule // for WASM plugins
	enabled  bool
	wasmPath string
}

// contextKey is used to pass event JSON safely to host functions.
type contextKey string

const eventKey contextKey = "wasm_event_json"

// Host functions for the guest WASM plugins.
func getEventLen(ctx context.Context) int32 {
	if jsonBytes, ok := ctx.Value(eventKey).([]byte); ok {
		return int32(len(jsonBytes))
	}
	return 0
}

func getEvent(ctx context.Context, m api.Module, ptr int32) {
	if jsonBytes, ok := ctx.Value(eventKey).([]byte); ok {
		if !m.Memory().Write(uint32(ptr), jsonBytes) {
			slog.Error("failed to write event JSON to guest memory")
		}
	}
}

func logFunc(ctx context.Context, m api.Module, ptr int32, len int32) {
	bytes, ok := m.Memory().Read(uint32(ptr), uint32(len))
	if !ok {
		slog.Error("failed to read log message from guest memory")
		return
	}
	slog.Info("plugin log", "module", m.Name(), "message", string(bytes))
}

// registry is the implementation of Registry.
type registry struct {
	mu      sync.RWMutex
	plugins map[string]*loadedPlugin // keyed by manifest.ID
	waRT    wazero.Runtime
}

// NewRegistry returns a registry initialized with Wazero host module mappings.
func NewRegistry(ctx context.Context) Registry {
	rt := wazero.NewRuntime(ctx)
	wasi_snapshot_preview1.MustInstantiate(ctx, rt)

	_, err := rt.NewHostModuleBuilder("env").
		NewFunctionBuilder().WithFunc(getEventLen).Export("get_event_len").
		NewFunctionBuilder().WithFunc(getEvent).Export("get_event").
		NewFunctionBuilder().WithFunc(logFunc).Export("log").
		Instantiate(ctx)
	if err != nil {
		panic(fmt.Sprintf("failed to instantiate wazero host module: %v", err))
	}

	return &registry{
		plugins: make(map[string]*loadedPlugin),
		waRT:    rt,
	}
}

func (r *registry) Register(manifest Manifest, handler Handler) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.plugins[manifest.ID]; exists {
		return fmt.Errorf("plugin %q already registered", manifest.ID)
	}
	r.plugins[manifest.ID] = &loadedPlugin{
		manifest: manifest,
		handler:  handler,
		enabled:  true,
	}
	return nil
}

func (r *registry) LoadWASM(ctx context.Context, p Plugin) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	wasmBytes, err := os.ReadFile(p.WASMPath)
	if err != nil {
		return fmt.Errorf("reading WASM file: %w", err)
	}

	compiled, err := r.waRT.CompileModule(ctx, wasmBytes)
	if err != nil {
		return fmt.Errorf("compiling WASM module: %w", err)
	}

	r.plugins[p.Manifest.ID] = &loadedPlugin{
		manifest: p.Manifest,
		compiled: compiled,
		enabled:  p.Enabled,
		wasmPath: p.WASMPath,
	}
	return nil
}

func (r *registry) Unload(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.plugins, id)
	return nil
}

// Dispatch calls every enabled plugin subscribed to the event type.
func (r *registry) Dispatch(ctx context.Context, event notification.Event) error {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, p := range r.plugins {
		if !p.enabled || !subscribes(p.manifest, event.Type) {
			continue
		}

		if p.handler != nil {
			// Native plugin
			_ = p.handler(ctx, event)
		} else if p.compiled != nil {
			// WASM plugin
			go func(lp *loadedPlugin) {
				eventJSON, err := json.Marshal(event)
				if err != nil {
					slog.Error("failed to marshal event for plugin", "id", lp.manifest.ID, "error", err)
					return
				}

				wasmCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()

				wasmCtx = context.WithValue(wasmCtx, eventKey, eventJSON)
				modName := fmt.Sprintf("%s-%d", lp.manifest.ID, time.Now().UnixNano())
				config := wazero.NewModuleConfig().WithName(modName)

				mod, err := r.waRT.InstantiateModule(wasmCtx, lp.compiled, config)
				if err != nil {
					slog.Error("failed to instantiate guest module", "id", lp.manifest.ID, "error", err)
					return
				}
				defer mod.Close(wasmCtx)

				handleEventFn := mod.ExportedFunction("handle_event")
				if handleEventFn == nil {
					var list []string
					for k := range lp.compiled.ExportedFunctions() {
						list = append(list, k)
					}
					slog.Error("plugin handle_event not found", "id", lp.manifest.ID, "exported_funcs", list)
					return
				}

				results, err := handleEventFn.Call(wasmCtx)
				if err != nil {
					if exitErr, ok := err.(*sys.ExitError); ok && exitErr.ExitCode() == 0 {
						return
					}
					slog.Error("plugin handle_event failed", "id", lp.manifest.ID, "error", err)
					return
				}

				if len(results) > 0 && results[0] != 0 {
					slog.Warn("plugin handle_event returned non-zero code", "id", lp.manifest.ID, "code", results[0])
				}
			}(p)
		}
	}
	return nil
}

func (r *registry) List() []Plugin {
	r.mu.RLock()
	defer r.mu.RUnlock()

	out := make([]Plugin, 0, len(r.plugins))
	for _, p := range r.plugins {
		out = append(out, Plugin{
			Manifest:    p.manifest,
			Enabled:     p.enabled,
			WASMPath:    p.wasmPath,
			InstalledAt: time.Now(), // fallback for display
		})
	}
	return out
}

func (r *registry) Enable(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	p, ok := r.plugins[id]
	if !ok {
		return fmt.Errorf("plugin %q not found", id)
	}
	p.enabled = true
	return nil
}

func (r *registry) Disable(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	p, ok := r.plugins[id]
	if !ok {
		return fmt.Errorf("plugin %q not found", id)
	}
	p.enabled = false
	return nil
}

func (r *registry) Close(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.waRT != nil {
		return r.waRT.Close(ctx)
	}
	return nil
}

func subscribes(m Manifest, eventType notification.EventType) bool {
	for _, h := range m.Hooks {
		if h == eventType {
			return true
		}
	}
	return false
}
