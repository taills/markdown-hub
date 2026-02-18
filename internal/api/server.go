package api

import (
	"io/fs"
	"net/http"
	"strings"

	"markdownhub/internal/core"
	"markdownhub/internal/store"
)

// Server wires all handlers into an http.Handler.
type Server struct {
	mux    *http.ServeMux
	hub    *Hub
	static fs.FS
}

// NewServer constructs and wires up the HTTP server.
func NewServer(
	db *store.DB,
	authSvc *core.AuthService,
	userSvc *core.UserService,
	docSvc *core.DocumentService,
	snapSvc *core.SnapshotService,
	permSvc *core.PermissionService,
	workspaceSvc *core.WorkspaceService,
	attachSvc *core.AttachmentService,
	secret []byte,
	staticFiles fs.FS,
) *Server {
	jwtSecret = secret

	hub := NewHub(docSvc, db)
	mux := http.NewServeMux()

	authH := NewAuthHandler(authSvc)
	userH := NewUserHandler(userSvc)
	docH := NewDocumentHandler(docSvc)
	snapH := NewSnapshotHandler(snapSvc)
	permH := NewPermissionHandler(permSvc, docSvc)
	attachH := NewAttachmentHandler(attachSvc, docSvc)
	workspaceH := NewWorkspaceHandler(workspaceSvc)
	workspaceAttachH := NewWorkspaceAttachmentHandler(attachSvc)

	// Public auth routes.
	mux.HandleFunc("POST /api/auth/register", authH.Register)
	mux.HandleFunc("POST /api/auth/login", authH.Login)

	// Unified document/workspace handler: some GET paths allow unauthenticated
	// access (public docs/workspaces); all others require a valid token.
	// We wrap everything in optionalAuthMiddleware so the user claim is always
	// populated when a token is present, then enforce auth inside the switch for
	// paths that require it.
	docAndWorkspaceHandler := optionalAuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Helper: reject if the request carries no authenticated user.
		requireAuth := func() bool {
			if _, ok := userIDFromContext(r.Context()); !ok {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return false
			}
			return true
		}

		switch {
		// ── Public document access (no auth required) ────────────────────────
		case r.Method == http.MethodGet && isDocPath(r.URL.Path, ""):
			docH.Get(w, r)
		case r.Method == http.MethodGet && isDocPath(r.URL.Path, "/raw"):
			docH.GetRaw(w, r)

		// ── Public workspace access (no auth required) ───────────────────────
		case r.Method == http.MethodGet && isWorkspacePath(r.URL.Path, ""):
			workspaceH.Get(w, r)
		case r.Method == http.MethodGet && isWorkspacePath(r.URL.Path, "/documents"):
			docH.ListPublicByWorkspace(w, r)

		// ── Protected document routes ─────────────────────────────────────────
		case r.Method == http.MethodGet && r.URL.Path == "/api/documents":
			if requireAuth() {
				docH.List(w, r)
			}
		case r.Method == http.MethodPost && r.URL.Path == "/api/documents":
			if requireAuth() {
				docH.Create(w, r)
			}
		case r.Method == http.MethodPatch && isDocPath(r.URL.Path, "/content"):
			if requireAuth() {
				docH.UpdateContent(w, r)
			}
		case r.Method == http.MethodPatch && isDocPath(r.URL.Path, "/title"):
			if requireAuth() {
				docH.UpdateTitle(w, r)
			}
		case r.Method == http.MethodPatch && isDocPath(r.URL.Path, "/public"):
			if requireAuth() {
				docH.SetPublicStatus(w, r)
			}
		case r.Method == http.MethodDelete && isDocPath(r.URL.Path, ""):
			if requireAuth() {
				docH.Delete(w, r)
			}
		case r.Method == http.MethodGet && isDocPath(r.URL.Path, "/headings"):
			if requireAuth() {
				docH.Headings(w, r)
			}

		// ── Protected snapshot routes ─────────────────────────────────────────
		case r.Method == http.MethodPost && isDocPath(r.URL.Path, "/snapshots"):
			if requireAuth() {
				snapH.Create(w, r)
			}
		case r.Method == http.MethodGet && isDocPath(r.URL.Path, "/snapshots"):
			if requireAuth() {
				snapH.List(w, r)
			}
		case r.Method == http.MethodPost && isSnapPath(r.URL.Path, "/restore"):
			if requireAuth() {
				snapH.Restore(w, r)
			}
		case r.Method == http.MethodGet && isSnapPath(r.URL.Path, "/diff"):
			if requireAuth() {
				snapH.Diff(w, r)
			}

		// ── Protected permission routes ───────────────────────────────────────
		case r.Method == http.MethodGet && isDocPath(r.URL.Path, "/permissions"):
			if requireAuth() {
				permH.List(w, r)
			}
		case r.Method == http.MethodPut && isDocPath(r.URL.Path, "/permissions"):
			if requireAuth() {
				permH.Set(w, r)
			}
		case r.Method == http.MethodDelete && isPermPath(r.URL.Path, ""):
			if requireAuth() {
				permH.Delete(w, r)
			}
		case r.Method == http.MethodPut && isHeadingPermPath(r.URL.Path):
			if requireAuth() {
				permH.SetHeading(w, r)
			}

		// ── Protected attachment routes ───────────────────────────────────────
		case r.Method == http.MethodPost && isDocPath(r.URL.Path, "/attachments"):
			if requireAuth() {
				attachH.Upload(w, r)
			}
		case r.Method == http.MethodGet && isDocPath(r.URL.Path, "/attachments"):
			if requireAuth() {
				attachH.List(w, r)
			}
		case r.Method == http.MethodGet && isAttachmentDownloadPath(r.URL.Path):
			if requireAuth() {
				attachH.Download(w, r)
			}
		case r.Method == http.MethodGet && isDocPath(r.URL.Path, "/attachments/unreferenced"):
			if requireAuth() {
				attachH.GetUnreferenced(w, r)
			}
		case r.Method == http.MethodDelete && isAttachmentPath(r.URL.Path, ""):
			if requireAuth() {
				attachH.Delete(w, r)
			}

		// ── Protected workspace routes ────────────────────────────────────────
		case r.Method == http.MethodGet && r.URL.Path == "/api/workspaces":
			if requireAuth() {
				workspaceH.List(w, r)
			}
		case r.Method == http.MethodPost && r.URL.Path == "/api/workspaces":
			if requireAuth() {
				workspaceH.Create(w, r)
			}
		case r.Method == http.MethodPatch && isWorkspacePath(r.URL.Path, ""):
			if requireAuth() {
				workspaceH.Update(w, r)
			}
		case r.Method == http.MethodPatch && isWorkspacePath(r.URL.Path, "/public"):
			if requireAuth() {
				workspaceH.SetPublicStatus(w, r)
			}
		case r.Method == http.MethodGet && isWorkspacePath(r.URL.Path, "/members"):
			if requireAuth() {
				workspaceH.ListMembers(w, r)
			}
		case r.Method == http.MethodPut && isWorkspacePath(r.URL.Path, "/members"):
			if requireAuth() {
				workspaceH.SetMember(w, r)
			}
		case r.Method == http.MethodDelete && isWorkspaceMemberPath(r.URL.Path):
			if requireAuth() {
				workspaceH.DeleteMember(w, r)
			}

		// ── Protected workspace attachment routes ─────────────────────────────
		case r.Method == http.MethodPost && isWorkspacePath(r.URL.Path, "/attachments"):
			if requireAuth() {
				workspaceAttachH.Upload(w, r)
			}
		case r.Method == http.MethodGet && isWorkspacePath(r.URL.Path, "/attachments"):
			if requireAuth() {
				workspaceAttachH.List(w, r)
			}
		case r.Method == http.MethodDelete && isWorkspaceAttachmentPath(r.URL.Path):
			if requireAuth() {
				workspaceAttachH.Delete(w, r)
			}
		case r.Method == http.MethodGet && isWorkspaceAttachmentDownloadPath(r.URL.Path):
			if requireAuth() {
				workspaceAttachH.Download(w, r)
			}

		default:
			http.NotFound(w, r)
		}
	}))

	// Protected routes wrapped in authMiddleware (non-document/workspace paths).
	protected := authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		// Auth
		case r.Method == http.MethodGet && r.URL.Path == "/api/auth/me":
			authH.Me(w, r)

		// User profile
		case r.Method == http.MethodGet && r.URL.Path == "/api/users/me/stats":
			userH.Stats(w, r)
		case r.Method == http.MethodPatch && r.URL.Path == "/api/users/me/password":
			userH.UpdatePassword(w, r)
		case r.Method == http.MethodPatch && r.URL.Path == "/api/users/me/preferences":
			userH.UpdatePreferences(w, r)

		// Snapshots (standalone /api/snapshots/ paths)
		case r.Method == http.MethodPost && isSnapPath(r.URL.Path, "/restore"):
			snapH.Restore(w, r)
		case r.Method == http.MethodGet && isSnapPath(r.URL.Path, "/diff"):
			snapH.Diff(w, r)

		// Attachments (standalone /api/attachments/ paths)
		case r.Method == http.MethodGet && isAttachmentDownloadPath(r.URL.Path):
			attachH.Download(w, r)
		case r.Method == http.MethodDelete && isAttachmentPath(r.URL.Path, ""):
			attachH.Delete(w, r)

		// Workspace attachments (standalone /api/workspace-attachments/ paths)
		case r.Method == http.MethodDelete && isWorkspaceAttachmentPath(r.URL.Path):
			workspaceAttachH.Delete(w, r)
		case r.Method == http.MethodGet && isWorkspaceAttachmentDownloadPath(r.URL.Path):
			workspaceAttachH.Download(w, r)

		default:
			http.NotFound(w, r)
		}
	}))

	// Route all document and workspace traffic through the unified handler.
	mux.Handle("/api/documents", docAndWorkspaceHandler)
	mux.Handle("/api/documents/", docAndWorkspaceHandler)
	mux.Handle("/api/workspaces", docAndWorkspaceHandler)
	mux.Handle("/api/workspaces/", docAndWorkspaceHandler)

	mux.Handle("/api/auth/me", protected)
	mux.Handle("/api/users/me", protected)
	mux.Handle("/api/users/me/", protected)
	mux.Handle("/api/snapshots/", protected)
	mux.Handle("/api/attachments/", protected)
	mux.Handle("/api/workspace-attachments/", protected)

	// WebSocket endpoint.
	mux.HandleFunc("/ws", hub.ServeWS)

	return &Server{mux: mux, hub: hub, static: staticFiles}
}

