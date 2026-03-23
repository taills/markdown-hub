package core

import (
	"context"
	"fmt"
	"path/filepath"

	"github.com/google/uuid"

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
	// workspaceID is now unused, kept for API compatibility
	_ = workspaceID

	if err := s.permService.RequireDocumentPermission(ctx, documentID, uploaderID, ownerID, models.PermissionEdit); err != nil {
		return nil, err
	}

	// Validate file
	if filename == "" {
		return nil, fmt.Errorf("%w: filename is required", ErrInvalidInput)
	}
	if fileSize <= 0 {
		return nil, fmt.Errorf("%w: invalid file size", ErrInvalidInput)
	}

	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}
	uploaderUUID, err := uuid.Parse(uploaderID)
	if err != nil {
		return nil, fmt.Errorf("invalid uploader ID: %w", err)
	}

	// Create attachment record
	attachment, err := s.db.CreateAttachment(ctx, store.CreateAttachmentParams{
		DocumentID: uuid.NullUUID{UUID: docUUID, Valid: true},
		UploadBy:   uploaderUUID,
		Filename:   filename,
		FileType:   fileType,
		FileSize:   fileSize,
		FilePath:   filePath,
	})
	if err != nil {
		return nil, fmt.Errorf("create attachment: %w", err)
	}

	return &models.Attachment{
		ID:         attachment.ID.String(),
		DocumentID: func() *string { s := attachment.DocumentID.UUID.String(); return &s }(),
		UploadBy:   attachment.UploadBy.String(),
		Filename:   attachment.Filename,
		FileType:   attachment.FileType,
		FileSize:   attachment.FileSize,
		FilePath:   attachment.FilePath,
		CreatedAt:  attachment.CreatedAt,
	}, nil
}

// GetAttachment retrieves an attachment. The caller must have read permission on the document.
func (s *AttachmentService) GetAttachment(
	ctx context.Context,
	attachmentID, userID, ownerID string,
	documentID string,
) (*models.Attachment, error) {
	attUUID, err := uuid.Parse(attachmentID)
	if err != nil {
		return nil, fmt.Errorf("invalid attachment ID: %w", err)
	}

	attachment, err := s.db.GetAttachmentByID(ctx, attUUID)
	if err != nil {
		return nil, err
	}

	if err := s.permService.RequireDocumentPermission(ctx, documentID, userID, ownerID, models.PermissionRead); err != nil {
		return nil, err
	}

	return &models.Attachment{
		ID: attachment.ID.String(),
		DocumentID: func() *string {
			if attachment.DocumentID.Valid {
				s := attachment.DocumentID.UUID.String()
				return &s
			}
			return nil
		}(),
		UploadBy:  attachment.UploadBy.String(),
		Filename:  attachment.Filename,
		FileType:  attachment.FileType,
		FileSize:  attachment.FileSize,
		FilePath:  attachment.FilePath,
		CreatedAt: attachment.CreatedAt,
	}, nil
}

// GetAttachmentForDownload retrieves an attachment after validating read permission.
func (s *AttachmentService) GetAttachmentForDownload(
	ctx context.Context,
	attachmentID, userID string,
) (*models.Attachment, error) {
	attUUID, err := uuid.Parse(attachmentID)
	if err != nil {
		return nil, fmt.Errorf("invalid attachment ID: %w", err)
	}

	attachment, err := s.db.GetAttachmentByID(ctx, attUUID)
	if err != nil {
		return nil, err
	}

	if !attachment.DocumentID.Valid {
		return nil, fmt.Errorf("attachment is not linked to a document")
	}

	doc, err := s.db.GetDocumentByID(ctx, attachment.DocumentID.UUID)
	if err != nil {
		return nil, err
	}

	if err := s.permService.RequireDocumentPermission(ctx, attachment.DocumentID.UUID.String(), userID, doc.OwnerID.String(), models.PermissionRead); err != nil {
		return nil, err
	}

	return &models.Attachment{
		ID: attachment.ID.String(),
		DocumentID: func() *string {
			if attachment.DocumentID.Valid {
				s := attachment.DocumentID.UUID.String()
				return &s
			}
			return nil
		}(),
		UploadBy:  attachment.UploadBy.String(),
		Filename:  attachment.Filename,
		FileType:  attachment.FileType,
		FileSize:  attachment.FileSize,
		FilePath:  attachment.FilePath,
		CreatedAt: attachment.CreatedAt,
	}, nil
}

