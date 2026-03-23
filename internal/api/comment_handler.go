package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"markdownhub/internal/core"
)

// CommentHandler handles comment CRUD.
type CommentHandler struct {
	commentService *core.CommentService
}

// NewCommentHandler constructs a CommentHandler.
func NewCommentHandler(commentService *core.CommentService) *CommentHandler {
	return &CommentHandler{commentService: commentService}
}

// ListComments godoc
// GET /api/documents/:id/comments
func (h *CommentHandler) ListComments(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	documentID := c.Param("id")
	comments, err := h.commentService.ListCommentsByDocument(c.Request.Context(), documentID, userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, comments)
}

// CreateComment godoc
// POST /api/documents/:id/comments
func (h *CommentHandler) CreateComment(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	documentID := c.Param("id")
	var body struct {
		Content       string  `json:"content"`
		HeadingAnchor *string `json:"heading_anchor,omitempty"`
		ParentID      *string `json:"parent_id,omitempty"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	comment, err := h.commentService.CreateComment(c.Request.Context(), documentID, userID, body.Content, body.HeadingAnchor, body.ParentID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, comment)
}

// UpdateComment godoc
// PUT /api/comments/:id
func (h *CommentHandler) UpdateComment(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	commentID := c.Param("id")
	var body struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	comment, err := h.commentService.UpdateComment(c.Request.Context(), commentID, userID, body.Content)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, comment)
}

// DeleteComment godoc
// DELETE /api/comments/:id
func (h *CommentHandler) DeleteComment(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	commentID := c.Param("id")
	if err := h.commentService.DeleteComment(c.Request.Context(), commentID, userID); err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
