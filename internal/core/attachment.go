package core

import (
	"context"
	"fmt"
	"path/filepath"

	"markdownhub/internal/models"
	"markdownhub/internal/store"
)

// AttachmentService manages document attachments (files, images, etc.).
type AttachmentService struct {
	db          *store.DB
	permService *PermissionService
}

// NewAttachmentService constructs an AttachmentService.
func NewAttachmentService(db *store.DB, permService *PermissionService) *AttachmentService {
	return &AttachmentService{db: db, permService: permService}
}

// UploadAttachment uploads a file attachment to a document.
// The uploader must have edit permission on the document.
func (s *AttachmentService) UploadAttachment(
	ctx context.Context,
	workspaceID, documentID, uploaderID, ownerID, filename, fileType string,
	fileSize int64,
	filePath string,
) (*models.Attachment, error) {
	if err := s.requireWorkspaceOrDocumentPermission(ctx, workspaceID, documentID, uploaderID, ownerID, models.PermissionEdit); err != nil {
		return nil, err
	}

	// Validate file
	if filename == "" {
		return nil, fmt.Errorf("%w: filename is required", ErrInvalidInput)
	}
	if fileSize <= 0 {
		return nil, fmt.Errorf("%w: invalid file size", ErrInvalidInput)
	}

	// Create attachment record
	attachment, err := s.db.CreateAttachment(ctx, workspaceID, &documentID, uploaderID, filename, fileType, fileSize, filePath)
	if err != nil {
		return nil, fmt.Errorf("create attachment: %w", err)
	}
	return attachment, nil
}

// UploadWorkspaceAttachment uploads an attachment directly to a workspace.
func (s *AttachmentService) UploadWorkspaceAttachment(
	ctx context.Context,
	workspaceID, uploaderID, filename, fileType string,
	fileSize int64,
	filePath string,
) (*models.Attachment, error) {
	if err := s.permService.RequireWorkspacePermission(ctx, workspaceID, uploaderID, models.PermissionEdit); err != nil {
		return nil, err
	}
	if filename == "" {
		return nil, fmt.Errorf("%w: filename is required", ErrInvalidInput)
	}
	if fileSize <= 0 {
		return nil, fmt.Errorf("%w: invalid file size", ErrInvalidInput)
	}
	attachment, err := s.db.CreateAttachment(ctx, workspaceID, nil, uploaderID, filename, fileType, fileSize, filePath)
	if err != nil {
		return nil, fmt.Errorf("create attachment: %w", err)
	}
	return attachment, nil
}

// GetAttachment retrieves an attachment. The caller must have read permission on the document.
func (s *AttachmentService) GetAttachment(
	ctx context.Context,
	attachmentID, userID, ownerID string,
	documentID string,
) (*models.Attachment, error) {
	attachment, err := s.db.GetAttachmentByID(ctx, attachmentID)
	if err != nil {
		return nil, err
	}
	if err := s.requireWorkspaceOrDocumentPermission(ctx, attachment.WorkspaceID, documentID, userID, ownerID, models.PermissionRead); err != nil {
		return nil, err
	}
	return attachment, nil
}

// GetAttachmentForDownload retrieves an attachment after validating read permission.
func (s *AttachmentService) GetAttachmentForDownload(
	ctx context.Context,
	attachmentID, userID string,
) (*models.Attachment, error) {
	attachment, err := s.db.GetAttachmentByID(ctx, attachmentID)
	if err != nil {
		return nil, err
	}
	if attachment.DocumentID != nil {
		doc, err := s.db.GetDocumentByID(ctx, *attachment.DocumentID)
		if err != nil {
			return nil, err
		}
		if err := s.requireWorkspaceOrDocumentPermission(ctx, attachment.WorkspaceID, *attachment.DocumentID, userID, doc.OwnerID, models.PermissionRead); err != nil {
			return nil, err
		}
	} else {
		if err := s.permService.RequireWorkspacePermission(ctx, attachment.WorkspaceID, userID, models.PermissionRead); err != nil {
			return nil, err
		}
	}
	return attachment, nil
}

