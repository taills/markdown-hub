package core

import (
	"context"
	"errors"
	"fmt"

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
	ws, err := s.db.GetWorkspaceByID(ctx, workspaceID)
	if errors.Is(err, store.ErrNotFound) {
		return fmt.Errorf("%w: workspace not found", ErrUnauthorized)
	}
	if err != nil {
		return fmt.Errorf("get workspace: %w", err)
	}
	if userID == ws.OwnerID {
		return nil
	}
	member, err := s.db.GetWorkspaceMember(ctx, workspaceID, userID)
	if errors.Is(err, store.ErrNotFound) {
		return fmt.Errorf("%w: no access to workspace %s", ErrUnauthorized, workspaceID)
	}
	if err != nil {
		return fmt.Errorf("get workspace member: %w", err)
	}
	if levelValue(member.Level) < levelValue(required) {
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
	perm, err := s.db.GetDocumentPermission(ctx, documentID, userID)
	if errors.Is(err, store.ErrNotFound) {
		return fmt.Errorf("%w: no access to document %s", ErrUnauthorized, documentID)
	}
	if err != nil {
		return fmt.Errorf("get document permission: %w", err)
	}
	if levelValue(perm.Level) < levelValue(required) {
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

	oldSections := ParseHeadings(oldContent)
	newSections := ParseHeadings(newContent)

	// Build a set of changed heading anchors.
	changed := changedHeadings(oldContent, newContent, oldSections, newSections)

	for anchor := range changed {
		hp, err := s.db.GetHeadingPermission(ctx, documentID, userID, anchor)
		if errors.Is(err, store.ErrNotFound) {
			// No explicit heading rule → fall through to document-level (already checked).
			continue
		}
		if err != nil {
			return fmt.Errorf("get heading permission: %w", err)
		}
		if levelValue(hp.Level) < levelValue(models.PermissionEdit) {
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
	if _, err := s.db.GetWorkspaceMember(ctx, workspaceID, targetUserID); err != nil {
		return nil, fmt.Errorf("target user not in workspace")
	}
	return s.db.UpsertDocumentPermission(ctx, documentID, targetUserID, level)
}

// RemoveDocumentPermission revokes a user's document-level permission.
func (s *PermissionService) RemoveDocumentPermission(
	ctx context.Context,
	workspaceID, documentID, callerID, ownerID, targetUserID string,
) error {
	if err := s.requireWorkspaceOrDocumentPermission(ctx, workspaceID, documentID, callerID, ownerID, models.PermissionManage); err != nil {
		return err
	}
	return s.db.DeleteDocumentPermission(ctx, documentID, targetUserID)
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
	if _, err := s.db.GetWorkspaceMember(ctx, workspaceID, targetUserID); err != nil {
		return nil, fmt.Errorf("target user not in workspace")
	}
	return s.db.UpsertHeadingPermission(ctx, documentID, targetUserID, headingAnchor, level)
}

// ListPermissions returns all collaborators for a document.
func (s *PermissionService) ListPermissions(ctx context.Context, documentID string) ([]*models.DocumentPermission, error) {
	return s.db.ListDocumentPermissionsWithUsername(ctx, documentID)
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
	// Get user ID from username
	targetUser, err := s.db.GetUserByUsername(ctx, targetUsername)
	if errors.Is(err, store.ErrNotFound) {
		return nil, fmt.Errorf("user not found: %s", targetUsername)
	}
	if err != nil {
		return nil, fmt.Errorf("get user by username: %w", err)
	}
	if _, err := s.db.GetWorkspaceMember(ctx, workspaceID, targetUser.ID); err != nil {
		return nil, fmt.Errorf("target user not in workspace")
	}
	return s.db.UpsertDocumentPermission(ctx, documentID, targetUser.ID, level)
}

// GetDocumentsWithPermission returns all documents that a user has access to (either owner or granted permission).
func (s *PermissionService) GetDocumentsWithPermission(
	ctx context.Context,
	userID string,
) ([]*models.Document, error) {
	return s.db.ListDocumentsWithPermission(ctx, userID)
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