// ServeHTTP dispatches requests: API paths go to mux, everything else to the
// SPA static file handler.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/ws" {
		s.mux.ServeHTTP(w, r)
		return
	}

	// /documents/{id}/raw — rewrite to the API handler so it returns plain text
	// directly without requiring authentication (public documents are accessible
	// anonymously via optionalAuthMiddleware).
	if r.Method == http.MethodGet {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) == 3 && parts[0] == "documents" && parts[2] == "raw" {
			r2 := *r
			r2.URL.Path = "/api/documents/" + parts[1] + "/raw"
			s.mux.ServeHTTP(w, &r2)
			return
		}
	}

	// Serve uploaded files directly (handle both /uploads/ and /documents/uploads/)
	if strings.Contains(r.URL.Path, "/uploads/") {
		// Extract the uploads path - could be /uploads/... or /documents/uploads/...
		var filePath string
		if strings.HasPrefix(r.URL.Path, "/uploads/") {
			filePath = strings.TrimPrefix(r.URL.Path, "/")
		} else {
			// Extract from /documents/uploads/... or any other path containing /uploads/
			idx := strings.Index(r.URL.Path, "/uploads/")
			if idx >= 0 {
				filePath = r.URL.Path[idx+1:] // Remove leading slash
			}
		}

		if filePath != "" {
			http.ServeFile(w, r, filePath)
			return
		}
	}

	// Serve SPA.
	if s.static != nil {
		staticHandler := http.FileServer(http.FS(s.static))
		// Rewrite unknown paths to index.html for client-side routing.
		if _, err := fs.Stat(s.static, strings.TrimPrefix(r.URL.Path, "/")); err != nil {
			r2 := *r
			r2.URL.Path = "/"
			staticHandler.ServeHTTP(w, &r2)
			return
		}
		staticHandler.ServeHTTP(w, r)
		return
	}
	http.NotFound(w, r)
}

