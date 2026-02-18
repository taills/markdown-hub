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

	// Protected routes wrapped in authMiddleware.
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

		// Documents
		case r.Method == http.MethodPost && r.URL.Path == "/api/documents":
			docH.Create(w, r)
		case r.Method == http.MethodGet && r.URL.Path == "/api/documents":
			docH.List(w, r)
		case r.Method == http.MethodGet && isDocPath(r.URL.Path, ""):
			docH.Get(w, r)
		case r.Method == http.MethodPatch && isDocPath(r.URL.Path, "/content"):
			docH.UpdateContent(w, r)
		case r.Method == http.MethodPatch && isDocPath(r.URL.Path, "/title"):
			docH.UpdateTitle(w, r)
		case r.Method == http.MethodDelete && isDocPath(r.URL.Path, ""):
			docH.Delete(w, r)
		case r.Method == http.MethodGet && isDocPath(r.URL.Path, "/headings"):
			docH.Headings(w, r)

		// Snapshots
		case r.Method == http.MethodPost && isDocPath(r.URL.Path, "/snapshots"):
			snapH.Create(w, r)
		case r.Method == http.MethodGet && isDocPath(r.URL.Path, "/snapshots"):
			snapH.List(w, r)
		case r.Method == http.MethodPost && isSnapPath(r.URL.Path, "/restore"):
			snapH.Restore(w, r)
		case r.Method == http.MethodGet && isSnapPath(r.URL.Path, "/diff"):
			snapH.Diff(w, r)

		// Permissions
		case r.Method == http.MethodGet && isDocPath(r.URL.Path, "/permissions"):
			permH.List(w, r)
		case r.Method == http.MethodPut && isDocPath(r.URL.Path, "/permissions"):
			permH.Set(w, r)
		case r.Method == http.MethodDelete && isPermPath(r.URL.Path, ""):
			permH.Delete(w, r)
		case r.Method == http.MethodPut && isHeadingPermPath(r.URL.Path):
			permH.SetHeading(w, r)

		// Attachments
		case r.Method == http.MethodPost && isDocPath(r.URL.Path, "/attachments"):
			attachH.Upload(w, r)
		case r.Method == http.MethodGet && isDocPath(r.URL.Path, "/attachments"):
			attachH.List(w, r)
		case r.Method == http.MethodGet && isAttachmentDownloadPath(r.URL.Path):
			attachH.Download(w, r)
		case r.Method == http.MethodGet && isDocPath(r.URL.Path, "/attachments/unreferenced"):
			attachH.GetUnreferenced(w, r)
		case r.Method == http.MethodDelete && isAttachmentPath(r.URL.Path, ""):
			attachH.Delete(w, r)

		// Workspaces
		case r.Method == http.MethodPost && r.URL.Path == "/api/workspaces":
			workspaceH.Create(w, r)
		case r.Method == http.MethodGet && r.URL.Path == "/api/workspaces":
			workspaceH.List(w, r)
		case r.Method == http.MethodGet && isWorkspacePath(r.URL.Path, ""):
			workspaceH.Get(w, r)
		case r.Method == http.MethodPatch && isWorkspacePath(r.URL.Path, ""):
			workspaceH.Update(w, r)
		case r.Method == http.MethodGet && isWorkspacePath(r.URL.Path, "/members"):
			workspaceH.ListMembers(w, r)
		case r.Method == http.MethodPut && isWorkspacePath(r.URL.Path, "/members"):
			workspaceH.SetMember(w, r)
		case r.Method == http.MethodDelete && isWorkspaceMemberPath(r.URL.Path):
			workspaceH.DeleteMember(w, r)
		case r.Method == http.MethodPut && isWorkspacePath(r.URL.Path, "/default"):
			workspaceH.SetDefault(w, r)

		// Workspace attachments
		case r.Method == http.MethodPost && isWorkspacePath(r.URL.Path, "/attachments"):
			workspaceAttachH.Upload(w, r)
		case r.Method == http.MethodGet && isWorkspacePath(r.URL.Path, "/attachments"):
			workspaceAttachH.List(w, r)
		case r.Method == http.MethodDelete && isWorkspaceAttachmentPath(r.URL.Path):
			workspaceAttachH.Delete(w, r)
		case r.Method == http.MethodGet && isWorkspaceAttachmentDownloadPath(r.URL.Path):
			workspaceAttachH.Download(w, r)

		default:
			http.NotFound(w, r)
		}
	}))

	mux.Handle("/api/auth/me", protected)
	mux.Handle("/api/users/me", protected)
	mux.Handle("/api/users/me/", protected)
	mux.Handle("/api/documents", protected)
	mux.Handle("/api/documents/", protected)
	mux.Handle("/api/snapshots/", protected)
	mux.Handle("/api/attachments/", protected)
	mux.Handle("/api/workspaces", protected)
	mux.Handle("/api/workspaces/", protected)
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
