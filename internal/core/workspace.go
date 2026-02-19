package core

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"markdownhub/internal/models"
	"markdownhub/internal/store"

	"github.com/google/uuid"
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
	err := s.db.WithTransaction(ctx, func(qtx *store.Queries) error {
		// Parse owner ID
		oid, err := uuid.Parse(ownerID)
		if err != nil {
			return fmt.Errorf("invalid owner ID: %w", err)
		}

		// Create workspace
		workspace, err := qtx.CreateWorkspace(ctx, store.CreateWorkspaceParams{
			OwnerID: oid,
			Name:    name,
		})
		if err != nil {
			return fmt.Errorf("create workspace: %w", err)
		}

		// Add owner as workspace manager
		_, err = qtx.UpsertWorkspaceMember(ctx, store.UpsertWorkspaceMemberParams{
			WorkspaceID: workspace.ID,
			UserID:      oid,
			Level:       store.PermissionLevelManage,
		})
		if err != nil {
			return fmt.Errorf("add workspace owner: %w", err)
		}

		ws = storeWorkspaceToModel(&workspace)
		return nil
	})
	if err != nil {
		return nil, err
	}

	return ws, nil
}

// GetWorkspace returns a workspace if the user has read access.
// If userID is empty and the workspace is public, anyone can access it.
func (s *WorkspaceService) GetWorkspace(ctx context.Context, workspaceID, userID string) (*models.Workspace, error) {
	workspaceUUID, err := uuid.Parse(workspaceID)
	if err != nil {
		return nil, fmt.Errorf("invalid workspace ID: %w", err)
	}

	ws, err := s.db.GetWorkspaceByID(ctx, workspaceUUID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, store.ErrNotFound
		}
		return nil, err
	}

	modelWs := storeWorkspaceToModel(&ws)

	// Allow public access for public workspaces
	if modelWs.IsPublic {
		return modelWs, nil
	}

	// Otherwise require authentication and permission
	if userID == "" {
		return nil, ErrUnauthorized
	}

	if err := s.permService.RequireWorkspacePermission(ctx, workspaceID, userID, models.PermissionRead); err != nil {
		return nil, err
	}

	return modelWs, nil
}

// ListWorkspaces lists all workspaces the user belongs to.
func (s *WorkspaceService) ListWorkspaces(ctx context.Context, userID string) ([]*models.Workspace, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	workspaces, err := s.db.ListWorkspacesByMember(ctx, userUUID)
	if err != nil {
		return nil, err
	}

	return storeWorkspacesToModels(workspaces), nil
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
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("user not found: %s", username)
	}
	if err != nil {
		return nil, fmt.Errorf("get user by username: %w", err)
	}

	workspaceUUID, err := uuid.Parse(workspaceID)
	if err != nil {
		return nil, fmt.Errorf("invalid workspace ID: %w", err)
	}

	member, err := s.db.UpsertWorkspaceMember(ctx, store.UpsertWorkspaceMemberParams{
		WorkspaceID: workspaceUUID,
		UserID:      targetUser.ID,
		Level:       store.PermissionLevel(level),
	})
	if err != nil {
		return nil, err
	}

	return storeWorkspaceMemberToModel(&member), nil
}

// RemoveWorkspaceMember revokes a user's access to the workspace.
func (s *WorkspaceService) RemoveWorkspaceMember(ctx context.Context, workspaceID, callerID, targetUserID string) error {
	if err := s.permService.RequireWorkspacePermission(ctx, workspaceID, callerID, models.PermissionManage); err != nil {
		return err
	}

	workspaceUUID, err := uuid.Parse(workspaceID)
	if err != nil {
		return fmt.Errorf("invalid workspace ID: %w", err)
	}

	targetUUID, err := uuid.Parse(targetUserID)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	return s.db.DeleteWorkspaceMember(ctx, store.DeleteWorkspaceMemberParams{
		WorkspaceID: workspaceUUID,
		UserID:      targetUUID,
	})
}

