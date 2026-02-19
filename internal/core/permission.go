package core

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"markdownhub/internal/models"
	"markdownhub/internal/store"
)

// PermissionService manages document and heading-level access control.
type PermissionService struct {
	db *store.DB
}

// NewPermissionService constructs a PermissionService.
func NewPermissionService(db *store.DB) *PermissionService {
	return &PermissionService{db: db}
}

// levelValue returns a numeric rank for comparing permission levels.
func levelValue(l models.PermissionLevel) int {
	switch l {
	case models.PermissionRead:
		return 1
	case models.PermissionEdit:
		return 2
	case models.PermissionManage:
		return 3
	}
	return 0
}

// RequireWorkspacePermission returns ErrUnauthorized if userID does not have
// at least the requested level on workspaceID. The workspace owner always passes.
func (s *PermissionService) RequireWorkspacePermission(
	ctx context.Context,
	workspaceID, userID string,
	required models.PermissionLevel,
) error {
	wsUUID, err := uuid.Parse(workspaceID)
	if err != nil {
		return fmt.Errorf("invalid workspace ID: %w", err)
	}
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	ws, err := s.db.GetWorkspaceByID(ctx, wsUUID)
	if errors.Is(err, store.ErrNotFound) {
		return fmt.Errorf("%w: workspace not found", ErrUnauthorized)
	}
	if err != nil {
		return fmt.Errorf("get workspace: %w", err)
	}
	if userUUID == ws.OwnerID {
		return nil
	}
	member, err := s.db.GetWorkspaceMember(ctx, store.GetWorkspaceMemberParams{
		WorkspaceID: wsUUID,
		UserID:      userUUID,
	})
	if errors.Is(err, store.ErrNotFound) {
		return fmt.Errorf("%w: no access to workspace %s", ErrUnauthorized, workspaceID)
	}
	if err != nil {
		return fmt.Errorf("get workspace member: %w", err)
	}
	if levelValue(models.PermissionLevel(member.Level)) < levelValue(required) {
		return fmt.Errorf("%w: need %s permission, have %s", ErrUnauthorized, required, member.Level)
	}
	return nil
}

// RequireDocumentPermission returns ErrUnauthorized if userID does not have
// at least the requested level on documentID. The owner always passes.
func (s *PermissionService) RequireDocumentPermission(
	ctx context.Context,
	documentID, userID, ownerID string,
	required models.PermissionLevel,
) error {
	if userID == ownerID {
		return nil
	}
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return fmt.Errorf("invalid document ID: %w", err)
	}
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	perm, err := s.db.GetDocumentPermission(ctx, store.GetDocumentPermissionParams{
		DocumentID: docUUID,
		UserID:     userUUID,
	})
	if errors.Is(err, store.ErrNotFound) {
		return fmt.Errorf("%w: no access to document %s", ErrUnauthorized, documentID)
	}
	if err != nil {
		return fmt.Errorf("get document permission: %w", err)
	}
	if levelValue(models.PermissionLevel(perm.Level)) < levelValue(required) {
		return fmt.Errorf("%w: need %s permission, have %s", ErrUnauthorized, required, perm.Level)
	}
	return nil
}

// ValidateHeadingEdits checks whether the user is allowed to edit all the
// sections that differ between oldContent and newContent.
func (s *PermissionService) ValidateHeadingEdits(
	ctx context.Context,
	documentID, userID, ownerID, oldContent, newContent string,
) error {
	if userID == ownerID {
		return nil
	}

	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return fmt.Errorf("invalid document ID: %w", err)
	}
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	oldSections := ParseHeadings(oldContent)
	newSections := ParseHeadings(newContent)

	// Build a set of changed heading anchors.
	changed := changedHeadings(oldContent, newContent, oldSections, newSections)

	for anchor := range changed {
		hp, err := s.db.GetHeadingPermission(ctx, store.GetHeadingPermissionParams{
			DocumentID:    docUUID,
			UserID:        userUUID,
			HeadingAnchor: anchor,
		})
		if errors.Is(err, store.ErrNotFound) {
			// No explicit heading rule → fall through to document-level (already checked).
			continue
		}
		if err != nil {
			return fmt.Errorf("get heading permission: %w", err)
		}
		if levelValue(models.PermissionLevel(hp.Level)) < levelValue(models.PermissionEdit) {
			return fmt.Errorf("%w: cannot edit heading section %q", ErrUnauthorized, anchor)
		}
	}
	return nil
}