// ListAttachments returns all attachments for a document.
func (s *AttachmentService) ListAttachments(
	ctx context.Context,
	workspaceID, documentID, userID, ownerID string,
) ([]*models.Attachment, error) {
	if err := s.requireWorkspaceOrDocumentPermission(ctx, workspaceID, documentID, userID, ownerID, models.PermissionRead); err != nil {
		return nil, err
	}
	return s.db.ListDocumentAttachments(ctx, documentID)
}

// ListWorkspaceAttachments returns workspace-level attachments (not tied to a document).
func (s *AttachmentService) ListWorkspaceAttachments(
	ctx context.Context,
	workspaceID, userID string,
) ([]*models.Attachment, error) {
	if err := s.permService.RequireWorkspacePermission(ctx, workspaceID, userID, models.PermissionRead); err != nil {
		return nil, err
	}
	return s.db.ListWorkspaceAttachments(ctx, workspaceID)
}

// DeleteAttachment removes an attachment. The caller must have manage permission.
func (s *AttachmentService) DeleteAttachment(
	ctx context.Context,
	attachmentID, userID, ownerID, documentID string,
) error {
	attachment, err := s.db.GetAttachmentByID(ctx, attachmentID)
	if err != nil {
		return err
	}
	if attachment.DocumentID != nil {
		if err := s.requireWorkspaceOrDocumentPermission(ctx, attachment.WorkspaceID, *attachment.DocumentID, userID, ownerID, models.PermissionManage); err != nil {
			return err
		}
	} else {
		if err := s.permService.RequireWorkspacePermission(ctx, attachment.WorkspaceID, userID, models.PermissionManage); err != nil {
			return err
		}
	}
	return s.db.DeleteAttachment(ctx, attachmentID)
}

// GetUnreferencedAttachments returns attachments in a document that are not referenced in the content.
func (s *AttachmentService) GetUnreferencedAttachments(
	ctx context.Context,
	workspaceID, documentID, userID, ownerID string,
) ([]*models.Attachment, error) {
	if err := s.requireWorkspaceOrDocumentPermission(ctx, workspaceID, documentID, userID, ownerID, models.PermissionRead); err != nil {
		return nil, err
	}

	// Get document content
	doc, err := s.db.GetDocumentByID(ctx, documentID)
	if err != nil {
		return nil, fmt.Errorf("get document: %w", err)
	}

	// Get all attachments for this document
	allAttachments, err := s.db.ListDocumentAttachments(ctx, documentID)
	if err != nil {
		return nil, fmt.Errorf("list attachments: %w", err)
	}

	// Parse content to find referenced attachments
	referencedFilenames := parseMarkdownReferences(doc.Content)

	// Filter out referenced attachments
	var unreferenced []*models.Attachment
	for _, att := range allAttachments {
		baseName := filepath.Base(att.FilePath)
		if !contains(referencedFilenames, baseName) {
			unreferenced = append(unreferenced, att)
		}
	}
	return unreferenced, nil
}

// CreateReference creates a reference from an attachment to a location in the document content.
func (s *AttachmentService) CreateReference(
	ctx context.Context,
	attachmentID, documentID string,
	referencedAt int,
) (*models.AttachmentReference, error) {
	return s.db.CreateAttachmentReference(ctx, attachmentID, documentID, referencedAt)
}

func (s *AttachmentService) requireWorkspaceOrDocumentPermission(
	ctx context.Context,
	workspaceID, documentID, userID, ownerID string,
	required models.PermissionLevel,
) error {
	if workspaceID != "" {
		if err := s.permService.RequireWorkspacePermission(ctx, workspaceID, userID, required); err == nil {
			return nil
		}
	}
	return s.permService.RequireDocumentPermission(ctx, documentID, userID, ownerID, required)
}

// GetFileExtension extracts the file extension from a filename.
func GetFileExtension(filename string) string {
	return filepath.Ext(filename)
}

// IsImageFile checks if a filename is an image.
func IsImageFile(filename string) bool {
	ext := filepath.Ext(filename)
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp":
		return true
	}
	return false
}

// ParseMarkdownReferencesForTest extracts all referenced filenames from markdown content.
// Exported wrapper for testing purposes.
func ParseMarkdownReferencesForTest(content string) []string {
	return parseMarkdownReferences(content)
}

