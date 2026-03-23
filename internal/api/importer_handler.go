package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"markdownhub/internal/core"
)

// ImporterHandler handles article import requests.
type ImporterHandler struct {
	importerSvc *core.ImporterService
}

// NewImporterHandler constructs an ImporterHandler.
func NewImporterHandler(importerSvc *core.ImporterService) *ImporterHandler {
	return &ImporterHandler{importerSvc: importerSvc}
}

// ImportURLRequest represents the request body for importing from URL.
type ImportURLRequest struct {
	URL   string `json:"url" binding:"required"`
	Title string `json:"title"`
}

// ImportContentRequest represents the request body for importing from HTML content.
type ImportContentRequest struct {
	Title   string `json:"title"`
	HTML    string `json:"html" binding:"required"`
	BaseURL string `json:"base_url"`
}

// ImportResponse represents the response for an import request.
type ImportResponse struct {
	DocumentID string `json:"document_id"`
	Title      string `json:"title"`
	URL        string `json:"url,omitempty"`
}

// ImportFromURL handles importing an article from a URL.
func (h *ImporterHandler) ImportFromURL(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req ImportURLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.importerSvc.ImportFromURL(c.Request.Context(), userID, req.URL, req.Title)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, ImportResponse{
		DocumentID: result.DocumentID,
		Title:      result.Title,
		URL:        result.URL,
	})
}

// ImportFromContent handles importing an article from HTML content.
func (h *ImporterHandler) ImportFromContent(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req ImportContentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.importerSvc.ImportFromContent(c.Request.Context(), userID, req.Title, req.HTML, req.BaseURL)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, ImportResponse{
		DocumentID: result.DocumentID,
		Title:      result.Title,
		URL:        result.URL,
	})
}