// changedHeadings returns a set of heading anchors whose content changed.
func changedHeadings(oldContent, newContent string, oldSecs, newSecs []models.HeadingSection) map[string]struct{} {
	changed := make(map[string]struct{})

	// Map anchor → content in old doc.
	oldMap := make(map[string]string, len(oldSecs))
	for _, sec := range oldSecs {
		oldMap[sec.Anchor] = oldContent[sec.StartByte:sec.EndByte]
	}

	for _, sec := range newSecs {
		newChunk := newContent[sec.StartByte:sec.EndByte]
		if old, ok := oldMap[sec.Anchor]; !ok || old != newChunk {
			changed[sec.Anchor] = struct{}{}
		}
	}
	return changed
}

// SetDocumentPermission grants or updates a user's document-level permission.
func (s *PermissionService) SetDocumentPermission(
	ctx context.Context,
	workspaceID, documentID, callerID, ownerID, targetUserID string,
	level models.PermissionLevel,
) (*models.DocumentPermission, error) {
	if err := s.requireWorkspaceOrDocumentPermission(ctx, workspaceID, documentID, callerID, ownerID, models.PermissionManage); err != nil {
		return nil, err
	}
	wsUUID, err := uuid.Parse(workspaceID)
	if err != nil {
		return nil, fmt.Errorf("invalid workspace ID: %w", err)
	}
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}
	targetUUID, err := uuid.Parse(targetUserID)
	if err != nil {
		return nil, fmt.Errorf("invalid target user ID: %w", err)
	}

	if _, err := s.db.GetWorkspaceMember(ctx, store.GetWorkspaceMemberParams{
		WorkspaceID: wsUUID,
		UserID:      targetUUID,
	}); err != nil {
		return nil, fmt.Errorf("target user not in workspace")
	}

	perm, err := s.db.UpsertDocumentPermission(ctx, store.UpsertDocumentPermissionParams{
		DocumentID: docUUID,
		UserID:     targetUUID,
		Level:      store.PermissionLevel(level),
	})
	if err != nil {
		return nil, err
	}

	return &models.DocumentPermission{
		ID:         perm.ID.String(),
		DocumentID: perm.DocumentID.String(),
		UserID:     perm.UserID.String(),
		Level:      models.PermissionLevel(perm.Level),
		CreatedAt:  perm.CreatedAt,
	}, nil
}

// RemoveDocumentPermission revokes a user's document-level permission.
func (s *PermissionService) RemoveDocumentPermission(
	ctx context.Context,
	workspaceID, documentID, callerID, ownerID, targetUserID string,
) error {
	if err := s.requireWorkspaceOrDocumentPermission(ctx, workspaceID, documentID, callerID, ownerID, models.PermissionManage); err != nil {
		return err
	}
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return fmt.Errorf("invalid document ID: %w", err)
	}
	targetUUID, err := uuid.Parse(targetUserID)
	if err != nil {
		return fmt.Errorf("invalid target user ID: %w", err)
	}

	return s.db.DeleteDocumentPermission(ctx, store.DeleteDocumentPermissionParams{
		DocumentID: docUUID,
		UserID:     targetUUID,
	})
}

// SetHeadingPermission grants fine-grained heading-level permission.
func (s *PermissionService) SetHeadingPermission(
	ctx context.Context,
	workspaceID, documentID, callerID, ownerID, targetUserID, headingAnchor string,
	level models.PermissionLevel,
) (*models.HeadingPermission, error) {
	if err := s.requireWorkspaceOrDocumentPermission(ctx, workspaceID, documentID, callerID, ownerID, models.PermissionManage); err != nil {
		return nil, err
	}
	wsUUID, err := uuid.Parse(workspaceID)
	if err != nil {
		return nil, fmt.Errorf("invalid workspace ID: %w", err)
	}
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}
	targetUUID, err := uuid.Parse(targetUserID)
	if err != nil {
		return nil, fmt.Errorf("invalid target user ID: %w", err)
	}

	if _, err := s.db.GetWorkspaceMember(ctx, store.GetWorkspaceMemberParams{
		WorkspaceID: wsUUID,
		UserID:      targetUUID,
	}); err != nil {
		return nil, fmt.Errorf("target user not in workspace")
	}

	perm, err := s.db.UpsertHeadingPermission(ctx, store.UpsertHeadingPermissionParams{
		DocumentID:    docUUID,
		UserID:        targetUUID,
		HeadingAnchor: headingAnchor,
		Level:         store.PermissionLevel(level),
	})
	if err != nil {
		return nil, err
	}

	return &models.HeadingPermission{
		ID:            perm.ID.String(),
		DocumentID:    perm.DocumentID.String(),
		UserID:        perm.UserID.String(),
		HeadingAnchor: perm.HeadingAnchor,
		Level:         models.PermissionLevel(perm.Level),
		CreatedAt:     perm.CreatedAt,
	}, nil
}

