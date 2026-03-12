package core

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/sqlc-dev/pqtype"

	"markdownhub/internal/models"
	"markdownhub/internal/store"
)

// AdminService provides administrative operations for superusers.
type AdminService struct {
	db *store.DB
}

// NewAdminService constructs an AdminService.
func NewAdminService(db *store.DB) *AdminService {
	return &AdminService{db: db}
}

// logOperation records an admin operation in the audit log.
func (s *AdminService) logOperation(ctx context.Context, adminID, action, targetType, targetID, targetUsername string, details map[string]interface{}, ipAddress, userAgent string) error {
	adminUUID, err := uuid.Parse(adminID)
	if err != nil {
		return fmt.Errorf("invalid admin ID: %w", err)
	}

	var targetUUID uuid.NullUUID
	if targetID != "" {
		if id, err := uuid.Parse(targetID); err == nil {
			targetUUID = uuid.NullUUID{UUID: id, Valid: true}
		}
	}

	var detailsJSON pqtype.NullRawMessage
	if details != nil {
		if data, err := json.Marshal(details); err == nil {
			detailsJSON = pqtype.NullRawMessage{RawMessage: data, Valid: true}
		}
	}

	_, err = s.db.CreateAdminLog(ctx, store.CreateAdminLogParams{
		AdminID:        adminUUID,
		Action:         action,
		TargetType:     targetType,
		TargetID:       targetUUID,
		TargetUsername: sql.NullString{String: targetUsername, Valid: targetUsername != ""},
		Details:        detailsJSON,
		IpAddress:      sql.NullString{String: ipAddress, Valid: ipAddress != ""},
		UserAgent:      sql.NullString{String: userAgent, Valid: userAgent != ""},
	})
	if err != nil {
		return fmt.Errorf("create admin log: %w", err)
	}
	return nil
}

// LogWorkspaceOperation records a workspace operation in the audit log.
// This is used by WorkspaceService to log workspace-related actions.
func (s *AdminService) LogWorkspaceOperation(ctx context.Context, userID, action, targetType, targetID, targetName string, details map[string]interface{}, ipAddress, userAgent string) error {
	return s.logOperation(ctx, userID, action, targetType, targetID, targetName, details, ipAddress, userAgent)
}

// ListUsers returns all active users (caller must be admin, check enforced at API layer).
func (s *AdminService) ListUsers(ctx context.Context) ([]*models.User, error) {
	users, err := s.db.ListUsers(ctx)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}

	var result []*models.User
	for _, u := range users {
		// Convert sql.NullString Email to string
		emailStr := ""
		if u.Email.Valid {
			emailStr = u.Email.String
		}
		// Convert ListUsersRow to models.User
		result = append(result, &models.User{
			ID:                u.ID.String(),
			Username:          u.Username,
			Email:             emailStr,
			PasswordHash:      u.PasswordHash,
			PreferredLanguage: u.PreferredLanguage,
			IsAdmin:           u.IsAdmin,
			CreatedAt:         u.CreatedAt,
			UpdatedAt:         u.UpdatedAt,
		})
	}
	return result, nil
}

// SetUserAdmin sets or unsets the admin flag for a user.
// callerID must be an admin (check enforced at API layer).
func (s *AdminService) SetUserAdmin(ctx context.Context, callerID, targetUserID string, isAdmin bool, ipAddress, userAgent string) (*models.User, error) {
	targetUUID, err := uuid.Parse(targetUserID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	u, err := s.db.UpdateUserIsAdmin(ctx, store.UpdateUserIsAdminParams{
		ID:      targetUUID,
		IsAdmin: isAdmin,
	})
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("%w: user not found", store.ErrNotFound)
		}
		return nil, fmt.Errorf("update user: %w", err)
	}

	// Log the operation
	details := map[string]interface{}{
		"is_admin": isAdmin,
	}
	_ = s.logOperation(ctx, callerID, "SET_ADMIN", "USER", targetUserID, u.Username, details, ipAddress, userAgent)

	// Convert sql.NullString Email to string
	emailStr := ""
	if u.Email.Valid {
		emailStr = u.Email.String
	}

	// Convert UpdateUserIsAdminRow to models.User
	return &models.User{
		ID:                u.ID.String(),
		Username:          u.Username,
		Email:             emailStr,
		PasswordHash:      u.PasswordHash,
		PreferredLanguage: u.PreferredLanguage,
		IsAdmin:           u.IsAdmin,
		CreatedAt:         u.CreatedAt,
		UpdatedAt:         u.UpdatedAt,
	}, nil
}

