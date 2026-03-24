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

// CreateDocument creates a new document. parentID can be empty for root documents.
func (s *DocumentService) CreateDocument(ctx context.Context, ownerID, parentID, title, content string) (*models.Document, error) {
	if title == "" {
		return nil, fmt.Errorf("%w: title is required", ErrInvalidInput)
	}

	ownerUUID, err := uuid.Parse(ownerID)
	if err != nil {
		return nil, fmt.Errorf("invalid owner ID: %w", err)
	}

	var parentUUID uuid.NullUUID
	if parentID != "" {
		pUUID, err := uuid.Parse(parentID)
		if err != nil {
			return nil, fmt.Errorf("invalid parent ID: %w", err)
		}
		parentUUID = uuid.NullUUID{UUID: pUUID, Valid: true}
	}

	doc, err := s.db.CreateDocument(ctx, store.CreateDocumentParams{
		OwnerID:          ownerUUID,
		ParentID:         parentUUID,
		Title:            title,
		Content:          content,
		Visibility:       "internal",
		InheritVisibility: true,
	})
	if err != nil {
		return nil, fmt.Errorf("create document: %w", err)
	}

	return storeDocToModel(&doc), nil
}

// GetDocument retrieves a document, enforcing read permission for userID.
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
	if modelDoc.Visibility == "public" || modelDoc.IsPublic {
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

// ListPublicDocumentsByWorkspace returns public documents with given IDs (for backward compatibility).
// Now deprecated - just returns public documents filtered by workspace root ID.
func (s *DocumentService) ListPublicDocumentsByWorkspace(ctx context.Context, workspaceID string) ([]*models.Document, error) {
	// For backward compatibility - workspaceID is now a document ID (root document)
	docs, err := s.db.ListPublicDocuments(ctx)
	if err != nil {
		return nil, fmt.Errorf("list public documents: %w", err)
	}
	return storeDocsToModels(docs), nil
}

// ListGlobalPublicDocuments returns all public documents for the home page.
func (s *DocumentService) ListGlobalPublicDocuments(ctx context.Context) ([]*models.Document, error) {
	docs, err := s.db.ListPublicDocuments(ctx)
	if err != nil {
		return nil, fmt.Errorf("list public documents: %w", err)
	}
	return storeDocsToModels(docs), nil
}

// ListAllAccessibleDocuments returns all documents that a user can access.
func (s *DocumentService) ListAllAccessibleDocuments(ctx context.Context, userID string) ([]*models.Document, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	docs, err := s.db.ListDocumentsWithPermission(ctx, userUUID)
	if err != nil {
		return nil, fmt.Errorf("list documents: %w", err)
	}

	return storeDocsToModels(docs), nil
}

// ListAllAccessibleDocumentsWithPermission returns all accessible documents with their permission levels.
func (s *DocumentService) ListAllAccessibleDocumentsWithPermission(ctx context.Context, userID string) ([]*models.DocumentListItem, error) {
	docs, err := s.ListAllAccessibleDocuments(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Convert []*models.Document to []*models.DocumentListItem
	items := make([]*models.DocumentListItem, len(docs))
	for i, doc := range docs {
		items[i] = &models.DocumentListItem{
			Document:   doc,
			Permission: nil, // nil indicates owner/fully accessible
		}
	}
	return items, nil
}

// UpdateContent applies a new content string to a document.
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

// UpdateTitle changes the document title.
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

// DeleteDocument removes a document.
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

// SetPublicStatus updates the public status of a document.
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

	visibility := "internal"
	if isPublic {
		visibility = "public"
	}

	updatedDoc, err := s.db.UpdateDocumentVisibility(ctx, store.UpdateDocumentVisibilityParams{
		ID:                docUUID,
		Visibility:        visibility,
		InheritVisibility: false,
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

// MoveDocument moves a document to a new parent and/or updates its sort order.
func (s *DocumentService) MoveDocument(ctx context.Context, docID, userID string, newParentID *string, newSortOrder int) (*models.Document, error) {
	docUUID, err := uuid.Parse(docID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	// Get the document to check permissions
	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, store.ErrNotFound
		}
		return nil, err
	}

	modelDoc := storeDocToModel(&doc)

	// Check permission
	if err := s.requireWorkspaceOrDocumentPermission(ctx, modelDoc, userID, models.PermissionEdit); err != nil {
		return nil, err
	}

	// Prepare parent ID
	var parentUUID uuid.NullUUID
	if newParentID != nil && *newParentID != "" {
		pUUID, err := uuid.Parse(*newParentID)
		if err != nil {
			return nil, fmt.Errorf("invalid parent ID: %w", err)
		}
		parentUUID = uuid.NullUUID{UUID: pUUID, Valid: true}
	}

	// Update document
	updatedDoc, err := s.db.UpdateDocumentParent(ctx, store.UpdateDocumentParentParams{
		ID:        docUUID,
		ParentID:  parentUUID,
		SortOrder: int32(newSortOrder),
	})
	if err != nil {
		return nil, fmt.Errorf("move document: %w", err)
	}

	return storeDocToModel(&updatedDoc), nil
}

// SearchDocuments searches public documents by query.
func (s *DocumentService) SearchDocuments(ctx context.Context, query string) ([]*models.DocumentSearchResult, error) {
	if query == "" {
		return nil, nil
	}
	results, err := s.db.SearchDocuments(ctx, sql.NullString{String: query, Valid: true})
	if err != nil {
		return nil, fmt.Errorf("search documents: %w", err)
	}
	return storeSearchResultsToModels(results), nil
}

// SearchUserDocuments searches documents accessible by the user.
func (s *DocumentService) SearchUserDocuments(ctx context.Context, userID, query string) ([]*models.DocumentSearchResult, error) {
	if query == "" {
		return nil, nil
	}
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}
	results, err := s.db.SearchUserDocuments(ctx, store.SearchUserDocumentsParams{
		UserID:  userUUID,
		Column2: sql.NullString{String: query, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("search user documents: %w", err)
	}
	return storeSearchUserResultsToModels(results), nil
}

func (s *DocumentService) requireWorkspaceOrDocumentPermission(
	ctx context.Context,
	doc *models.Document,
	userID string,
	required models.PermissionLevel,
) error {
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
	doc := &models.Document{
		ID:                 d.ID.String(),
		OwnerID:            d.OwnerID.String(),
		Title:              d.Title,
		Content:            d.Content,
		Visibility:         d.Visibility,
		InheritVisibility:  d.InheritVisibility,
		IsPublic:           d.IsPublic,
		SortOrder:          int(d.SortOrder),
		CreatedAt:          d.CreatedAt,
		UpdatedAt:          d.UpdatedAt,
	}
	if d.ParentID.Valid {
		s := d.ParentID.UUID.String()
		doc.ParentID = &s
	}
	return doc
}

// storeDocsToModels converts []store.Document to []*models.Document
func storeDocsToModels(docs []store.Document) []*models.Document {
	result := make([]*models.Document, len(docs))
	for i := range docs {
		doc := storeDocToModel(&docs[i])
		if doc == nil {
			continue
		}
		result[i] = doc
	}
	return result
}

// storeSearchResultsToModels converts search results to models
func storeSearchResultsToModels(rows []store.SearchDocumentsRow) []*models.DocumentSearchResult {
	result := make([]*models.DocumentSearchResult, len(rows))
	for i, r := range rows {
		result[i] = &models.DocumentSearchResult{
			ID:        r.ID.String(),
			Title:     r.Title,
			Content:   r.Content,
			OwnerID:   r.OwnerID.String(),
			IsPublic:  r.IsPublic,
			SortOrder: int(r.SortOrder),
		}
		if r.ParentID.Valid {
			s := r.ParentID.UUID.String()
			result[i].ParentID = &s
		}
	}
	return result
}

// storeSearchUserResultsToModels converts user search results to models
func storeSearchUserResultsToModels(rows []store.SearchUserDocumentsRow) []*models.DocumentSearchResult {
	result := make([]*models.DocumentSearchResult, len(rows))
	for i, r := range rows {
		result[i] = &models.DocumentSearchResult{
			ID:        r.ID.String(),
			Title:     r.Title,
			Content:   r.Content,
			OwnerID:   r.OwnerID.String(),
			IsPublic:  r.IsPublic,
			SortOrder: int(r.SortOrder),
		}
	}
	return result
}
