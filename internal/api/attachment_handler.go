package api

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"markdownhub/internal/core"
)

// AttachmentHandler manages document attachments (uploads, downloads, deletions).
type AttachmentHandler struct {
	attachSvc *core.AttachmentService
	docSvc    *core.DocumentService
}

// NewAttachmentHandler constructs an AttachmentHandler.
func NewAttachmentHandler(attachSvc *core.AttachmentService, docSvc *core.DocumentService) *AttachmentHandler {
	return &AttachmentHandler{attachSvc: attachSvc, docSvc: docSvc}
}

// Upload godoc
// POST /api/documents/{id}/attachments
// Content-Type: multipart/form-data
func (h *AttachmentHandler) Upload(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	docID := c.Param("id")
	doc, err := h.docSvc.GetDocument(c.Request.Context(), docID, userID)
	if err != nil {
		respondError(c, err)
		return
	}

	// Get uploaded file
	file, fileHeader, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing file"})
		return
	}
	defer file.Close()

	// Read file content
	fileData, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}

	fileName := fileHeader.Filename
	fileType := fileHeader.Header.Get("Content-Type")
	fileSize := int64(len(fileData))

	// Create unique file path
	fileID := uuid.New().String()
	fileExt := filepath.Ext(fileName)
	filePath := filepath.Join("uploads", docID, fileID+fileExt)

	// Ensure upload directory exists
	uploadDir := filepath.Dir(filePath)
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create upload directory"})
		return
	}

	// Write file to disk
	if err := os.WriteFile(filePath, fileData, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}

	// Create attachment record in database
	attachment, err := h.attachSvc.UploadAttachment(
		c.Request.Context(),
		doc.WorkspaceID,
		docID,
		userID,
		doc.OwnerID,
		fileName,
		fileType,
		fileSize,
		filePath,
	)
	if err != nil {
		// Clean up file if database operation fails
		os.Remove(filePath)
		respondError(c, err)
		return
	}

	c.JSON(http.StatusCreated, attachment)
}

// List godoc
// GET /api/documents/{id}/attachments
func (h *AttachmentHandler) List(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	docID := c.Param("id")
	doc, err := h.docSvc.GetDocument(c.Request.Context(), docID, userID)
	if err != nil {
		respondError(c, err)
		return
	}

	attachments, err := h.attachSvc.ListAttachments(c.Request.Context(), doc.WorkspaceID, docID, userID, doc.OwnerID)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, attachments)
}

// Delete godoc
// DELETE /api/documents/{id}/attachments/{attachmentID}
func (h *AttachmentHandler) Delete(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	docID := c.Param("id")
	attachmentID := c.Param("attachmentId")

	doc, err := h.docSvc.GetDocument(c.Request.Context(), docID, userID)
	if err != nil {
		respondError(c, err)
		return
	}

	// Get attachment to get file path for deletion
	attachment, err := h.attachSvc.GetAttachment(c.Request.Context(), attachmentID, userID, doc.OwnerID, docID)
	if err != nil {
		respondError(c, err)
		return
	}

	// Delete from database first
	if err := h.attachSvc.DeleteAttachment(c.Request.Context(), attachmentID, userID, doc.OwnerID, docID); err != nil {
		respondError(c, err)
		return
	}

	// Then delete file from disk
	if err := os.Remove(attachment.FilePath); err != nil && !os.IsNotExist(err) {
		// Log error but don't fail the response since database operation succeeded
		fmt.Printf("warning: failed to delete file %s: %v\n", attachment.FilePath, err)
	}

	c.Status(http.StatusNoContent)
}

// GetUnreferenced godoc
// GET /api/documents/{id}/attachments/unreferenced
func (h *AttachmentHandler) GetUnreferenced(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	docID := c.Param("id")
	doc, err := h.docSvc.GetDocument(c.Request.Context(), docID, userID)
	if err != nil {
		respondError(c, err)
		return
	}

	attachments, err := h.attachSvc.GetUnreferencedAttachments(c.Request.Context(), doc.WorkspaceID, docID, userID, doc.OwnerID)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, attachments)
}

// Download godoc
// GET /api/attachments/{id}/download
func (h *AttachmentHandler) Download(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	attachmentID := c.Param("id")
	if attachmentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing attachment id"})
		return
	}

	attachment, err := h.attachSvc.GetAttachmentForDownload(c.Request.Context(), attachmentID, userID)
	if err != nil {
		respondError(c, err)
		return
	}

	if attachment.FileType != "" {
		c.Header("Content-Type", attachment.FileType)
	}

	// Set Content-Disposition with RFC 5987 encoding for filename*
	// This ensures the correct original filename is used when downloading
	encodedFilename := url.QueryEscape(attachment.Filename)
	disposition := fmt.Sprintf("attachment; filename*=UTF-8''%s", encodedFilename)
	c.Header("Content-Disposition", disposition)

	c.File(attachment.FilePath)
}
