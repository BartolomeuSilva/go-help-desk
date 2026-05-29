package main

import (
	"context"
	"encoding/gob"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/sessions"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/publiciallc/go-help-desk/backend/internal/config"
	"github.com/publiciallc/go-help-desk/backend/internal/database"
	"github.com/publiciallc/go-help-desk/backend/internal/database/adminstore"
	"github.com/publiciallc/go-help-desk/backend/internal/database/auditstore"
	"github.com/publiciallc/go-help-desk/backend/internal/database/authstore"
	"github.com/publiciallc/go-help-desk/backend/internal/database/categorystore"
	"github.com/publiciallc/go-help-desk/backend/internal/database/customfieldstore"
	"github.com/publiciallc/go-help-desk/backend/internal/database/groupstore"
	"github.com/publiciallc/go-help-desk/backend/internal/database/registrationstore"
	"github.com/publiciallc/go-help-desk/backend/internal/database/slastore"
	"github.com/publiciallc/go-help-desk/backend/internal/database/tagstore"
	"github.com/publiciallc/go-help-desk/backend/internal/database/ticketstore"
	"github.com/publiciallc/go-help-desk/backend/internal/database/pluginstore"
	"github.com/publiciallc/go-help-desk/backend/internal/database/cannedstore"
	"github.com/publiciallc/go-help-desk/backend/internal/database/kbstore"
	"github.com/publiciallc/go-help-desk/backend/internal/database/userstore"
	"github.com/publiciallc/go-help-desk/backend/internal/dbgen"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/admin"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/auth"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/canned"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/kb"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/category"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/customfield"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/group"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/plugin"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/registration"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/sla"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/tag"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/ticket"
	"github.com/publiciallc/go-help-desk/backend/internal/domain/user"
	authmw "github.com/publiciallc/go-help-desk/backend/internal/middleware"
	"github.com/publiciallc/go-help-desk/backend/internal/mcp"
	"github.com/publiciallc/go-help-desk/backend/internal/server"
	"github.com/publiciallc/go-help-desk/backend/internal/server/notify"
	"github.com/publiciallc/go-help-desk/backend/internal/ui"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("fatal: %v", err)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// ── Config ────────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	// ── Logger ────────────────────────────────────────────────────────────────
	var logLevel slog.Level
	if err := logLevel.UnmarshalText([]byte(cfg.LogLevel)); err != nil {
		log.Printf("warn: invalid LOG_LEVEL %q, defaulting to info", cfg.LogLevel)
		logLevel = slog.LevelInfo
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel})))

	// ── Database ─────────────────────────────────────────────────────────────
	// Run migrations before opening the pool so the schema is always current.
	if err := database.Migrate(ctx, database.MigrateURL(cfg.DatabaseURL)); err != nil {
		return fmt.Errorf("running migrations: %w", err)
	}

	pool, err := database.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connecting to database: %w", err)
	}
	defer pool.Close()

	// sqlc requires a database/sql-compatible interface; wrap the pgxpool.
	sqlDB := stdlib.OpenDBFromPool(pool)
	q := dbgen.New(sqlDB)

	// ── Stores ────────────────────────────────────────────────────────────────
	uStore := userstore.New(q)
	tStore := ticketstore.New(q)
	cStore := categorystore.New(q)
	gStore := groupstore.New(q)
	aStore := adminstore.New(q)
	auStore := auditstore.New(q)
	slStore := slastore.New(q)
	authStore := authstore.New(q)
	cfStore := customfieldstore.New(q)
	regStore := registrationstore.New(q)
	pluginStore := pluginstore.New(q)
	canStore := cannedstore.New(q)
	kbStore := kbstore.New(q)

	// ── Domain services ───────────────────────────────────────────────────────
	tagStore := tagstore.New(q)

	userSvc := user.NewService(uStore)
	if err := userSvc.WarmupCache(ctx); err != nil {
		return fmt.Errorf("warming up user roles cache: %w", err)
	}
	categorySvc := category.NewService(cStore)
	groupSvc := group.NewService(gStore)
	tagSvc := tag.NewService(tagStore)
	adminSvc := admin.NewService(aStore)
	customFieldSvc := customfield.NewService(cfStore)
	cannedSvc := canned.NewService(canStore)
	kbSvc := kb.NewService(kbStore)

	// slaPolicySvc is always created so the admin blade can manage policies
	// regardless of whether SLA enforcement is active.
	slaPolicySvc := sla.NewService(slStore)

	// slaSvc is passed to the ticket service for enforcement; it uses a dynamic check
	// for whether SLA is enabled based on admin settings or startup configuration.
	slaSvc := sla.NewService(slStore).WithEnabledFunc(func(ctx context.Context) bool {
		return adminSvc.SLAEnabled(ctx)
	})

	// ── Plugin registry ───────────────────────────────────────────────────────
	pluginRegistry := plugin.NewRegistry(ctx)
	installedPlugins, err := pluginStore.List(ctx)
	if err != nil {
		return fmt.Errorf("loading installed plugins: %w", err)
	}
	for _, p := range installedPlugins {
		if p.Manifest.Runtime == plugin.RuntimeWASM {
			slog.Info("loading WASM plugin", "id", p.Manifest.ID, "path", p.WASMPath)
			if err := pluginRegistry.LoadWASM(ctx, p); err != nil {
				slog.Error("failed to load WASM plugin on startup", "id", p.Manifest.ID, "error", err)
			}
		}
	}

	// ── Notifications ─────────────────────────────────────────────────────────
	emailDisp, err := notify.NewEmailDispatcher(cfg, adminSvc)
	if err != nil {
		return fmt.Errorf("initialising email dispatcher: %w", err)
	}
	webhookDisp := notify.NewWebhookDispatcher(authStore)
	whatsappDisp := notify.NewWhatsAppDispatcher(cfg, adminSvc, tStore, userSvc)
	dispatcher := notify.NewMulti(emailDisp, webhookDisp, whatsappDisp, pluginRegistry)

	// ── Registration service ──────────────────────────────────────────────────
	registrationSvc := registration.NewService(regStore, userSvc, emailDisp, cfg.BaseURL)

	// ── Ticket service ────────────────────────────────────────────────────────
	ticketSvc := ticket.NewService(tStore, tStore, dispatcher, auStore, slaSvc)
	if err := ticketSvc.LoadSystemStatuses(ctx); err != nil {
		return fmt.Errorf("loading system statuses: %w", err)
	}

	// ── Auth helpers ──────────────────────────────────────────────────────────
	gob.Register(auth.SessionData{})
	sessionStore := sessions.NewCookieStore([]byte(cfg.SessionSecret))
	sessionStore.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 30,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   strings.HasPrefix(strings.ToLower(cfg.BaseURL), "https://"),
	}

	apiKeyLookup := authmw.APIKeyAuthFunc(func(ctx context.Context, hashed string) (auth.APIKey, user.User, error) {
		key, err := authStore.GetByHash(ctx, hashed)
		if err != nil {
			return auth.APIKey{}, user.User{}, err
		}
		u, err := userSvc.GetByID(ctx, key.UserID)
		if err != nil {
			return auth.APIKey{}, user.User{}, err
		}
		return key, u, nil
	})

	// ── HTTP server ───────────────────────────────────────────────────────────
	srv := server.New(
		cfg,
		sessionStore,
		userSvc,
		ticketSvc,
		categorySvc,
		groupSvc,
		tagSvc,
		adminSvc,
		customFieldSvc,
		slaPolicySvc,
		pluginRegistry,
		pluginStore,
		apiKeyLookup,
		authStore,
		authStore,
		registrationSvc,
		cannedSvc,
		kbSvc,
		q, // itsmStore — *dbgen.Queries satisfies server.ITSMStore
	)

	srv.InitSAML(ctx)

	// ── MCP server (mounted under /mcp) ───────────────────────────────────────
	mcpSrv := mcp.New(ticketSvc)

	mux := http.NewServeMux()
	mux.Handle("/mcp/", mcpSrv.Handler())
	mux.Handle("/api/", srv)
	mux.Handle("/health", srv)
	mux.Handle("/", server.NewSPAHandler(ui.FS()))

	httpSrv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.HTTPPort),
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// ── Graceful shutdown ─────────────────────────────────────────────────────
	shutdownDone := make(chan error, 1)
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		shutdownDone <- httpSrv.Shutdown(shutdownCtx)
	}()

	slog.Info("go-help-desk listening", "port", cfg.HTTPPort)
	if err := httpSrv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("http server: %w", err)
	}

	return <-shutdownDone
}

