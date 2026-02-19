package api

import (
	"net/http"

	"markdownhub/internal/core"
	"markdownhub/internal/models"
)

// WorkspaceHandler handles workspace CRUD and membership.
type WorkspaceHandler struct {
	workspaceSvc *core.WorkspaceService
}

// NewWorkspaceHandler constructs a WorkspaceHandler.
func NewWorkspaceHandler(workspaceSvc *core.WorkspaceService) *WorkspaceHandler {
	return &WorkspaceHandler{workspaceSvc: workspaceSvc}
}

// Create godoc
// POST /api/workspaces
func (h *WorkspaceHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	ws, err := h.workspaceSvc.CreateWorkspace(r.Context(), userID, body.Name)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, ws)
}

// List godoc
// GET /api/workspaces
func (h *WorkspaceHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	workspaces, err := h.workspaceSvc.ListWorkspaces(r.Context(), userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, workspaces)
}

// Get godoc
// GET /api/workspaces/{id}
// Supports optional authentication for public workspaces
func (h *WorkspaceHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, _ := userIDFromContext(r.Context()) // Optional authentication
	workspaceID := pathParamAt(r.URL.Path, 2)
	ws, err := h.workspaceSvc.GetWorkspace(r.Context(), workspaceID, userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

// Update godoc
// PATCH /api/workspaces/{id}
func (h *WorkspaceHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	workspaceID := pathParamAt(r.URL.Path, 2)
	var body struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	ws, err := h.workspaceSvc.UpdateWorkspaceName(r.Context(), workspaceID, userID, body.Name)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

// ListMembers godoc
// GET /api/workspaces/{id}/members
func (h *WorkspaceHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	workspaceID := pathParamAt(r.URL.Path, 2)
	members, err := h.workspaceSvc.ListWorkspaceMembers(r.Context(), workspaceID, userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, members)
}

// SetMember godoc
// PUT /api/workspaces/{id}/members
func (h *WorkspaceHandler) SetMember(w http.ResponseWriter, r *http.Request) {
	callerID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	workspaceID := pathParamAt(r.URL.Path, 2)
	var body struct {
		Username string `json:"username"`
		Level    string `json:"level"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.Username == "" {
		writeError(w, http.StatusBadRequest, "username is required")
		return
	}
	level := models.PermissionLevel(body.Level)
	if level != models.PermissionRead && level != models.PermissionEdit && level != models.PermissionManage {
		writeError(w, http.StatusBadRequest, "level must be read, edit, or manage")
		return
	}
	member, err := h.workspaceSvc.SetWorkspaceMemberByUsername(r.Context(), workspaceID, callerID, body.Username, level)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, member)
}

// DeleteMember godoc
// DELETE /api/workspaces/{id}/members/{userID}
func (h *WorkspaceHandler) DeleteMember(w http.ResponseWriter, r *http.Request) {
	callerID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	workspaceID := pathParamAt(r.URL.Path, 2)
	targetUserID := pathParamAt(r.URL.Path, 4)
	if err := h.workspaceSvc.RemoveWorkspaceMember(r.Context(), workspaceID, callerID, targetUserID); err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SetPublicStatus godoc
// PATCH /api/workspaces/{id}/public
func (h *WorkspaceHandler) SetPublicStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	workspaceID := pathParamAt(r.URL.Path, 2)
	var body struct {
		IsPublic bool `json:"is_public"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	ws, err := h.workspaceSvc.SetPublicStatus(r.Context(), workspaceID, userID, body.IsPublic)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

// Reorder godoc
// PATCH /api/workspaces/reorder
func (h *WorkspaceHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := h.workspaceSvc.ReorderWorkspaces(r.Context(), userID, body.IDs); err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