// ListWorkspaceMembers returns all members of a workspace.
func (s *WorkspaceService) ListWorkspaceMembers(ctx context.Context, workspaceID, userID string) ([]*models.WorkspaceMember, error) {
	if err := s.permService.RequireWorkspacePermission(ctx, workspaceID, userID, models.PermissionRead); err != nil {
		return nil, err
	}

	workspaceUUID, err := uuid.Parse(workspaceID)
	if err != nil {
		return nil, fmt.Errorf("invalid workspace ID: %w", err)
	}

	members, err := s.db.ListWorkspaceMembers(ctx, workspaceUUID)
	if err != nil {
		return nil, err
	}

	result := make([]*models.WorkspaceMember, len(members))
	for i := range members {
		result[i] = &models.WorkspaceMember{
			ID:          members[i].ID.String(),
			WorkspaceID: members[i].WorkspaceID.String(),
			UserID:      members[i].UserID.String(),
			Level:       models.PermissionLevel(members[i].Level),
			CreatedAt:   members[i].CreatedAt,
			Username:    members[i].Username,
		}
	}

	return result, nil
}

// UpdateWorkspaceName updates workspace name (requires manage permission).
func (s *WorkspaceService) UpdateWorkspaceName(ctx context.Context, workspaceID, userID, name string) (*models.Workspace, error) {
	if name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidInput)
	}

	if err := s.permService.RequireWorkspacePermission(ctx, workspaceID, userID, models.PermissionManage); err != nil {
		return nil, err
	}

	workspaceUUID, err := uuid.Parse(workspaceID)
	if err != nil {
		return nil, fmt.Errorf("invalid workspace ID: %w", err)
	}

	ws, err := s.db.UpdateWorkspaceName(ctx, store.UpdateWorkspaceNameParams{
		ID:   workspaceUUID,
		Name: name,
	})
	if err != nil {
		return nil, err
	}

	return storeWorkspaceToModel(&ws), nil
}

// SetPublicStatus updates the public status of a workspace (requires manage permission).
func (s *WorkspaceService) SetPublicStatus(ctx context.Context, workspaceID, userID string, isPublic bool) (*models.Workspace, error) {
	if err := s.permService.RequireWorkspacePermission(ctx, workspaceID, userID, models.PermissionManage); err != nil {
		return nil, err
	}

	workspaceUUID, err := uuid.Parse(workspaceID)
	if err != nil {
		return nil, fmt.Errorf("invalid workspace ID: %w", err)
	}

	ws, err := s.db.UpdateWorkspacePublicStatus(ctx, store.UpdateWorkspacePublicStatusParams{
		ID:       workspaceUUID,
		IsPublic: isPublic,
	})
	if err != nil {
		return nil, err
	}

	return storeWorkspaceToModel(&ws), nil
}

// ReorderWorkspaces persists a new sort order for the given workspace IDs.
// The caller must own/be a member of the workspaces; the store updates sort_order = index.
func (s *WorkspaceService) ReorderWorkspaces(ctx context.Context, userID string, ids []string) error {
	if len(ids) == 0 {
		return nil
	}

	// Update each workspace's sort order
	for i, id := range ids {
		workspaceUUID, err := uuid.Parse(id)
		if err != nil {
			return fmt.Errorf("invalid workspace ID %s: %w", id, err)
		}

		err = s.db.UpdateWorkspaceSortOrder(ctx, store.UpdateWorkspaceSortOrderParams{
			ID:        workspaceUUID,
			SortOrder: int32(i),
		})
		if err != nil {
			return fmt.Errorf("update sort order for workspace %s: %w", id, err)
		}
	}

	return nil
}

// -------------------------------------------------------------------------
// Type Conversion Helpers
// -------------------------------------------------------------------------

// storeWorkspaceToModel converts a store.Workspace to *models.Workspace
func storeWorkspaceToModel(w *store.Workspace) *models.Workspace {
	return &models.Workspace{
		ID:        w.ID.String(),
		OwnerID:   w.OwnerID.String(),
		Name:      w.Name,
		IsPublic:  w.IsPublic,
		SortOrder: int(w.SortOrder),
		CreatedAt: w.CreatedAt,
		UpdatedAt: w.UpdatedAt,
	}
}

// storeWorkspacesToModels converts []store.Workspace to []*models.Workspace
func storeWorkspacesToModels(workspaces []store.Workspace) []*models.Workspace {
	result := make([]*models.Workspace, len(workspaces))
	for i := range workspaces {
		result[i] = storeWorkspaceToModel(&workspaces[i])
	}
	return result
}

// storeWorkspaceMemberToModel converts a store.WorkspaceMember to *models.WorkspaceMember
func storeWorkspaceMemberToModel(m *store.WorkspaceMember) *models.WorkspaceMember {
	return &models.WorkspaceMember{
		ID:          m.ID.String(),
		WorkspaceID: m.WorkspaceID.String(),
		UserID:      m.UserID.String(),
		Level:       models.PermissionLevel(m.Level),
		CreatedAt:   m.CreatedAt,
	}
}