// ListPermissions returns all collaborators for a document.
func (s *PermissionService) ListPermissions(ctx context.Context, documentID string) ([]*models.DocumentPermission, error) {
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	rows, err := s.db.ListPermissionsWithUsername(ctx, docUUID)
	if err != nil {
		return nil, err
	}

	result := make([]*models.DocumentPermission, len(rows))
	for i, row := range rows {
		result[i] = &models.DocumentPermission{
			ID:         row.ID.String(),
			DocumentID: row.DocumentID.String(),
			UserID:     row.UserID.String(),
			Level:      models.PermissionLevel(row.Level),
			CreatedAt:  row.CreatedAt,
			Username:   row.Username,
		}
	}
	return result, nil
}

// SetDocumentPermissionByUsername grants or updates a user's document-level permission using their username.
func (s *PermissionService) SetDocumentPermissionByUsername(
	ctx context.Context,
	workspaceID, documentID, callerID, ownerID, targetUsername string,
	level models.PermissionLevel,
) (*models.DocumentPermission, error) {
	if err := s.requireWorkspaceOrDocumentPermission(ctx, workspaceID, documentID, callerID, ownerID, models.PermissionManage); err != nil {
		return nil, err
	}
	wsUUID, err := uuid.Parse(workspaceID)
	if err != nil {
		return nil, fmt.Errorf("invalid workspace ID: %w", err)
	}
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	// Get user ID from username
	targetUser, err := s.db.GetUserByUsername(ctx, targetUsername)
	if errors.Is(err, store.ErrNotFound) {
		return nil, fmt.Errorf("user not found: %s", targetUsername)
	}
	if err != nil {
		return nil, fmt.Errorf("get user by username: %w", err)
	}

	if _, err := s.db.GetWorkspaceMember(ctx, store.GetWorkspaceMemberParams{
		WorkspaceID: wsUUID,
		UserID:      targetUser.ID,
	}); err != nil {
		return nil, fmt.Errorf("target user not in workspace")
	}

	perm, err := s.db.UpsertDocumentPermission(ctx, store.UpsertDocumentPermissionParams{
		DocumentID: docUUID,
		UserID:     targetUser.ID,
		Level:      store.PermissionLevel(level),
	})
	if err != nil {
		return nil, err
	}

	return &models.DocumentPermission{
		ID:         perm.ID.String(),
		DocumentID: perm.DocumentID.String(),
		UserID:     perm.UserID.String(),
		Level:      models.PermissionLevel(perm.Level),
		CreatedAt:  perm.CreatedAt,
	}, nil
}

// GetDocumentsWithPermission returns all documents that a user has access to (either owner or granted permission).
func (s *PermissionService) GetDocumentsWithPermission(
	ctx context.Context,
	userID string,
) ([]*models.Document, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	docs, err := s.db.ListDocumentsWithPermission(ctx, userUUID)
	if err != nil {
		return nil, err
	}

	result := make([]*models.Document, len(docs))
	for i, doc := range docs {
		result[i] = &models.Document{
			ID:          doc.ID.String(),
			WorkspaceID: doc.WorkspaceID.String(),
			OwnerID:     doc.OwnerID.String(),
			Title:       doc.Title,
			Content:     doc.Content,
			IsPublic:    doc.IsPublic,
			SortOrder:   int(doc.SortOrder),
			CreatedAt:   doc.CreatedAt,
			UpdatedAt:   doc.UpdatedAt,
		}
	}
	return result, nil
}

func (s *PermissionService) requireWorkspaceOrDocumentPermission(
	ctx context.Context,
	workspaceID, documentID, userID, ownerID string,
	required models.PermissionLevel,
) error {
	if err := s.RequireWorkspacePermission(ctx, workspaceID, userID, required); err == nil {
		return nil
	}
	return s.RequireDocumentPermission(ctx, documentID, userID, ownerID, required)
}
