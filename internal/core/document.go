package core

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"

	"markdownhub/internal/models"
	"markdownhub/internal/store"
)

// DocumentService manages document lifecycle and snapshot creation.
type DocumentService struct {
	db             *store.DB
	permService    *PermissionService
	lastSaveTime   map[string]time.Time // documentID -> last snapshot time
	snapshotConfig SnapshotConfig
}

// NewDocumentService constructs a DocumentService.
func NewDocumentService(db *store.DB, permService *PermissionService) *DocumentService {
	return &DocumentService{
		db:             db,
		permService:    permService,
		lastSaveTime:   make(map[string]time.Time),
		snapshotConfig: DefaultSnapshotConfig(),
	}
}

// SetSnapshotConfig updates the snapshot configuration.
func (s *DocumentService) SetSnapshotConfig(config SnapshotConfig) {
	s.snapshotConfig = config
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

	// Parse UUIDs
	ownerUUID, err := uuid.Parse(ownerID)
	if err != nil {
		return nil, fmt.Errorf("invalid owner ID: %w", err)
	}
	workspaceUUID, err := uuid.Parse(workspaceID)
	if err != nil {
		return nil, fmt.Errorf("invalid workspace ID: %w", err)
	}

	// Call sqlc method
	doc, err := s.db.CreateDocument(ctx, store.CreateDocumentParams{
		OwnerID:     ownerUUID,
		Title:       title,
		Content:     content,
		WorkspaceID: workspaceUUID,
	})
	if err != nil {
		return nil, fmt.Errorf("create document: %w", err)
	}

	// Convert store.Document to *models.Document
	return storeDocToModel(&doc), nil
}

// GetDocument retrieves a document, enforcing read permission for userID.
// If userID is empty and the document is public, anyone can access it.
func (s *DocumentService) GetDocument(ctx context.Context, documentID, userID string) (*models.Document, error) {
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, store.ErrNotFound
		}
		return nil, err
	}

	modelDoc := storeDocToModel(&doc)

	// Allow public access for public documents
	if modelDoc.IsPublic {
		return modelDoc, nil
	}
	// Otherwise require authentication and permission
	if userID == "" {
		return nil, ErrUnauthorized
	}
	if err := s.requireWorkspaceOrDocumentPermission(ctx, modelDoc, userID, models.PermissionRead); err != nil {
		return nil, err
	}
	return modelDoc, nil
}

// ListDocuments returns all documents owned by userID.
func (s *DocumentService) ListDocuments(ctx context.Context, ownerID string) ([]*models.Document, error) {
	ownerUUID, err := uuid.Parse(ownerID)
	if err != nil {
		return nil, fmt.Errorf("invalid owner ID: %w", err)
	}

	docs, err := s.db.ListDocumentsByOwner(ctx, ownerUUID)
	if err != nil {
		return nil, err
	}

	return storeDocsToModels(docs), nil
}

// ListPublicDocumentsByWorkspace returns all public documents in a workspace.
// It does not require authentication — used for anonymous public workspace views.
func (s *DocumentService) ListPublicDocumentsByWorkspace(ctx context.Context, workspaceID string) ([]*models.Document, error) {
	workspaceUUID, err := uuid.Parse(workspaceID)
	if err != nil {
		return nil, fmt.Errorf("invalid workspace ID: %w", err)
	}

	docs, err := s.db.ListDocumentsByWorkspace(ctx, workspaceUUID)
	if err != nil {
		return nil, fmt.Errorf("list workspace documents: %w", err)
	}

	public := make([]*models.Document, 0, len(docs))
	for i := range docs {
		if docs[i].IsPublic {
			public = append(public, storeDocToModel(&docs[i]))
		}
	}
	return public, nil
}

// ListGlobalPublicDocuments returns all public documents across all workspaces for the home page.
func (s *DocumentService) ListGlobalPublicDocuments(ctx context.Context) ([]*models.Document, error) {
	docs, err := s.db.ListPublicDocuments(ctx)
	if err != nil {
		return nil, fmt.Errorf("list public documents: %w", err)
	}
	return storeDocsToModels(docs), nil
}