// ListLogs returns admin operation audit logs (admin only).
// limit: max number of logs to return; offset: pagination offset.
func (s *AdminService) ListLogs(ctx context.Context, limit, offset int) ([]*models.AdminLog, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100 // Default and cap limit
	}
	if offset < 0 {
		offset = 0
	}

	logs, err := s.db.ListAdminLogs(ctx, store.ListAdminLogsParams{
		Limit:  int32(limit),
		Offset: int32(offset),
	})
	if err != nil {
		return nil, fmt.Errorf("list admin logs: %w", err)
	}

	var result []*models.AdminLog
	for _, log := range logs {
		// Parse details JSON
		var details map[string]interface{}
		if log.Details.Valid {
			if err := json.Unmarshal(log.Details.RawMessage, &details); err != nil {
				// If unmarshal fails, leave details as nil
				details = nil
			}
		}

		result = append(result, &models.AdminLog{
			ID:      log.ID.String(),
			AdminID: log.AdminID.String(),
			AdminUsername: func() string {
				if log.AdminUsername.Valid {
					return log.AdminUsername.String
				}
				return ""
			}(),
			Action:     log.Action,
			TargetType: log.TargetType,
			TargetID: func() string {
				if log.TargetID.Valid {
					return log.TargetID.UUID.String()
				}
				return ""
			}(),
			TargetUsername: log.TargetUsername.String,
			Details:        details,
			IpAddress:      log.IpAddress.String,
			UserAgent:      log.UserAgent.String,
			CreatedAt:      log.CreatedAt,
		})
	}

	return result, nil
}

// DeleteUser soft-deletes a user by marking is_active = false.
// callerID must be an admin (check enforced at API layer).
func (s *AdminService) DeleteUser(ctx context.Context, callerID, targetUserID string, ipAddress, userAgent string) error {
	targetUUID, err := uuid.Parse(targetUserID)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	u, err := s.db.UpdateUserActive(ctx, store.UpdateUserActiveParams{
		ID:       targetUUID,
		IsActive: false,
	})
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("%w: user not found", store.ErrNotFound)
		}
		return fmt.Errorf("delete user: %w", err)
	}

	// Log the operation
	details := map[string]interface{}{
		"is_active": false,
	}
	_ = s.logOperation(ctx, callerID, "DELETE_USER", "USER", targetUserID, u.Username, details, ipAddress, userAgent)

	return nil
}

// GetSetting returns a setting by key.
func (s *AdminService) GetSetting(ctx context.Context, key string) (*store.Setting, error) {
	setting, err := s.db.GetSettingByKey(ctx, key)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("%w: setting not found", store.ErrNotFound)
		}
		return nil, fmt.Errorf("get setting: %w", err)
	}

	return &setting, nil
}

// UpdateSetting updates a setting value.
func (s *AdminService) UpdateSetting(ctx context.Context, key, value, description string) error {
	err := s.db.UpsertSetting(ctx, store.UpsertSettingParams{
		Key:         key,
		Value:       value,
		Description: sql.NullString{String: description, Valid: description != ""},
	})
	if err != nil {
		return fmt.Errorf("update setting: %w", err)
	}
	return nil
}

// RestoreUser reactivates a soft-deleted user.
// callerID must be an admin (check enforced at API layer).
func (s *AdminService) RestoreUser(ctx context.Context, callerID, targetUserID string) (*models.User, error) {
	targetUUID, err := uuid.Parse(targetUserID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	u, err := s.db.UpdateUserActive(ctx, store.UpdateUserActiveParams{
		ID:       targetUUID,
		IsActive: true,
	})
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("%w: user not found", store.ErrNotFound)
		}
		return nil, fmt.Errorf("restore user: %w", err)
	}

	// Log the operation
	details := map[string]interface{}{
		"is_active": true,
	}
	_ = s.logOperation(ctx, callerID, "RESTORE_USER", "USER", targetUserID, u.Username, details, "", "")

	// Convert sql.NullString Email to string
	emailStr := ""
	if u.Email.Valid {
		emailStr = u.Email.String
	}

	// Convert UpdateUserActiveRow to models.User
	return &models.User{
		ID:                u.ID.String(),
		Username:          u.Username,
		Email:             emailStr,
		PasswordHash:      u.PasswordHash,
		PreferredLanguage: u.PreferredLanguage,
		IsAdmin:           u.IsAdmin,
		CreatedAt:         u.CreatedAt,
		UpdatedAt:         u.UpdatedAt,
	}, nil
}
