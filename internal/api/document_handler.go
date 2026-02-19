package api

import (
	"net/http"
	"strings"

	"markdownhub/internal/core"
)

// DocumentHandler handles document CRUD.
type DocumentHandler struct {
	docService *core.DocumentService
}

// NewDocumentHandler constructs a DocumentHandler.
func NewDocumentHandler(docService *core.DocumentService) *DocumentHandler {
	return &DocumentHandler{docService: docService}
}

// Create godoc
// POST /api/documents
func (h *DocumentHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	var body struct {
		Title       string `json:"title"`
		Content     string `json:"content"`
		WorkspaceID string `json:"workspace_id"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	doc, err := h.docService.CreateDocument(r.Context(), userID, body.WorkspaceID, body.Title, body.Content)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, doc)
}

// List godoc
// GET /api/documents
func (h *DocumentHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	items, err := h.docService.ListAllAccessibleDocumentsWithPermission(r.Context(), userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// Get godoc
// GET /api/documents/{id}
// Supports optional authentication for public documents
func (h *DocumentHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, _ := userIDFromContext(r.Context()) // Optional authentication
	docID := pathParam(r, "id")
	doc, err := h.docService.GetDocument(r.Context(), docID, userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

// GetRaw godoc
// GET /api/documents/{id}/raw
// Returns the raw markdown content with text/plain content type
func (h *DocumentHandler) GetRaw(w http.ResponseWriter, r *http.Request) {
	userID, _ := userIDFromContext(r.Context()) // Optional authentication
	docID := pathParam(r, "id")
	doc, err := h.docService.GetDocument(r.Context(), docID, userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(doc.Content))
}

// UpdateContent godoc
// PATCH /api/documents/{id}/content
func (h *DocumentHandler) UpdateContent(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	docID := pathParam(r, "id")
	var body struct {
		Content string `json:"content"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	doc, err := h.docService.UpdateContent(r.Context(), docID, userID, body.Content)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

// UpdateTitle godoc
// PATCH /api/documents/{id}/title
func (h *DocumentHandler) UpdateTitle(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	docID := pathParam(r, "id")
	var body struct {
		Title string `json:"title"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	doc, err := h.docService.UpdateTitle(r.Context(), docID, userID, body.Title)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

// Delete godoc
// DELETE /api/documents/{id}
func (h *DocumentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	docID := pathParam(r, "id")
	if err := h.docService.DeleteDocument(r.Context(), docID, userID); err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SetPublicStatus godoc
// PATCH /api/documents/{id}/public
func (h *DocumentHandler) SetPublicStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	docID := pathParam(r, "id")
	var body struct {
		IsPublic bool `json:"is_public"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	doc, err := h.docService.SetPublicStatus(r.Context(), docID, userID, body.IsPublic)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

// Reorder godoc
// PATCH /api/documents/reorder
func (h *DocumentHandler) Reorder(w http.ResponseWriter, r *http.Request) {
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
	if err := h.docService.ReorderDocuments(r.Context(), userID, body.IDs); err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Headings godoc
// GET /api/documents/{id}/headings
func (h *DocumentHandler) Headings(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	docID := pathParam(r, "id")
	doc, err := h.docService.GetDocument(r.Context(), docID, userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	sections := core.ParseHeadings(doc.Content)
	writeJSON(w, http.StatusOK, sections)
}

// ListPublicByWorkspace godoc
// GET /api/workspaces/{id}/documents
// Returns all public documents in a workspace. No authentication required.
func (h *DocumentHandler) ListPublicByWorkspace(w http.ResponseWriter, r *http.Request) {
	workspaceID := pathParamAt(r.URL.Path, 2)
	docs, err := h.docService.ListPublicDocumentsByWorkspace(r.Context(), workspaceID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, docs)
}

// pathParam extracts the last path segment named by key from a URL like
// /api/documents/{id}/... using a simple convention.
func pathParam(r *http.Request, _ string) string {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/"), "/")
	// For paths like /api/documents/{id} the ID is at index 2.
	// For sub-paths like /api/documents/{id}/content the ID is still index 2.
	if len(parts) >= 3 {
		return parts[2]
	}
	return ""
}