// ListAllAccessibleDocuments returns all documents that a user can access,
// including owned documents and documents with granted permissions.
func (s *DocumentService) ListAllAccessibleDocuments(ctx context.Context, userID string) ([]*models.Document, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	// Get workspaces the user is a member of
	workspaces, err := s.db.ListWorkspacesByMember(ctx, userUUID)
	if err != nil {
		return nil, fmt.Errorf("list workspaces: %w", err)
	}

	// Collect all documents from those workspaces
	docMap := make(map[string]*models.Document)
	for i := range workspaces {
		workspaceDocs, err := s.db.ListDocumentsByWorkspace(ctx, workspaces[i].ID)
		if err != nil {
			return nil, fmt.Errorf("list workspace documents: %w", err)
		}
		for j := range workspaceDocs {
			docID := workspaceDocs[j].ID.String()
			if _, exists := docMap[docID]; !exists {
				docMap[docID] = storeDocToModel(&workspaceDocs[j])
			}
		}
	}

	// Add documents with explicit permissions
	permDocs, err := s.db.ListDocumentsWithPermission(ctx, userUUID)
	if err != nil {
		return nil, fmt.Errorf("list documents with permission: %w", err)
	}
	for i := range permDocs {
		docID := permDocs[i].ID.String()
		if _, exists := docMap[docID]; !exists {
			docMap[docID] = storeDocToModel(&permDocs[i])
		}
	}

	// Convert map to slice
	result := make([]*models.Document, 0, len(docMap))
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

	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	items := make([]*models.DocumentListItem, len(docs))
	for i, doc := range docs {
		items[i] = &models.DocumentListItem{Document: doc}

		// Add permission level if not owner
		if doc.OwnerID != userID {
			// Try workspace membership first
			workspaceUUID, err := uuid.Parse(doc.WorkspaceID)
			if err == nil {
				member, err := s.db.GetWorkspaceMember(ctx, store.GetWorkspaceMemberParams{
					WorkspaceID: workspaceUUID,
					UserID:      userUUID,
				})
				if err == nil {
					level := models.PermissionLevel(member.Level)
					items[i].Permission = &level
					continue
				}
			}

			// Try document permission
			docUUID, err := uuid.Parse(doc.ID)
			if err == nil {
				perm, err := s.db.GetDocumentPermission(ctx, store.GetDocumentPermissionParams{
					DocumentID: docUUID,
					UserID:     userUUID,
				})
				if err == nil {
					level := models.PermissionLevel(perm.Level)
					items[i].Permission = &level
				}
			}
		}
	}
	return items, nil
}

// UpdateContent applies a new content string to a document, respecting
// heading-level permissions, and may trigger a snapshot.
func (s *DocumentService) UpdateContent(ctx context.Context, documentID, userID, newContent string) (*models.Document, error) {
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, store.ErrNotFound
		}
		return nil, err
	}

	modelDoc := storeDocToModel(&doc)

	if err := s.requireWorkspaceOrDocumentPermission(ctx, modelDoc, userID, models.PermissionEdit); err != nil {
		return nil, err
	}

	// Validate heading-level permissions for the modified sections.
	if err := s.permService.ValidateHeadingEdits(ctx, documentID, userID, modelDoc.OwnerID, modelDoc.Content, newContent); err != nil {
		return nil, err
	}

	oldContent := modelDoc.Content
	updatedDoc, err := s.db.UpdateDocumentContent(ctx, store.UpdateDocumentContentParams{
		ID:      docUUID,
		Content: newContent,
	})
	if err != nil {
		return nil, fmt.Errorf("update content: %w", err)
	}

	// Heuristic snapshot trigger.
	if s.shouldSnapshot(documentID, oldContent, newContent) {
		userUUID, err := uuid.Parse(userID)
		if err == nil {
			_, _ = s.db.CreateSnapshot(ctx, store.CreateSnapshotParams{
				DocumentID: docUUID,
				AuthorID:   uuid.NullUUID{UUID: userUUID, Valid: true},
				Content:    newContent,
				Message:    "auto-snapshot",
			})
		}
		s.lastSaveTime[documentID] = time.Now()
	}

	return storeDocToModel(&updatedDoc), nil
}

