package core

import (
	"context"
	"fmt"
	"time"

	"markdownhub/internal/models"
	"markdownhub/internal/store"
)

// Snapshot heuristic thresholds.
const (
	snapshotLineThreshold = 20
	snapshotByteThreshold = 2048
	snapshotTimeThreshold = 5 * time.Minute
)

// DocumentService manages document lifecycle and snapshot creation.
type DocumentService struct {
	db           *store.DB
	permService  *PermissionService
	lastSaveTime map[string]time.Time // documentID -> last snapshot time
}

// NewDocumentService constructs a DocumentService.
func NewDocumentService(db *store.DB, permService *PermissionService) *DocumentService {
	return &DocumentService{
		db:           db,
		permService:  permService,
		lastSaveTime: make(map[string]time.Time),
	}
}

// CreateDocument creates a new document owned by ownerID.
func (s *DocumentService) CreateDocument(ctx context.Context, ownerID, title, content string) (*models.Document, error) {
	if title == "" {
		return nil, fmt.Errorf("%w: title is required", ErrInvalidInput)
	}
	doc, err := s.db.CreateDocument(ctx, ownerID, title, content)
	if err != nil {
		return nil, fmt.Errorf("create document: %w", err)
	}
	return doc, nil
}

// GetDocument retrieves a document, enforcing read permission for userID.
func (s *DocumentService) GetDocument(ctx context.Context, documentID, userID string) (*models.Document, error) {
	doc, err := s.db.GetDocumentByID(ctx, documentID)
	if err != nil {
		return nil, err
	}
	if err := s.permService.RequireDocumentPermission(ctx, documentID, userID, doc.OwnerID, models.PermissionRead); err != nil {
		return nil, err
	}
	return doc, nil
}

// ListDocuments returns all documents owned by userID.
func (s *DocumentService) ListDocuments(ctx context.Context, ownerID string) ([]*models.Document, error) {
	return s.db.ListDocumentsByOwner(ctx, ownerID)
}

// ListAllAccessibleDocuments returns all documents that a user can access,
// including owned documents and documents with granted permissions.
func (s *DocumentService) ListAllAccessibleDocuments(ctx context.Context, userID string) ([]*models.Document, error) {
	// Get user's own documents
	ownDocs, err := s.db.ListDocumentsByOwner(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list owned documents: %w", err)
	}

	// Get documents with granted permissions
	permDocs, err := s.db.ListDocumentsWithPermission(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list documents with permission: %w", err)
	}

	// Merge, avoiding duplicates (if user owns and has permission, show once)
	docMap := make(map[string]*models.Document)
	for _, doc := range ownDocs {
		docMap[doc.ID] = doc
	}
	for _, doc := range permDocs {
		if _, exists := docMap[doc.ID]; !exists {
			docMap[doc.ID] = doc
		}
	}

	// Convert map to slice
	var result []*models.Document
	for _, doc := range docMap {
		result = append(result, doc)
	}

	return result, nil
}

// ListAllAccessibleDocumentsWithPermission returns all accessible documents with their permission levels.
func (s *DocumentService) ListAllAccessibleDocumentsWithPermission(ctx context.Context, userID string) ([]*models.DocumentListItem, error) {
	docs, err := s.ListAllAccessibleDocuments(ctx, userID)
	if err != nil {
		return nil, err
	}

	items := make([]*models.DocumentListItem, len(docs))
	for i, doc := range docs {
		items[i] = &models.DocumentListItem{Document: doc}

		// Add permission level if not owner
		if doc.OwnerID != userID {
			perm, err := s.db.GetDocumentPermission(ctx, doc.ID, userID)
			if err == nil && perm != nil {
				items[i].Permission = &perm.Level
			}
		}
	}
	return items, nil
}

// UpdateContent applies a new content string to a document, respecting
// heading-level permissions, and may trigger a snapshot.
func (s *DocumentService) UpdateContent(ctx context.Context, documentID, userID, newContent string) (*models.Document, error) {
	doc, err := s.db.GetDocumentByID(ctx, documentID)
	if err != nil {
		return nil, err
	}
	if err := s.permService.RequireDocumentPermission(ctx, documentID, userID, doc.OwnerID, models.PermissionEdit); err != nil {
		return nil, err
	}

	// Validate heading-level permissions for the modified sections.
	if err := s.permService.ValidateHeadingEdits(ctx, documentID, userID, doc.OwnerID, doc.Content, newContent); err != nil {
		return nil, err
	}

	oldContent := doc.Content
	doc, err = s.db.UpdateDocumentContent(ctx, documentID, newContent)
	if err != nil {
		return nil, fmt.Errorf("update content: %w", err)
	}

	// Heuristic snapshot trigger.
	if s.shouldSnapshot(documentID, oldContent, newContent) {
		_, _ = s.db.CreateSnapshot(ctx, documentID, userID, newContent, "auto-snapshot")
		s.lastSaveTime[documentID] = time.Now()
	}
	return doc, nil
}

// UpdateTitle changes the document title (requires edit permission).
func (s *DocumentService) UpdateTitle(ctx context.Context, documentID, userID, title string) (*models.Document, error) {
	doc, err := s.db.GetDocumentByID(ctx, documentID)
	if err != nil {
		return nil, err
	}
	if err := s.permService.RequireDocumentPermission(ctx, documentID, userID, doc.OwnerID, models.PermissionEdit); err != nil {
		return nil, err
	}
	return s.db.UpdateDocumentTitle(ctx, documentID, title)
}

// DeleteDocument removes a document (owner only).
func (s *DocumentService) DeleteDocument(ctx context.Context, documentID, userID string) error {
	doc, err := s.db.GetDocumentByID(ctx, documentID)
	if err != nil {
		return err
	}
	if doc.OwnerID != userID {
		return fmt.Errorf("%w: only the owner can delete a document", ErrUnauthorized)
	}
	return s.db.DeleteDocument(ctx, documentID)
}

// shouldSnapshot returns true when the diff crosses heuristic thresholds.
func (s *DocumentService) shouldSnapshot(documentID, oldContent, newContent string) bool {
	lastTime, ok := s.lastSaveTime[documentID]
	if !ok || time.Since(lastTime) > snapshotTimeThreshold {
		return true
	}
	oldLines := countLines(oldContent)
	newLines := countLines(newContent)
	lineDiff := abs(newLines - oldLines)
	byteDiff := abs(len(newContent) - len(oldContent))
	return lineDiff >= snapshotLineThreshold || byteDiff >= snapshotByteThreshold
}

func countLines(s string) int {
	if s == "" {
		return 0
	}
	n := 1
	for _, c := range s {
		if c == '\n' {
			n++
		}
	}
	return n
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
