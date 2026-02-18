package api

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"

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
func (h *AttachmentHandler) Upload(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	docID := pathParam(r, "id")
	doc, err := h.docSvc.GetDocument(r.Context(), docID, userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}

	// Parse multipart form with max 100MB files
	if err := r.ParseMultipartForm(100 * 1024 * 1024); err != nil {
		writeError(w, http.StatusBadRequest, "failed to parse form")
		return
	}

	// Get uploaded file
	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing file")
		return
	}
	defer file.Close()

	// Read file content
	fileData, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read file")
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
		writeError(w, http.StatusInternalServerError, "failed to create upload directory")
		return
	}

	// Write file to disk
	if err := os.WriteFile(filePath, fileData, 0644); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	// Create attachment record in database
	attachment, err := h.attachSvc.UploadAttachment(
		r.Context(),
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
		writeError(w, errStatus(err), err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, attachment)
}

// List godoc
// GET /api/documents/{id}/attachments
func (h *AttachmentHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	docID := pathParam(r, "id")
	doc, err := h.docSvc.GetDocument(r.Context(), docID, userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}

	attachments, err := h.attachSvc.ListAttachments(r.Context(), docID, userID, doc.OwnerID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}

	writeJSON(w, http.StatusOK, attachments)
}

// Delete godoc
// DELETE /api/documents/{id}/attachments/{attachmentID}
func (h *AttachmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	docID := pathParam(r, "id")
	attachmentID := pathParamAt(r.URL.Path, 4) // /api/documents/{id}/attachments/{attachmentID}

	doc, err := h.docSvc.GetDocument(r.Context(), docID, userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}

	// Get attachment to get file path for deletion
	attachment, err := h.attachSvc.GetAttachment(r.Context(), attachmentID, userID, doc.OwnerID, docID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}

	// Delete from database first
	if err := h.attachSvc.DeleteAttachment(r.Context(), attachmentID, userID, doc.OwnerID, docID); err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}

	// Then delete file from disk
	if err := os.Remove(attachment.FilePath); err != nil && !os.IsNotExist(err) {
		// Log error but don't fail the response since database operation succeeded
		fmt.Printf("warning: failed to delete file %s: %v\n", attachment.FilePath, err)
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetUnreferenced godoc
// GET /api/documents/{id}/attachments/unreferenced
func (h *AttachmentHandler) GetUnreferenced(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	docID := pathParam(r, "id")
	doc, err := h.docSvc.GetDocument(r.Context(), docID, userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}

	attachments, err := h.attachSvc.GetUnreferencedAttachments(r.Context(), docID, userID, doc.OwnerID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}

	writeJSON(w, http.StatusOK, attachments)
}

// Download godoc
// GET /api/attachments/{id}/download
func (h *AttachmentHandler) Download(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	attachmentID := pathParamAt(r.URL.Path, 2) // /api/attachments/{id}/download
	if attachmentID == "" {
		writeError(w, http.StatusBadRequest, "missing attachment id")
		return
	}

	attachment, err := h.attachSvc.GetAttachmentForDownload(r.Context(), attachmentID, userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}

	if attachment.FileType != "" {
		w.Header().Set("Content-Type", attachment.FileType)
	}

	// Set Content-Disposition with RFC 5987 encoding for filename*
	// This ensures the correct original filename is used when downloading
	encodedFilename := url.QueryEscape(attachment.Filename)
	disposition := fmt.Sprintf("attachment; filename*=UTF-8''%s", encodedFilename)
	w.Header().Set("Content-Disposition", disposition)

	http.ServeFile(w, r, attachment.FilePath)
}
