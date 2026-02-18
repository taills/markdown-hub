package main

import (
	"context"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"markdownhub/internal/api"
	"markdownhub/internal/core"
	"markdownhub/internal/store"
)

func main() {
	dsn := getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/markdownhub?sslmode=disable")
	addr := getEnv("ADDR", ":8080")
	jwtSecret := []byte(getEnv("JWT_SECRET", "change-me-in-production"))

	db, err := store.New(dsn)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

	// Wire services.
	permSvc := core.NewPermissionService(db)
	authSvc := core.NewAuthService(db)
	userSvc := core.NewUserService(db)
	docSvc := core.NewDocumentService(db, permSvc)
	snapSvc := core.NewSnapshotService(db, permSvc)
	workspaceSvc := core.NewWorkspaceService(db, permSvc)
	attachSvc := core.NewAttachmentService(db, permSvc)

	// Embed the frontend build (dist/) at compile time.
	// When dist/ is not embedded (dev mode), pass nil so the API still works.
	var staticFS fs.FS
	if embeddedFS, err := fs.Sub(staticFiles, "dist"); err == nil {
		staticFS = embeddedFS
	}

	srv := api.NewServer(db, authSvc, userSvc, docSvc, snapSvc, permSvc, workspaceSvc, attachSvc, jwtSecret, staticFS)

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
		log.Printf("MarkdownHub listening on %s", addr)
		if err := httpServer.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server error: %v", err)
		}
	}()

	<-quit
	log.Println("shutting down…")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