// isDocPath reports whether path matches /api/documents/{id}{suffix}.
func isDocPath(path, suffix string) bool {
	p := strings.TrimPrefix(path, "/api/documents/")
	if p == path {
		return false
	}
	parts := strings.SplitN(p, "/", 2)
	if len(parts) == 1 {
		return suffix == ""
	}
	return "/"+parts[1] == suffix
}

// isSnapPath reports whether path matches /api/snapshots/{id}{suffix}.
func isSnapPath(path, suffix string) bool {
	p := strings.TrimPrefix(path, "/api/snapshots/")
	if p == path {
		return false
	}
	parts := strings.SplitN(p, "/", 2)
	if len(parts) == 1 {
		return suffix == ""
	}
	return "/"+parts[1] == suffix
}

// isPermPath matches /api/documents/{id}/permissions/{userID}.
func isPermPath(path, suffix string) bool {
	p := strings.TrimPrefix(path, "/api/documents/")
	if p == path {
		return false
	}
	parts := strings.Split(p, "/")
	if len(parts) < 3 || parts[1] != "permissions" {
		return false
	}
	if suffix == "" {
		return len(parts) == 3
	}
	return len(parts) > 3 && "/"+strings.Join(parts[3:], "/") == suffix
}

// isHeadingPermPath matches /api/documents/{id}/permissions/{userID}/headings/{anchor}.
func isHeadingPermPath(path string) bool {
	p := strings.TrimPrefix(path, "/api/documents/")
	if p == path {
		return false
	}
	parts := strings.Split(p, "/")
	return len(parts) == 5 && parts[1] == "permissions" && parts[3] == "headings"
}

