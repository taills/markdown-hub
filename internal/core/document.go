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

// CreateDocument creates a new document in a workspace owned by ownerID.
func (s *DocumentService) CreateDocument(ctx context.Context, ownerID, workspaceID, title, content string) (*models.Document, error) {
	if title == "" {
		return nil, fmt.Errorf("%w: title is required", ErrInvalidInput)
	}
	if workspaceID == "" {
		return nil, fmt.Errorf("%w: workspace is required", ErrInvalidInput)
	}
	if err := s.permService.RequireWorkspacePermission(ctx, workspaceID, ownerID, models.PermissionEdit); err != nil {
		return nil, err
	}
	doc, err := s.db.CreateDocument(ctx, workspaceID, ownerID, title, content)
	if err != nil {
		return nil, fmt.Errorf("create document: %w", err)
	}
	return doc, nil
}

// GetDocument retrieves a document, enforcing read permission for userID.
// If userID is empty and the document is public, anyone can access it.
func (s *DocumentService) GetDocument(ctx context.Context, documentID, userID string) (*models.Document, error) {
	doc, err := s.db.GetDocumentByID(ctx, documentID)
	if err != nil {
		return nil, err
	}
	// Allow public access for public documents
	if doc.IsPublic {
		return doc, nil
	}
	// Otherwise require authentication and permission
	if userID == "" {
		return nil, ErrUnauthorized
	}
	if err := s.requireWorkspaceOrDocumentPermission(ctx, doc, userID, models.PermissionRead); err != nil {
		return nil, err
	}
	return doc, nil
}

// ListDocuments returns all documents owned by userID.
func (s *DocumentService) ListDocuments(ctx context.Context, ownerID string) ([]*models.Document, error) {
	return s.db.ListDocumentsByOwner(ctx, ownerID)
}

// ListPublicDocumentsByWorkspace returns all public documents in a workspace.
// It does not require authentication — used for anonymous public workspace views.
func (s *DocumentService) ListPublicDocumentsByWorkspace(ctx context.Context, workspaceID string) ([]*models.Document, error) {
	docs, err := s.db.ListDocumentsByWorkspaceIDs(ctx, []string{workspaceID})
	if err != nil {
		return nil, fmt.Errorf("list workspace documents: %w", err)
	}
	public := make([]*models.Document, 0, len(docs))
	for _, doc := range docs {
		if doc.IsPublic {
			public = append(public, doc)
		}
	}
	return public, nil
}

// ListAllAccessibleDocuments returns all documents that a user can access,
// including owned documents and documents with granted permissions.
func (s *DocumentService) ListAllAccessibleDocuments(ctx context.Context, userID string) ([]*models.Document, error) {
	workspaces, err := s.db.ListWorkspacesByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list workspaces: %w", err)
	}
	workspaceIDs := make([]string, 0, len(workspaces))
	for _, ws := range workspaces {
		workspaceIDs = append(workspaceIDs, ws.ID)
	}

	workspaceDocs, err := s.db.ListDocumentsByWorkspaceIDs(ctx, workspaceIDs)
	if err != nil {
		return nil, fmt.Errorf("list workspace documents: %w", err)
	}

	permDocs, err := s.db.ListDocumentsWithPermission(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list documents with permission: %w", err)
	}

	docMap := make(map[string]*models.Document)
	for _, doc := range workspaceDocs {
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
			member, err := s.db.GetWorkspaceMember(ctx, doc.WorkspaceID, userID)
			if err == nil && member != nil {
				items[i].Permission = &member.Level
				continue
			}
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
	if err := s.requireWorkspaceOrDocumentPermission(ctx, doc, userID, models.PermissionEdit); err != nil {
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
	if err := s.requireWorkspaceOrDocumentPermission(ctx, doc, userID, models.PermissionEdit); err != nil {
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
	if err := s.requireWorkspaceOrDocumentPermission(ctx, doc, userID, models.PermissionManage); err != nil {
		return err
	}
	return s.db.DeleteDocument(ctx, documentID)
}

// SetPublicStatus updates the public status of a document (requires manage permission).
func (s *DocumentService) SetPublicStatus(ctx context.Context, documentID, userID string, isPublic bool) (*models.Document, error) {
	doc, err := s.db.GetDocumentByID(ctx, documentID)
	if err != nil {
		return nil, err
	}
	if err := s.requireWorkspaceOrDocumentPermission(ctx, doc, userID, models.PermissionManage); err != nil {
		return nil, err
	}
	return s.db.UpdateDocumentPublicStatus(ctx, documentID, isPublic)
}

// ReorderDocuments persists a new sort order for the given document IDs.
func (s *DocumentService) ReorderDocuments(ctx context.Context, userID string, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	return s.db.BulkUpdateDocumentSortOrder(ctx, ids)
}

func (s *DocumentService) requireWorkspaceOrDocumentPermission(
	ctx context.Context,
	doc *models.Document,
	userID string,
	required models.PermissionLevel,
) error {
	if err := s.permService.RequireWorkspacePermission(ctx, doc.WorkspaceID, userID, required); err == nil {
		return nil
	}
	return s.permService.RequireDocumentPermission(ctx, doc.ID, userID, doc.OwnerID, required)
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
