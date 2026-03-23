package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

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
func (h *PermissionHandler) List(c *gin.Context) {
	callerID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	docID := c.Param("id")
	if _, err := h.docService.GetDocument(c.Request.Context(), docID, callerID); err != nil {
		respondError(c, err)
		return
	}
	perms, err := h.permService.ListPermissions(c.Request.Context(), docID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, perms)
}

// Set godoc
// PUT /api/documents/{id}/permissions
// Request body: { "username": "john", "level": "edit" }
func (h *PermissionHandler) Set(c *gin.Context) {
	callerID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	docID := c.Param("id")

	var body struct {
		Username string `json:"username"`
		Level    string `json:"level"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}

	if body.Username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username is required"})
		return
	}

	level := models.PermissionLevel(body.Level)
	if level != models.PermissionRead && level != models.PermissionEdit && level != models.PermissionManage {
		c.JSON(http.StatusBadRequest, gin.H{"error": "level must be read, edit, or manage"})
		return
	}

	doc, err := h.docService.GetDocument(c.Request.Context(), docID, callerID)
	if err != nil {
		respondError(c, err)
		return
	}

	perm, err := h.permService.SetDocumentPermissionByUsername(c.Request.Context(), docID, callerID, doc.OwnerID, body.Username, level)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, perm)
}

// Delete godoc
// DELETE /api/documents/{id}/permissions/{userID}
func (h *PermissionHandler) Delete(c *gin.Context) {
	callerID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	docID := c.Param("id")
	targetUserID := c.Param("userId")

	doc, err := h.docService.GetDocument(c.Request.Context(), docID, callerID)
	if err != nil {
		respondError(c, err)
		return
	}
	if err := h.permService.RemoveDocumentPermission(c.Request.Context(), docID, callerID, doc.OwnerID, targetUserID); err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// SetHeading godoc
// PUT /api/documents/{id}/permissions/{userID}/headings/{anchor}
func (h *PermissionHandler) SetHeading(c *gin.Context) {
	callerID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	docID := c.Param("id")
	targetUserID := c.Param("userId")
	headingAnchor := c.Param("anchor")

	var body struct {
		Level string `json:"level"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	level := models.PermissionLevel(body.Level)

	doc, err := h.docService.GetDocument(c.Request.Context(), docID, callerID)
	if err != nil {
		respondError(c, err)
		return
	}
	perm, err := h.permService.SetHeadingPermission(c.Request.Context(), docID, callerID, doc.OwnerID, targetUserID, headingAnchor, level)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, perm)
}
