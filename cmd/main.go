package main

import (
	"context"
	"errors"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"markdownhub/internal/api"
	"markdownhub/internal/core"
	"markdownhub/internal/logger"
	"markdownhub/internal/migrator"
	"markdownhub/internal/store"
)

// 构建时通过 ldflags 注入
var (
	version    = "dev"
	buildTime  = "unknown"
)

func main() {
	// Initialize structured logger
	logLevel := getEnv("LOG_LEVEL", "info")
	logPretty := getEnv("LOG_PRETTY", "true") == "true"

	logger.Init(logger.Config{
		Level:  logLevel,
		Pretty: logPretty,
	})

	logger.Info("Starting MarkdownHub").
		Str("version", version).
		Str("build_time", buildTime).
		Send()

	dsn := getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/markdownhub?sslmode=disable")
	addr := getEnv("ADDR", ":8080")
	jwtSecret := []byte(getEnv("JWT_SECRET", "change-me-in-production"))

	db, err := store.NewDB(dsn)
	if err != nil {
		logger.Fatal("Failed to connect to database").Err(err).Send()
	}
	defer db.Close()

	logger.Info("Database connected").Send()

	// 执行数据库迁移
	migrationsPath := getEnv("MIGRATIONS_PATH", "db/migrations")
	if err := migrator.Run(context.Background(), dsn, migrationsPath); err != nil {
		logger.Fatal("Database migration failed").Err(err).Send()
	}

	// Wire services.
	permSvc := core.NewPermissionService(db)
	authSvc := core.NewAuthService(db)
	userSvc := core.NewUserService(db)
	docSvc := core.NewDocumentService(db, permSvc)
	snapSvc := core.NewSnapshotService(db, permSvc)
	workspaceSvc := core.NewWorkspaceService(db, permSvc)
	attachSvc := core.NewAttachmentService(db, permSvc)
	adminSvc := core.NewAdminService(db)

	// Embed the frontend build (dist/) at compile time.
	// When dist/ is not embedded (dev mode), pass nil so the API still works.
	var staticFS fs.FS
	if embeddedFS, err := fs.Sub(staticFiles, "dist"); err == nil {
		staticFS = embeddedFS
	}

	srv := api.NewServer(db, authSvc, userSvc, docSvc, snapSvc, permSvc, workspaceSvc, attachSvc, adminSvc, jwtSecret, staticFS)

	httpServer := &http.Server{
		Addr:         addr,
		Handler:      srv,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		logger.Info("HTTP server starting").Str("addr", addr).Send()
		if err := httpServer.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			logger.Fatal("HTTP server error").Err(err).Send()
		}
	}()

	<-quit
	logger.Info("Shutdown signal received").Send()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		logger.Error("Shutdown error").Err(err).Send()
	}
	logger.Info("Server shutdown complete").Send()
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