// parseMarkdownReferences extracts all referenced filenames from markdown content.
// Matches patterns like ![alt](filename.png), [link](file.pdf), and <img src="file.jpg">
func parseMarkdownReferences(content string) []string {
	var filenames []string
	seen := make(map[string]bool)

	// Pattern 1: Markdown image syntax ![alt](filename)
	imagePattern := `!\[[^\]]*\]\(([^)]+)\)`
	// Pattern 2: Markdown link syntax [text](filename)
	linkPattern := `(?<!!)\[[^\]]+\]\(([^)]+)\)`
	// Pattern 3: HTML img tag <img src="filename">
	htmlImgPattern := `<img[^>]+src=["']([^"']+)["']`

	patterns := []string{imagePattern, linkPattern, htmlImgPattern}

	for _, pattern := range patterns {
		// Using basic string matching since we don't need complex regex
		// Extract filenames from markdown/html syntax
		matches := extractFilenames(content, pattern)
		for _, filename := range matches {
			// Get just the filename without path
			base := filepath.Base(filename)
			if base != "" && base != "." && !seen[base] {
				filenames = append(filenames, base)
				seen[base] = true
			}
		}
	}

	return filenames
}

// extractFilenames extracts filenames from markdown content using simple pattern matching.
func extractFilenames(content, pattern string) []string {
	var filenames []string

	// For markdown image: ![...](...)
	if pattern == `!\[[^\]]*\]\(([^)]+)\)` {
		for i := 0; i < len(content); i++ {
			if i+1 < len(content) && content[i] == '!' && content[i+1] == '[' {
				// Find the closing ]
				j := i + 2
				for j < len(content) && content[j] != ']' {
					j++
				}
				if j < len(content) && j+1 < len(content) && content[j+1] == '(' {
					// Find the closing )
					k := j + 2
					for k < len(content) && content[k] != ')' {
						k++
					}
					if k < len(content) {
						filename := content[j+2 : k]
						filenames = append(filenames, filename)
						i = k
					}
				}
			}
		}
	}

	// For markdown link: [...](...)
	if pattern == `(?<!!)\[[^\]]+\]\(([^)]+)\)` {
		for i := 0; i < len(content); i++ {
			if content[i] == '[' && (i == 0 || content[i-1] != '!') {
				// Find the closing ]
				j := i + 1
				for j < len(content) && content[j] != ']' {
					j++
				}
				if j < len(content) && j+1 < len(content) && content[j+1] == '(' {
					// Find the closing )
					k := j + 2
					for k < len(content) && content[k] != ')' {
						k++
					}
					if k < len(content) {
						filename := content[j+2 : k]
						filenames = append(filenames, filename)
						i = k
					}
				}
			}
		}
	}

	// For HTML img tag: <img src="...">
	if pattern == `<img[^>]+src=["']([^"']+)["']` {
		for i := 0; i < len(content)-4; i++ {
			if content[i:i+4] == "<img" {
				// Find the closing >
				j := i + 4
				for j < len(content) && content[j] != '>' {
					j++
				}
				if j < len(content) {
					imgTag := content[i:j]
					// Extract src attribute
					if src := findSrcAttribute(imgTag); src != "" {
						filenames = append(filenames, src)
					}
					i = j
				}
			}
		}
	}

	return filenames
}

// findSrcAttribute extracts the src value from an img tag string.
func findSrcAttribute(imgTag string) string {
	// Look for src="..." or src='...'
	for i := 0; i < len(imgTag)-4; i++ {
		if imgTag[i:i+4] == "src=" {
			quote := imgTag[i+4]
			if quote == '"' || quote == '\'' {
				// Find closing quote
				j := i + 5
				for j < len(imgTag) && imgTag[j] != quote {
					j++
				}
				if j < len(imgTag) {
					return imgTag[i+5 : j]
				}
			}
		}
	}
	return ""
}

// contains checks if a string slice contains a value.
func contains(slice []string, value string) bool {
	for _, item := range slice {
		if item == value {
			return true
		}
	}
	return false
}
