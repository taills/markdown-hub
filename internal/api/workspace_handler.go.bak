package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

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
func (h *WorkspaceHandler) Create(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	ipAddress := getClientIP(c.Request)
	userAgent := c.GetHeader("User-Agent")
	ws, err := h.workspaceSvc.CreateWorkspace(c.Request.Context(), userID, body.Name, ipAddress, userAgent)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, ws)
}

// List godoc
// GET /api/workspaces
func (h *WorkspaceHandler) List(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	workspaces, err := h.workspaceSvc.ListWorkspaces(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, workspaces)
}

// Get godoc
// GET /api/workspaces/{id}
// Supports optional authentication for public workspaces
func (h *WorkspaceHandler) Get(c *gin.Context) {
	userID, _ := getUserID(c) // Optional authentication
	workspaceID := c.Param("id")
	ws, err := h.workspaceSvc.GetWorkspace(c.Request.Context(), workspaceID, userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, ws)
}

// Update godoc
// PATCH /api/workspaces/{id}
func (h *WorkspaceHandler) Update(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	workspaceID := c.Param("id")
	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	ws, err := h.workspaceSvc.UpdateWorkspaceName(c.Request.Context(), workspaceID, userID, body.Name)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, ws)
}

// ListMembers godoc
// GET /api/workspaces/{id}/members
func (h *WorkspaceHandler) ListMembers(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	workspaceID := c.Param("id")
	members, err := h.workspaceSvc.ListWorkspaceMembers(c.Request.Context(), workspaceID, userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, members)
}

// SetMember godoc
// PUT /api/workspaces/{id}/members
func (h *WorkspaceHandler) SetMember(c *gin.Context) {
	callerID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	workspaceID := c.Param("id")
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
	ipAddress := getClientIP(c.Request)
	userAgent := c.GetHeader("User-Agent")
	member, err := h.workspaceSvc.SetWorkspaceMemberByUsername(c.Request.Context(), workspaceID, callerID, body.Username, level, ipAddress, userAgent)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, member)
}

// DeleteMember godoc
// DELETE /api/workspaces/{id}/members/{userID}
func (h *WorkspaceHandler) DeleteMember(c *gin.Context) {
	callerID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	workspaceID := c.Param("id")
	targetUserID := c.Param("userId")
	ipAddress := getClientIP(c.Request)
	userAgent := c.GetHeader("User-Agent")
	if err := h.workspaceSvc.RemoveWorkspaceMember(c.Request.Context(), workspaceID, callerID, targetUserID, ipAddress, userAgent); err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// SetPublicStatus godoc
// PATCH /api/workspaces/{id}/public
func (h *WorkspaceHandler) SetPublicStatus(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	workspaceID := c.Param("id")
	var body struct {
		IsPublic bool `json:"is_public"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	ws, err := h.workspaceSvc.SetPublicStatus(c.Request.Context(), workspaceID, userID, body.IsPublic)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, ws)
}

// Reorder godoc
// PATCH /api/workspaces/reorder
func (h *WorkspaceHandler) Reorder(c *gin.Context) {
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
	if err := h.workspaceSvc.ReorderWorkspaces(c.Request.Context(), userID, body.IDs); err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// DeleteWorkspace godoc
// DELETE /api/workspaces/:id
func (h *WorkspaceHandler) DeleteWorkspace(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	workspaceID := c.Param("id")

	ipAddress := c.ClientIP()
	userAgent := c.Request.UserAgent()

	err := h.workspaceSvc.DeleteWorkspace(c.Request.Context(), workspaceID, userID, ipAddress, userAgent)
	if err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
