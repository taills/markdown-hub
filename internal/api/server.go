package api

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"markdownhub/internal/core"
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
	secret []byte,
	staticFiles fs.FS,
) *Server {
	jwtSecret = secret

	hub := NewHub(docSvc, db)

	// Set Gin to release mode in production
	gin.SetMode(gin.ReleaseMode)

	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(gin.Logger())

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

	// WebSocket endpoint
	router.GET("/ws", hub.ServeWS)

	// API routes
	api := router.Group("/api")
	{
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

		// Admin routes
		admin := api.Group("/admin").Use(authMiddleware())
		{
			admin.GET("/users", adminH.ListUsers)
			admin.PATCH("/users/:id/admin", adminH.SetAdmin)
			admin.DELETE("/users/:id", adminH.DeleteUser)
			admin.GET("/logs", adminH.ListLogs)
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
		if staticFiles != nil {
			// Try to serve the file directly
			trimmedPath := strings.TrimPrefix(path, "/")
			if trimmedPath == "" {
				trimmedPath = "index.html"
			}

			if _, err := fs.Stat(staticFiles, trimmedPath); err == nil {
				// File exists, serve it
				c.FileFromFS(trimmedPath, http.FS(staticFiles))
			} else {
				// File doesn't exist, serve index.html for client-side routing
				c.FileFromFS("index.html", http.FS(staticFiles))
			}
			return
		}

		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	})

	return &Server{engine: router, hub: hub, static: staticFiles}
}

// ServeHTTP implements http.Handler to make Server compatible with http.Server.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.engine.ServeHTTP(w, r)
}
