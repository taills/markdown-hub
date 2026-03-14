package api

import (
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"markdownhub/internal/core"
	"markdownhub/internal/logger"
	"markdownhub/internal/store"
)

// Server wires all handlers into a Gin engine.
type Server struct {
	engine *gin.Engine
	hub    *Hub
	static fs.FS
}

// NewServer constructs and wires up the HTTP server using Gin.
func NewServer(
	db *store.DB,
	authSvc *core.AuthService,
	userSvc *core.UserService,
	docSvc *core.DocumentService,
	snapSvc *core.SnapshotService,
	permSvc *core.PermissionService,
	workspaceSvc *core.WorkspaceService,
	attachSvc *core.AttachmentService,
	adminSvc *core.AdminService,
	importerSvc *core.ImporterService,
	secret []byte,
	staticFiles embed.FS,
) *Server {
	jwtSecret = secret

	hub := NewHub(docSvc, db)

	// Set Gin to release mode in production
	gin.SetMode(gin.ReleaseMode)

	router := gin.New()
	// Disable automatic redirect trailing slash
	router.RedirectTrailingSlash = false
	router.RedirectFixedPath = false
	router.Use(gin.Recovery())
	router.Use(LoggerMiddleware()) // Use structured logging middleware

	// Health check endpoints (no auth required)
	healthH := NewHealthHandler(db)
	router.GET("/health", healthH.Health)
	router.GET("/ready", healthH.Ready)
	router.GET("/metrics", healthH.Metrics)

	// Home page data - public endpoint for showing public workspaces and documents
	router.GET("/api/home", func(c *gin.Context) {
		workspaces, err := workspaceSvc.ListPublicWorkspaces(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch workspaces"})
			return
		}
		documents, err := docSvc.ListGlobalPublicDocuments(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch documents"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"workspaces": workspaces,
			"documents":  documents,
		})
	})

	// CSRF token endpoint - returns a new CSRF token
	router.GET("/api/csrf", func(c *gin.Context) {
		token := generateCSRFToken()
		c.SetCookie(csrfCookieName, token, 3600*24, "/", "", false, true)
		c.JSON(http.StatusOK, gin.H{"token": token})
	})

	// Initialize handlers
	authH := NewAuthHandler(authSvc)
	userH := NewUserHandler(userSvc)
	docH := NewDocumentHandler(docSvc)
	snapH := NewSnapshotHandler(snapSvc)
	permH := NewPermissionHandler(permSvc, docSvc)
	attachH := NewAttachmentHandler(attachSvc, docSvc)
	workspaceH := NewWorkspaceHandler(workspaceSvc)
	adminH := NewAdminHandler(adminSvc, authSvc)
	workspaceAttachH := NewWorkspaceAttachmentHandler(attachSvc)
	importerH := NewImporterHandler(importerSvc)

	// WebSocket endpoint
	router.GET("/ws", hub.ServeWS)

	// API routes
	api := router.Group("/api")
	{
		// Public routes (no CSRF protection needed for read-only)
		public := api.Group("/public")
		{
			public.GET("/site-title", adminH.GetSiteTitlePublic)
		}

		api.Use(csrfMiddleware()) // CSRF protection for state-changing operations

		// Public auth routes
		auth := api.Group("/auth")
		{
			auth.POST("/register", authH.Register)
			auth.POST("/login", authH.Login)
			auth.GET("/me", authMiddleware(), authH.Me)
		}

		// Document routes with optional auth for public access
		docs := api.Group("/documents")
		{
			// Public routes (no auth required, but optional)
			docs.GET("/:id", optionalAuthMiddleware(), docH.Get)
			docs.GET("/:id/raw", optionalAuthMiddleware(), docH.GetRaw)

			// Protected routes
			docs.GET("", authMiddleware(), docH.List)
			docs.POST("", authMiddleware(), docH.Create)
			docs.PATCH("/reorder", authMiddleware(), docH.Reorder)
			docs.PATCH("/:id/content", authMiddleware(), docH.UpdateContent)
			docs.PATCH("/:id/title", authMiddleware(), docH.UpdateTitle)
			docs.PATCH("/:id/public", authMiddleware(), docH.SetPublicStatus)
			docs.DELETE("/:id", authMiddleware(), docH.Delete)
			docs.GET("/:id/headings", authMiddleware(), docH.Headings)

			// Snapshot routes
			docs.POST("/:id/snapshots", authMiddleware(), snapH.Create)
			docs.GET("/:id/snapshots", authMiddleware(), snapH.List)

			// Permission routes
			docs.GET("/:id/permissions", authMiddleware(), permH.List)
			docs.PUT("/:id/permissions", authMiddleware(), permH.Set)
			docs.DELETE("/:id/permissions/:userId", authMiddleware(), permH.Delete)
			docs.PUT("/:id/permissions/:userId/headings/:anchor", authMiddleware(), permH.SetHeading)

			// Attachment routes
			docs.POST("/:id/attachments", authMiddleware(), attachH.Upload)
			docs.GET("/:id/attachments", authMiddleware(), attachH.List)
			docs.GET("/:id/attachments/unreferenced", authMiddleware(), attachH.GetUnreferenced)
			docs.DELETE("/:id/attachments/:attachmentId", authMiddleware(), attachH.Delete)
		}

		// Standalone snapshot routes
		snapshots := api.Group("/snapshots").Use(authMiddleware())
		{
			snapshots.POST("/:id/restore", snapH.Restore)
			snapshots.GET("/:id/diff", snapH.Diff)
		}

		// Standalone attachment routes
		attachments := api.Group("/attachments").Use(authMiddleware())
		{
			attachments.GET("/:id/download", attachH.Download)
			attachments.DELETE("/:id", attachH.Delete)
		}

		// Workspace routes
		workspaces := api.Group("/workspaces")
		{
			// Public routes
			workspaces.GET("/:id", optionalAuthMiddleware(), workspaceH.Get)
			workspaces.GET("/:id/documents", optionalAuthMiddleware(), docH.ListPublicByWorkspace)

			// Protected routes
			workspaces.GET("", authMiddleware(), workspaceH.List)
			workspaces.POST("", authMiddleware(), workspaceH.Create)
			workspaces.PATCH("/reorder", authMiddleware(), workspaceH.Reorder)
			workspaces.PATCH("/:id", authMiddleware(), workspaceH.Update)
			workspaces.PATCH("/:id/public", authMiddleware(), workspaceH.SetPublicStatus)
			workspaces.DELETE("/:id", authMiddleware(), workspaceH.DeleteWorkspace)
			workspaces.GET("/:id/members", authMiddleware(), workspaceH.ListMembers)
			workspaces.PUT("/:id/members", authMiddleware(), workspaceH.SetMember)
			workspaces.DELETE("/:id/members/:userId", authMiddleware(), workspaceH.DeleteMember)

			// Workspace attachment routes
			workspaces.POST("/:id/attachments", authMiddleware(), workspaceAttachH.Upload)
			workspaces.GET("/:id/attachments", authMiddleware(), workspaceAttachH.List)
			workspaces.DELETE("/:id/attachments/:attachmentId", authMiddleware(), workspaceAttachH.Delete)
		}

		// Standalone workspace attachment routes
		workspaceAttachments := api.Group("/workspace-attachments").Use(authMiddleware())
		{
			workspaceAttachments.GET("/:id/download", workspaceAttachH.Download)
			workspaceAttachments.DELETE("/:id", workspaceAttachH.Delete)
		}

		// User profile routes
		users := api.Group("/users/me").Use(authMiddleware())
		{
			users.GET("/stats", userH.Stats)
			users.PATCH("/password", userH.UpdatePassword)
			users.PATCH("/preferences", userH.UpdatePreferences)
		}

		// Import routes
		importGroup := api.Group("/import").Use(authMiddleware())
		{
			importGroup.POST("/url", importerH.ImportFromURL)
			importGroup.POST("/content", importerH.ImportFromContent)
		}

		// Plugin config route (public)
		router.GET("/api/plugin/config", adminH.GetPluginConfig)

		// Admin routes
		admin := api.Group("/admin").Use(authMiddleware())
		{
			admin.GET("/users", adminH.ListUsers)
			admin.PATCH("/users/:id/admin", adminH.SetAdmin)
			admin.DELETE("/users/:id", adminH.DeleteUser)
			admin.POST("/users/:id/reset-password", adminH.ResetPassword)
			admin.PUT("/users/:id/email", adminH.UpdateEmail)
			admin.GET("/logs", adminH.ListLogs)

			// Site settings
			admin.GET("/settings/site-title", adminH.GetSiteTitle)
			admin.PUT("/settings/site-title", adminH.UpdateSiteTitle)

			// LLM settings
			admin.GET("/settings/llm", adminH.GetLLMConfig)
			admin.PUT("/settings/llm", adminH.UpdateLLMConfig)
			admin.POST("/settings/llm/test", adminH.TestLLMConfig)

			// Embedding settings
			admin.GET("/settings/embedding", adminH.GetEmbeddingConfig)
			admin.PUT("/settings/embedding", adminH.UpdateEmbeddingConfig)
			admin.POST("/settings/embedding/test", adminH.TestEmbeddingConfig)
		}
	}

	// Handle static files and SPA routing
	router.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path

		// Serve uploaded files directly (handle both /uploads/ and /documents/uploads/)
		if strings.Contains(path, "/uploads/") {
			var filePath string
			if strings.HasPrefix(path, "/uploads/") {
				filePath = strings.TrimPrefix(path, "/")
			} else {
				// Extract from /documents/uploads/... or any other path containing /uploads/
				idx := strings.Index(path, "/uploads/")
				if idx >= 0 {
					filePath = path[idx+1:] // Remove leading slash
				}
			}

			if filePath != "" {
				// Security: validate path to prevent path traversal attacks
				cleanPath := filepath.Clean(filePath)
				if strings.Contains(cleanPath, "..") {
					c.JSON(http.StatusForbidden, gin.H{"error": "invalid path"})
					return
				}

				// Ensure path is within uploads directory
				absPath, err := filepath.Abs(cleanPath)
				if err != nil {
					c.JSON(http.StatusForbidden, gin.H{"error": "invalid path"})
					return
				}
				absUploads, err := filepath.Abs("uploads")
				if err != nil {
					c.JSON(http.StatusForbidden, gin.H{"error": "invalid path"})
					return
				}
				if !strings.HasPrefix(absPath, absUploads) {
					c.JSON(http.StatusForbidden, gin.H{"error": "path not allowed"})
					return
				}

				c.File(filePath)
				return
			}
		}

		// /documents/{id}/raw — rewrite to the API handler
		if c.Request.Method == http.MethodGet {
			parts := strings.Split(strings.Trim(path, "/"), "/")
			if len(parts) == 3 && parts[0] == "documents" && parts[2] == "raw" {
				c.Request.URL.Path = "/api/documents/" + parts[1] + "/raw"
				router.HandleContext(c)
				return
			}
		}

		// Serve SPA
		// staticFiles is always non-nil if dist directory existed at build time
		{
			logger := logger.Logger.With().Str("path", path).Logger()
			logger.Info().Msg("Serving SPA")

			// Get the requested path - embed.FS embeds the "dist" directory itself
			// so we need to prepend "dist/" to the path
			reqPath := strings.TrimPrefix(path, "/")
			if reqPath == "" {
				reqPath = "dist/index.html"
			} else {
				reqPath = "dist/" + reqPath
			}
			logger.Info().Str("reqPath", reqPath).Msg("Opening file")

			// Try to read the file
			data, err := staticFiles.ReadFile(reqPath)
			if err != nil {
				logger.Error().Err(err).Str("reqPath", reqPath).Msg("Failed to read file, trying dist/index.html")
				// Fallback to index.html for SPA routing
				reqPath = "dist/index.html"
				data, err = staticFiles.ReadFile(reqPath)
				if err != nil {
					logger.Error().Err(err).Msg("Failed to serve index.html")
					c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
					return
				}
			}
			logger.Info().Int("size", len(data)).Msg("File served successfully")

			// Set content type based on file extension
			contentType := "text/plain; charset=utf-8"
			if strings.HasSuffix(reqPath, ".html") {
				contentType = "text/html; charset=utf-8"
			} else if strings.HasSuffix(reqPath, ".js") {
				contentType = "application/javascript"
			} else if strings.HasSuffix(reqPath, ".css") {
				contentType = "text/css"
			} else if strings.HasSuffix(reqPath, ".json") {
				contentType = "application/json"
			} else if strings.HasSuffix(reqPath, ".png") {
				contentType = "image/png"
			} else if strings.HasSuffix(reqPath, ".jpg") || strings.HasSuffix(reqPath, ".jpeg") {
				contentType = "image/jpeg"
			}

			c.Header("Content-Type", contentType)
			c.Header("Content-Length", fmt.Sprintf("%d", len(data)))

			// Write the file content
			c.Writer.WriteHeader(http.StatusOK)
			c.Writer.Write(data)
			return
		}
	})

	return &Server{engine: router, hub: hub, static: staticFiles}
}

// ServeHTTP implements http.Handler to make Server compatible with http.Server.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.engine.ServeHTTP(w, r)
}
