package main

import (
	"context"
	"embed"
	"errors"
	"flag"
	"fmt"
	"github.com/joho/godotenv"
	"io/fs"
	"markdownhub/internal/api"
	"markdownhub/internal/config"
	"markdownhub/internal/core"
	"markdownhub/internal/logger"
	"markdownhub/internal/migrator"
	"markdownhub/internal/store"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// 构建时通过 ldflags 注入
var (
	version   = "dev"
	buildTime = "unknown"
)

func main() {
	// 定义命令行参数
	showHelp := flag.Bool("h", false, "Show help message")
	showVersion := flag.Bool("v", false, "Show version information")
	addr := flag.String("addr", ":8080", "Server listen address")
	dsn := flag.String("db", "postgres://postgres:postgres@localhost:5432/markdownhub?sslmode=disable", "Database connection string")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, `MarkdownHub - Real-time collaborative Markdown editor

Usage: %s [options]

Options:
`, os.Args[0])
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, `
Environment Variables:
  DATABASE_URL  Database connection string (overrides -db)
  ADDR         Server listen address (overrides -addr)

Examples:
  %s -addr :8080 -db postgres://user:pass@localhost:5432/mdhub

For more information, visit: https://github.com/markdownhub/markdownhub
`, os.Args[0])
	}

	flag.Parse()

	// 显示帮助信息
	if *showHelp {
		flag.Usage()
		os.Exit(0)
	}

	// 显示版本信息
	if *showVersion {
		fmt.Printf("MarkdownHub %s\n", version)
		fmt.Printf("Build time: %s\n", buildTime)
		os.Exit(0)
	}

	// 加载 .env 文件中的环境变量（如果存在）
	if err := godotenv.Load(); err != nil {
		fmt.Printf("加载 .env 文件失败: %v", err)
	}

	// 从环境变量覆盖命令行参数
	if envAddr := os.Getenv("ADDR"); envAddr != "" {
		*addr = envAddr
	}
	if envDsn := os.Getenv("DATABASE_URL"); envDsn != "" {
		*dsn = envDsn
	}

	// 先初始化日志（使用默认配置）
	logger.Init(logger.Config{
		Level:  "info",
		Pretty: true,
	})

	logger.Info("Starting MarkdownHub").
		Str("version", version).
		Str("build_time", buildTime).
		Send()

	// 连接数据库
	db, err := store.NewDB(*dsn)
	if err != nil {
		logger.Fatal("Failed to connect to database").Err(err).Send()
	}
	defer db.Close()

	logger.Info("Database connected").Send()

	// 执行数据库迁移
	if err := migrator.Run(context.Background(), *dsn); err != nil {
		logger.Fatal("Database migration failed").Err(err).Send()
	}

	// 初始化配置系统（从数据库加载或生成）
	jwtSecretEnv := os.Getenv("JWT_SECRET")
	if err := config.Init(db, jwtSecretEnv); err != nil {
		logger.Fatal("Failed to initialize config").Err(err).Send()
	}

	// 使用数据库中的配置初始化日志
	cfg := config.Get()
	logger.Init(logger.Config{
		Level:  cfg.GetLogLevel(),
		Pretty: cfg.GetLogPretty(),
	})

	logger.Info("Configuration loaded from database").
		Str("log_level", cfg.GetLogLevel()).
		Bool("log_pretty", cfg.GetLogPretty()).
		Send()

	// Wire services.
	permSvc := core.NewPermissionService(db)
	authSvc := core.NewAuthService(db)
	userSvc := core.NewUserService(db)
	socialSvc := core.NewSocialService(db, authSvc)
	adminSvc := core.NewAdminService(db)
	docSvc := core.NewDocumentService(db, permSvc)
	snapSvc := core.NewSnapshotService(db, permSvc)
	workspaceSvc := core.NewWorkspaceService(db, permSvc, adminSvc)
	attachSvc := core.NewAttachmentService(db, permSvc)
	importerSvc := core.NewImporterService(db, docSvc, attachSvc)
	commentSvc := core.NewCommentService(db, permSvc)
	aiSvc := core.NewAIService(db)
	// Load AI configuration from environment or settings
	aiSvc.Configure(
		os.Getenv("AI_API_KEY"),
		os.Getenv("AI_API_BASE"),
		os.Getenv("AI_MODEL"),
	)

	// Embed the frontend build (dist/) at compile time.
	// When dist/ is not embedded (dev mode), pass nil so the API still works.
	var staticFS embed.FS = staticFiles

	// Check if embedded files exist by trying to read the "dist" directory
	if _, err := fs.ReadDir(staticFS, "dist"); err != nil {
		logger.Warn("Static files NOT embedded - dist directory may be missing").Err(err).Send()
	} else {
		logger.Info("Static files embedded successfully").Send()
	}

	srv := api.NewServer(db, authSvc, socialSvc, userSvc, docSvc, snapSvc, permSvc, workspaceSvc, attachSvc, adminSvc, importerSvc, commentSvc, aiSvc, []byte(cfg.GetJWTSecret()), staticFS)

	httpServer := &http.Server{
		Addr:         *addr,
		Handler:      srv,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		logger.Info("HTTP server starting").Str("addr", *addr).Send()
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
