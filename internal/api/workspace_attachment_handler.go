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
func (h *WorkspaceAttachmentHandler) Upload(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	workspaceID := pathParamAt(r.URL.Path, 2)
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "missing workspace id")
		return
	}

	if err := r.ParseMultipartForm(100 * 1024 * 1024); err != nil {
		writeError(w, http.StatusBadRequest, "failed to parse form")
		return
	}

	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing file")
		return
	}
	defer file.Close()

	fileData, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read file")
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
		writeError(w, http.StatusInternalServerError, "failed to create upload directory")
		return
	}

	if err := os.WriteFile(filePath, fileData, 0644); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save file")
		return
	}

	attachment, err := h.attachSvc.UploadWorkspaceAttachment(
		r.Context(),
		workspaceID,
		userID,
		fileName,
		fileType,
		fileSize,
		filePath,
	)
	if err != nil {
		os.Remove(filePath)
		writeError(w, errStatus(err), err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, attachment)
}

// List godoc
// GET /api/workspaces/{id}/attachments
func (h *WorkspaceAttachmentHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	workspaceID := pathParamAt(r.URL.Path, 2)
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "missing workspace id")
		return
	}

	attachments, err := h.attachSvc.ListWorkspaceAttachments(r.Context(), workspaceID, userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}

	writeJSON(w, http.StatusOK, attachments)
}

// Delete godoc
// DELETE /api/workspaces/{id}/attachments/{attachmentID}
func (h *WorkspaceAttachmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	attachmentID := pathParamAt(r.URL.Path, 4)
	if attachmentID == "" {
		writeError(w, http.StatusBadRequest, "missing attachment id")
		return
	}

	attachment, err := h.attachSvc.GetAttachmentForDownload(r.Context(), attachmentID, userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}

	if err := h.attachSvc.DeleteAttachment(r.Context(), attachmentID, userID, "", ""); err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}

	if err := os.Remove(attachment.FilePath); err != nil && !os.IsNotExist(err) {
		fmt.Printf("warning: failed to delete file %s: %v\n", attachment.FilePath, err)
	}

	w.WriteHeader(http.StatusNoContent)
}

// Download godoc
// GET /api/workspace-attachments/{id}/download
func (h *WorkspaceAttachmentHandler) Download(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	attachmentID := pathParamAt(r.URL.Path, 2)
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

	encodedFilename := url.QueryEscape(attachment.Filename)
	disposition := fmt.Sprintf("attachment; filename*=UTF-8''%s", encodedFilename)
	w.Header().Set("Content-Disposition", disposition)

	http.ServeFile(w, r, attachment.FilePath)
}
