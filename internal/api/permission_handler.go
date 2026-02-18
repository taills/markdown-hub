package api

import (
	"net/http"
	"strings"

	"markdownhub/internal/core"
	"markdownhub/internal/models"
)

// PermissionHandler manages document and heading-level permissions.
type PermissionHandler struct {
	permService *core.PermissionService
	docService  *core.DocumentService
}

// NewPermissionHandler constructs a PermissionHandler.
func NewPermissionHandler(permService *core.PermissionService, docService *core.DocumentService) *PermissionHandler {
	return &PermissionHandler{permService: permService, docService: docService}
}

// List godoc
// GET /api/documents/{id}/permissions
func (h *PermissionHandler) List(w http.ResponseWriter, r *http.Request) {
	callerID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	docID := pathParam(r, "id")
	if _, err := h.docService.GetDocument(r.Context(), docID, callerID); err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	perms, err := h.permService.ListPermissions(r.Context(), docID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, perms)
}

// Set godoc
// PUT /api/documents/{id}/permissions
// Request body: { "username": "john", "level": "edit" }
func (h *PermissionHandler) Set(w http.ResponseWriter, r *http.Request) {
	callerID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	docID := pathParam(r, "id")

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

	doc, err := h.docService.GetDocument(r.Context(), docID, callerID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}

	perm, err := h.permService.SetDocumentPermissionByUsername(r.Context(), doc.WorkspaceID, docID, callerID, doc.OwnerID, body.Username, level)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, perm)
}

// Delete godoc
// DELETE /api/documents/{id}/permissions/{userID}
func (h *PermissionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	callerID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	docID := pathParam(r, "id")
	targetUserID := pathParamAt(r.URL.Path, 4)

	doc, err := h.docService.GetDocument(r.Context(), docID, callerID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	if err := h.permService.RemoveDocumentPermission(r.Context(), doc.WorkspaceID, docID, callerID, doc.OwnerID, targetUserID); err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SetHeading godoc
// PUT /api/documents/{id}/permissions/{userID}/headings/{anchor}
func (h *PermissionHandler) SetHeading(w http.ResponseWriter, r *http.Request) {
	callerID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	docID := pathParam(r, "id")
	targetUserID := pathParamAt(r.URL.Path, 4)
	headingAnchor := pathParamAt(r.URL.Path, 6)

	var body struct {
		Level string `json:"level"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	level := models.PermissionLevel(body.Level)

	doc, err := h.docService.GetDocument(r.Context(), docID, callerID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	perm, err := h.permService.SetHeadingPermission(r.Context(), doc.WorkspaceID, docID, callerID, doc.OwnerID, targetUserID, headingAnchor, level)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, perm)
}

// pathParamAt extracts the segment at position idx (0-indexed, after splitting
// the path by "/") from a URL path.
func pathParamAt(path string, idx int) string {
	parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
	if idx < len(parts) {
		return parts[idx]
	}
	return ""
}
