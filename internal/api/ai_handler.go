package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"markdownhub/internal/core"
)

// AIHandler handles AI-related HTTP requests.
type AIHandler struct {
	aiService *core.AIService
}

// NewAIHandler constructs an AIHandler.
func NewAIHandler(aiService *core.AIService) *AIHandler {
	return &AIHandler{aiService: aiService}
}

// ListConversations godoc
// GET /api/documents/:id/ai/conversations
func (h *AIHandler) ListConversations(c *gin.Context) {
	_, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	docID := c.Param("id")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	convs, err := h.aiService.ListConversationsByDocument(c.Request.Context(), docID, limit, offset)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, convs)
}

// GetMessages godoc
// GET /api/ai/conversations/:conversationId/messages
func (h *AIHandler) GetMessages(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	conversationID := c.Param("conversationId")

	// Verify user has access to this conversation
	conv, err := h.aiService.GetConversation(c.Request.Context(), conversationID)
	if err != nil {
		respondError(c, err)
		return
	}

	// Check if user owns the conversation or has access to the document
	if conv.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	messages, err := h.aiService.ListMessages(c.Request.Context(), conversationID)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, messages)
}

// CreateConversation godoc
// POST /api/documents/:id/ai/conversations
func (h *AIHandler) CreateConversation(c *gin.Context) {
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

	title := body.Title
	if title == "" {
		title = "新对话"
	}

	conv, err := h.aiService.CreateConversation(c.Request.Context(), userID, docID, title)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusCreated, conv)
}

// DeleteConversation godoc
// DELETE /api/ai/conversations/:conversationId
func (h *AIHandler) DeleteConversation(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	conversationID := c.Param("conversationId")

	// Verify user owns the conversation
	conv, err := h.aiService.GetConversation(c.Request.Context(), conversationID)
	if err != nil {
		respondError(c, err)
		return
	}

	if conv.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	if err := h.aiService.DeleteConversation(c.Request.Context(), conversationID); err != nil {
		respondError(c, err)
		return
	}

	c.Status(http.StatusNoContent)
}

// Ask godoc
// POST /api/documents/:id/ai/ask
func (h *AIHandler) Ask(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	docID := c.Param("id")
	var body struct {
		ConversationID string `json:"conversation_id"`
		Question       string `json:"question"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}

	if body.Question == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "question is required"})
		return
	}

	// Get or create conversation
	var convID string
	if body.ConversationID != "" {
		// Verify conversation belongs to user
		conv, err := h.aiService.GetConversation(c.Request.Context(), body.ConversationID)
		if err != nil {
			respondError(c, err)
			return
		}
		if conv.UserID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		convID = body.ConversationID
	} else {
		// Create new conversation
		conv, err := h.aiService.CreateConversation(c.Request.Context(), userID, docID, "AI 问答")
		if err != nil {
			respondError(c, err)
			return
		}
		convID = conv.ID
	}

	// Check if AI is configured
	if !h.aiService.IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service not configured"})
		return
	}

	// Use a simple approach - the Ask function will handle streaming internally
	err := h.aiService.Ask(c.Request.Context(), convID, body.Question, nil)
	if err != nil {
		respondError(c, err)
		return
	}

	// Get the latest messages including the response
	messages, err := h.aiService.ListMessages(c.Request.Context(), convID)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"conversation_id": convID,
		"messages":        messages,
	})
}

// Summarize godoc
// POST /api/documents/:id/ai/summarize
func (h *AIHandler) Summarize(c *gin.Context) {
	_, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	docID := c.Param("id")

	if !h.aiService.IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service not configured"})
		return
	}

	summary, err := h.aiService.Summarize(c.Request.Context(), docID)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"summary": summary,
	})
}

// Complete godoc
// POST /api/documents/:id/ai/complete
func (h *AIHandler) Complete(c *gin.Context) {
	_, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	docID := c.Param("id")
	var body struct {
		Text string `json:"text"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}

	if body.Text == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "text is required"})
		return
	}

	if !h.aiService.IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service not configured"})
		return
	}

	completion, err := h.aiService.Complete(c.Request.Context(), docID, body.Text)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"completion": completion,
	})
}

// Expand godoc
// POST /api/documents/:id/ai/expand
func (h *AIHandler) Expand(c *gin.Context) {
	_, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	docID := c.Param("id")
	var body struct {
		Paragraph string `json:"paragraph"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}

	if body.Paragraph == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "paragraph is required"})
		return
	}

	if !h.aiService.IsConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service not configured"})
		return
	}

	expanded, err := h.aiService.Expand(c.Request.Context(), docID, body.Paragraph)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"expanded": expanded,
	})
}
