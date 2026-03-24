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

// WorkspaceAttachmentHandler manages workspace-level attachments.
type WorkspaceAttachmentHandler struct {
	attachSvc *core.AttachmentService
}

// NewWorkspaceAttachmentHandler constructs a WorkspaceAttachmentHandler.
func NewWorkspaceAttachmentHandler(attachSvc *core.AttachmentService) *WorkspaceAttachmentHandler {
	return &WorkspaceAttachmentHandler{attachSvc: attachSvc}
}

// Upload godoc
// POST /api/workspaces/{id}/attachments
// Content-Type: multipart/form-data
func (h *WorkspaceAttachmentHandler) Upload(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	workspaceID := c.Param("id")
	if workspaceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing workspace id"})
		return
	}

	file, fileHeader, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing file"})
		return
	}
	defer file.Close()

	fileData, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}

	fileName := fileHeader.Filename
	fileType := fileHeader.Header.Get("Content-Type")
	fileSize := int64(len(fileData))

	fileID := uuid.New().String()
	fileExt := filepath.Ext(fileName)
	filePath := filepath.Join("uploads", "workspaces", workspaceID, fileID+fileExt)

	uploadDir := filepath.Dir(filePath)
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create upload directory"})
		return
	}

	if err := os.WriteFile(filePath, fileData, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}

	attachment, err := h.attachSvc.UploadWorkspaceAttachment(
		c.Request.Context(),
		workspaceID,
		userID,
		fileName,
		fileType,
		fileSize,
		filePath,
	)
	if err != nil {
		os.Remove(filePath)
		respondError(c, err)
		return
	}

	c.JSON(http.StatusCreated, attachment)
}

// List godoc
// GET /api/workspaces/{id}/attachments
func (h *WorkspaceAttachmentHandler) List(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	workspaceID := c.Param("id")
	if workspaceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing workspace id"})
		return
	}

	attachments, err := h.attachSvc.ListWorkspaceAttachments(c.Request.Context(), workspaceID, userID)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, attachments)
}

// Delete godoc
// DELETE /api/workspaces/{id}/attachments/{attachmentID}
func (h *WorkspaceAttachmentHandler) Delete(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	attachmentID := c.Param("attachmentId")
	if attachmentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing attachment id"})
		return
	}

	attachment, err := h.attachSvc.GetAttachmentForDownload(c.Request.Context(), attachmentID, userID)
	if err != nil {
		respondError(c, err)
		return
	}

	if err := h.attachSvc.DeleteAttachment(c.Request.Context(), attachmentID, userID, "", ""); err != nil {
		respondError(c, err)
		return
	}

	if err := os.Remove(attachment.FilePath); err != nil && !os.IsNotExist(err) {
		fmt.Printf("warning: failed to delete file %s: %v\n", attachment.FilePath, err)
	}

	c.Status(http.StatusNoContent)
}

// Download godoc
// GET /api/workspace-attachments/{id}/download
func (h *WorkspaceAttachmentHandler) Download(c *gin.Context) {
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

	encodedFilename := url.QueryEscape(attachment.Filename)
	disposition := fmt.Sprintf("attachment; filename*=UTF-8''%s", encodedFilename)
	c.Header("Content-Disposition", disposition)

	c.File(attachment.FilePath)
}
