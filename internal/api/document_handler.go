package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

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
func (h *DocumentHandler) Create(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var body struct {
		Title       string `json:"title"`
		Content     string `json:"content"`
		WorkspaceID string `json:"workspace_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	doc, err := h.docService.CreateDocument(c.Request.Context(), userID, body.WorkspaceID, body.Title, body.Content)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, doc)
}

// List godoc
// GET /api/documents
func (h *DocumentHandler) List(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	items, err := h.docService.ListAllAccessibleDocumentsWithPermission(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

// Get godoc
// GET /api/documents/{id}
// Supports optional authentication for public documents
func (h *DocumentHandler) Get(c *gin.Context) {
	userID, _ := getUserID(c) // Optional authentication
	docID := c.Param("id")
	doc, err := h.docService.GetDocument(c.Request.Context(), docID, userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, doc)
}

// GetRaw godoc
// GET /api/documents/{id}/raw
// Returns the raw markdown content with text/plain content type
func (h *DocumentHandler) GetRaw(c *gin.Context) {
	userID, _ := getUserID(c) // Optional authentication
	docID := c.Param("id")
	doc, err := h.docService.GetDocument(c.Request.Context(), docID, userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.String(http.StatusOK, doc.Content)
}

// UpdateContent godoc
// PATCH /api/documents/{id}/content
func (h *DocumentHandler) UpdateContent(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	docID := c.Param("id")
	var body struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	doc, err := h.docService.UpdateContent(c.Request.Context(), docID, userID, body.Content)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, doc)
}

// UpdateTitle godoc
// PATCH /api/documents/{id}/title
func (h *DocumentHandler) UpdateTitle(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	docID := c.Param("id")
	var body struct {
		Title string `json:"title"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	doc, err := h.docService.UpdateTitle(c.Request.Context(), docID, userID, body.Title)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, doc)
}

// Delete godoc
// DELETE /api/documents/{id}
func (h *DocumentHandler) Delete(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	docID := c.Param("id")
	if err := h.docService.DeleteDocument(c.Request.Context(), docID, userID); err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// SetPublicStatus godoc
// PATCH /api/documents/{id}/public
func (h *DocumentHandler) SetPublicStatus(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	docID := c.Param("id")
	var body struct {
		IsPublic bool `json:"is_public"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	doc, err := h.docService.SetPublicStatus(c.Request.Context(), docID, userID, body.IsPublic)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, doc)
}

// Reorder godoc
// PATCH /api/documents/reorder
func (h *DocumentHandler) Reorder(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	if err := h.docService.ReorderDocuments(c.Request.Context(), userID, body.IDs); err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// Headings godoc
// GET /api/documents/{id}/headings
func (h *DocumentHandler) Headings(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	docID := c.Param("id")
	doc, err := h.docService.GetDocument(c.Request.Context(), docID, userID)
	if err != nil {
		respondError(c, err)
		return
	}
	sections := core.ParseHeadings(doc.Content)
	c.JSON(http.StatusOK, sections)
}

// ListPublicByWorkspace godoc
// GET /api/workspaces/{id}/documents
// Returns all public documents in a workspace. No authentication required.
func (h *DocumentHandler) ListPublicByWorkspace(c *gin.Context) {
	workspaceID := c.Param("id")
	docs, err := h.docService.ListPublicDocumentsByWorkspace(c.Request.Context(), workspaceID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, docs)
}
