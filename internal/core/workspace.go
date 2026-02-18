package core

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"markdownhub/internal/models"
	"markdownhub/internal/store"
)

// WorkspaceService manages workspaces and workspace-level permissions.
type WorkspaceService struct {
	db          *store.DB
	permService *PermissionService
}

// NewWorkspaceService constructs a WorkspaceService.
func NewWorkspaceService(db *store.DB, permService *PermissionService) *WorkspaceService {
	return &WorkspaceService{db: db, permService: permService}
}

// CreateWorkspace creates a new workspace and adds the creator as a manager.
func (s *WorkspaceService) CreateWorkspace(ctx context.Context, ownerID, name string) (*models.Workspace, error) {
	if name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidInput)
	}

	var ws *models.Workspace
	err := s.db.WithTransaction(ctx, func(tx *sql.Tx) error {
		// Create workspace
		workspace, err := s.db.CreateWorkspaceTx(ctx, tx, ownerID, name)
		if err != nil {
			return fmt.Errorf("create workspace: %w", err)
		}

		// Add owner as workspace manager
		if _, err := s.db.UpsertWorkspaceMemberTx(ctx, tx, workspace.ID, ownerID, models.PermissionManage); err != nil {
			return fmt.Errorf("add workspace owner: %w", err)
		}

		ws = workspace
		return nil
	})
	if err != nil {
		return nil, err
	}

	return ws, nil
}

// GetWorkspace returns a workspace if the user has read access.
func (s *WorkspaceService) GetWorkspace(ctx context.Context, workspaceID, userID string) (*models.Workspace, error) {
	if err := s.permService.RequireWorkspacePermission(ctx, workspaceID, userID, models.PermissionRead); err != nil {
		return nil, err
	}
	return s.db.GetWorkspaceByID(ctx, workspaceID)
}

// ListWorkspaces lists all workspaces the user belongs to.
func (s *WorkspaceService) ListWorkspaces(ctx context.Context, userID string) ([]*models.Workspace, error) {
	return s.db.ListWorkspacesByUser(ctx, userID)
}

// SetWorkspaceMemberByUsername grants or updates a member's workspace access.
func (s *WorkspaceService) SetWorkspaceMemberByUsername(
	ctx context.Context,
	workspaceID, callerID, username string,
	level models.PermissionLevel,
) (*models.WorkspaceMember, error) {
	if err := s.permService.RequireWorkspacePermission(ctx, workspaceID, callerID, models.PermissionManage); err != nil {
		return nil, err
	}
	targetUser, err := s.db.GetUserByUsername(ctx, username)
	if errors.Is(err, store.ErrNotFound) {
		return nil, fmt.Errorf("user not found: %s", username)
	}
	if err != nil {
		return nil, fmt.Errorf("get user by username: %w", err)
	}
	return s.db.UpsertWorkspaceMember(ctx, workspaceID, targetUser.ID, level)
}

// RemoveWorkspaceMember revokes a user's access to the workspace.
func (s *WorkspaceService) RemoveWorkspaceMember(ctx context.Context, workspaceID, callerID, targetUserID string) error {
	if err := s.permService.RequireWorkspacePermission(ctx, workspaceID, callerID, models.PermissionManage); err != nil {
		return err
	}
	return s.db.DeleteWorkspaceMember(ctx, workspaceID, targetUserID)
}

// ListWorkspaceMembers returns all members of a workspace.
func (s *WorkspaceService) ListWorkspaceMembers(ctx context.Context, workspaceID, userID string) ([]*models.WorkspaceMember, error) {
	if err := s.permService.RequireWorkspacePermission(ctx, workspaceID, userID, models.PermissionRead); err != nil {
		return nil, err
	}
	return s.db.ListWorkspaceMembersWithUsername(ctx, workspaceID)
}

// SetDefaultWorkspace updates a user's default workspace.
func (s *WorkspaceService) SetDefaultWorkspace(ctx context.Context, userID, workspaceID string) (*models.User, error) {
	if err := s.permService.RequireWorkspacePermission(ctx, workspaceID, userID, models.PermissionRead); err != nil {
		return nil, err
	}
	return s.db.UpdateUserDefaultWorkspace(ctx, userID, workspaceID)
}