// isAttachmentPath matches /api/documents/{id}/attachments/{attachmentID}.
func isAttachmentPath(path, suffix string) bool {
	p := strings.TrimPrefix(path, "/api/documents/")
	if p == path {
		return false
	}
	parts := strings.Split(p, "/")
	if len(parts) < 3 || parts[1] != "attachments" {
		return false
	}
	if suffix == "" {
		return len(parts) == 3
	}
	return len(parts) > 3 && "/"+strings.Join(parts[3:], "/") == suffix
}

// isAttachmentDownloadPath matches /api/attachments/{id}/download.
func isAttachmentDownloadPath(path string) bool {
	p := strings.TrimPrefix(path, "/api/")
	if p == path {
		return false
	}
	parts := strings.Split(p, "/")
	return len(parts) == 3 && parts[0] == "attachments" && parts[2] == "download"
}

// isWorkspacePath reports whether path matches /api/workspaces/{id}{suffix}.
func isWorkspacePath(path, suffix string) bool {
	p := strings.TrimPrefix(path, "/api/workspaces/")
	if p == path {
		return false
	}
	parts := strings.SplitN(p, "/", 2)
	if len(parts) == 1 {
		return suffix == ""
	}
	return "/"+parts[1] == suffix
}

// isWorkspaceMemberPath matches /api/workspaces/{id}/members/{userID}.
func isWorkspaceMemberPath(path string) bool {
	p := strings.TrimPrefix(path, "/api/workspaces/")
	if p == path {
		return false
	}
	parts := strings.Split(p, "/")
	return len(parts) == 3 && parts[1] == "members"
}

// isWorkspaceAttachmentPath matches /api/workspaces/{id}/attachments/{attachmentID}.
func isWorkspaceAttachmentPath(path string) bool {
	p := strings.TrimPrefix(path, "/api/workspaces/")
	if p == path {
		return false
	}
	parts := strings.Split(p, "/")
	return len(parts) == 3 && parts[1] == "attachments"
}

// isWorkspaceAttachmentDownloadPath matches /api/workspace-attachments/{id}/download.
func isWorkspaceAttachmentDownloadPath(path string) bool {
	p := strings.TrimPrefix(path, "/api/")
	if p == path {
		return false
	}
	parts := strings.Split(p, "/")
	return len(parts) == 3 && parts[0] == "workspace-attachments" && parts[2] == "download"
}