// ListAttachments returns all attachments for a document.
func (s *AttachmentService) ListAttachments(
	ctx context.Context,
	workspaceID, documentID, userID, ownerID string,
) ([]*models.Attachment, error) {
	// workspaceID is now unused, kept for API compatibility
	_ = workspaceID

	if err := s.permService.RequireDocumentPermission(ctx, documentID, userID, ownerID, models.PermissionRead); err != nil {
		return nil, err
	}

	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	atts, err := s.db.ListDocumentAttachments(ctx, uuid.NullUUID{UUID: docUUID, Valid: true})
	if err != nil {
		return nil, err
	}

	result := make([]*models.Attachment, len(atts))
	for i, att := range atts {
		result[i] = &models.Attachment{
			ID: att.ID.String(),
			DocumentID: func() *string {
				if att.DocumentID.Valid {
					s := att.DocumentID.UUID.String()
					return &s
				}
				return nil
			}(),
			UploadBy:  att.UploadBy.String(),
			Filename:  att.Filename,
			FileType:  att.FileType,
			FileSize:  att.FileSize,
			FilePath:  att.FilePath,
			CreatedAt: att.CreatedAt,
		}
	}
	return result, nil
}

// DeleteAttachment removes an attachment. The caller must have manage permission.
func (s *AttachmentService) DeleteAttachment(
	ctx context.Context,
	attachmentID, userID, ownerID, documentID string,
) error {
	attUUID, err := uuid.Parse(attachmentID)
	if err != nil {
		return fmt.Errorf("invalid attachment ID: %w", err)
	}

	if err := s.permService.RequireDocumentPermission(ctx, documentID, userID, ownerID, models.PermissionManage); err != nil {
		return err
	}

	return s.db.DeleteAttachment(ctx, attUUID)
}

// GetUnreferencedAttachments returns attachments in a document that are not referenced in the content.
func (s *AttachmentService) GetUnreferencedAttachments(
	ctx context.Context,
	workspaceID, documentID, userID, ownerID string,
) ([]*models.Attachment, error) {
	// workspaceID is now unused, kept for API compatibility
	_ = workspaceID

	if err := s.permService.RequireDocumentPermission(ctx, documentID, userID, ownerID, models.PermissionRead); err != nil {
		return nil, err
	}

	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	// Get document content
	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		return nil, fmt.Errorf("get document: %w", err)
	}

	// Get all attachments for this document
	allAttachments, err := s.db.ListDocumentAttachments(ctx, uuid.NullUUID{UUID: docUUID, Valid: true})
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
			unreferenced = append(unreferenced, &models.Attachment{
				ID: att.ID.String(),
				DocumentID: func() *string {
					if att.DocumentID.Valid {
						s := att.DocumentID.UUID.String()
						return &s
					}
					return nil
				}(),
				UploadBy:  att.UploadBy.String(),
				Filename:  att.Filename,
				FileType:  att.FileType,
				FileSize:  att.FileSize,
				FilePath:  att.FilePath,
				CreatedAt: att.CreatedAt,
			})
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
	attUUID, err := uuid.Parse(attachmentID)
	if err != nil {
		return nil, fmt.Errorf("invalid attachment ID: %w", err)
	}
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	ref, err := s.db.CreateAttachmentReference(ctx, store.CreateAttachmentReferenceParams{
		AttachmentID: attUUID,
		DocumentID:   docUUID,
		ReferencedAt: int32(referencedAt),
	})
	if err != nil {
		return nil, err
	}

	return &models.AttachmentReference{
		ID:           ref.ID.String(),
		AttachmentID: ref.AttachmentID.String(),
		DocumentID:   ref.DocumentID.String(),
		ReferencedAt: int(ref.ReferencedAt),
		CreatedAt:    ref.CreatedAt,
	}, nil
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
		// Using basic String matching since we don't need complex regex
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

// contains checks if a String slice contains a value.
func contains(slice []string, value string) bool {
	for _, item := range slice {
		if item == value {
			return true
		}
	}
	return false
}