// UpdateTitle changes the document title (requires edit permission).
func (s *DocumentService) UpdateTitle(ctx context.Context, documentID, userID, title string) (*models.Document, error) {
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, store.ErrNotFound
		}
		return nil, err
	}

	modelDoc := storeDocToModel(&doc)

	if err := s.requireWorkspaceOrDocumentPermission(ctx, modelDoc, userID, models.PermissionEdit); err != nil {
		return nil, err
	}

	updatedDoc, err := s.db.UpdateDocumentTitle(ctx, store.UpdateDocumentTitleParams{
		ID:    docUUID,
		Title: title,
	})
	if err != nil {
		return nil, err
	}

	return storeDocToModel(&updatedDoc), nil
}

// DeleteDocument removes a document (owner only).
func (s *DocumentService) DeleteDocument(ctx context.Context, documentID, userID string) error {
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		if err == sql.ErrNoRows {
			return store.ErrNotFound
		}
		return err
	}

	modelDoc := storeDocToModel(&doc)

	if err := s.requireWorkspaceOrDocumentPermission(ctx, modelDoc, userID, models.PermissionManage); err != nil {
		return err
	}

	return s.db.DeleteDocument(ctx, docUUID)
}

// SetPublicStatus updates the public status of a document (requires manage permission).
func (s *DocumentService) SetPublicStatus(ctx context.Context, documentID, userID string, isPublic bool) (*models.Document, error) {
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, store.ErrNotFound
		}
		return nil, err
	}

	modelDoc := storeDocToModel(&doc)

	if err := s.requireWorkspaceOrDocumentPermission(ctx, modelDoc, userID, models.PermissionManage); err != nil {
		return nil, err
	}

	updatedDoc, err := s.db.UpdateDocumentPublicStatus(ctx, store.UpdateDocumentPublicStatusParams{
		ID:       docUUID,
		IsPublic: isPublic,
	})
	if err != nil {
		return nil, err
	}

	return storeDocToModel(&updatedDoc), nil
}

// ReorderDocuments persists a new sort order for the given document IDs.
func (s *DocumentService) ReorderDocuments(ctx context.Context, userID string, ids []string) error {
	if len(ids) == 0 {
		return nil
	}

	// Update each document's sort order
	for i, id := range ids {
		docUUID, err := uuid.Parse(id)
		if err != nil {
			return fmt.Errorf("invalid document ID %s: %w", id, err)
		}

		err = s.db.UpdateDocumentSortOrder(ctx, store.UpdateDocumentSortOrderParams{
			ID:        docUUID,
			SortOrder: int32(i),
		})
		if err != nil {
			return fmt.Errorf("update sort order for document %s: %w", id, err)
		}
	}

	return nil
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
	if !ok {
		lastTime = time.Time{} // Zero time ensures first save triggers snapshot
	}
	return s.snapshotConfig.ShouldCreateSnapshot(lastTime, oldContent, newContent)
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

// -------------------------------------------------------------------------
// Type Conversion Helpers
// -------------------------------------------------------------------------

// storeDocToModel converts a store.Document to *models.Document
func storeDocToModel(d *store.Document) *models.Document {
	return &models.Document{
		ID:          d.ID.String(),
		WorkspaceID: d.WorkspaceID.String(),
		OwnerID:     d.OwnerID.String(),
		Title:       d.Title,
		Content:     d.Content,
		IsPublic:    d.IsPublic,
		SortOrder:   int(d.SortOrder),
		CreatedAt:   d.CreatedAt,
		UpdatedAt:   d.UpdatedAt,
	}
}

// storeDocsToModels converts []store.Document to []*models.Document
func storeDocsToModels(docs []store.Document) []*models.Document {
	result := make([]*models.Document, len(docs))
	for i := range docs {
		result[i] = storeDocToModel(&docs[i])
	}
	return result
}
