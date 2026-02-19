package core

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"markdownhub/internal/models"
	"markdownhub/internal/store"

	"github.com/google/uuid"
)

// UserService handles account preferences and stats.
type UserService struct {
	db *store.DB
}

// NewUserService constructs a UserService.
func NewUserService(db *store.DB) *UserService {
	return &UserService{db: db}
}

// UpdatePassword validates and updates the user's password.
func (s *UserService) UpdatePassword(ctx context.Context, userID, currentPassword, newPassword string) error {
	if currentPassword == "" || newPassword == "" {
		return fmt.Errorf("%w: password is required", ErrInvalidInput)
	}
	if len(newPassword) < 8 {
		return fmt.Errorf("%w: password must be at least 8 characters", ErrInvalidInput)
	}

	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	user, err := s.db.GetUserByID(ctx, userUUID)
	if err != nil {
		if err == sql.ErrNoRows {
			return store.ErrNotFound
		}
		return err
	}

	if err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(currentPassword)); err != nil {
		return fmt.Errorf("%w: invalid credentials", ErrUnauthorized)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	if err := s.db.UpdateUserPassword(ctx, store.UpdateUserPasswordParams{
		ID:           userUUID,
		PasswordHash: string(hash),
	}); err != nil {
		return fmt.Errorf("update password: %w", err)
	}

	return nil
}

// UpdatePreferredLanguage sets a user's preferred language.
func (s *UserService) UpdatePreferredLanguage(ctx context.Context, userID, language string) (*models.User, error) {
	lang := normalizeLanguage(language)
	if lang == "" {
		return nil, fmt.Errorf("%w: unsupported language", ErrInvalidInput)
	}

	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	user, err := s.db.UpdateUserPreferredLanguage(ctx, store.UpdateUserPreferredLanguageParams{
		ID:                userUUID,
		PreferredLanguage: lang,
	})
	if err != nil {
		return nil, fmt.Errorf("update language: %w", err)
	}

	// Convert UpdateUserPreferredLanguageRow to models.User
	return &models.User{
		ID:                user.ID.String(),
		Username:          user.Username,
		Email:             user.Email,
		PasswordHash:      user.PasswordHash,
		PreferredLanguage: user.PreferredLanguage,
		IsAdmin:           user.IsAdmin,
		CreatedAt:         user.CreatedAt,
		UpdatedAt:         user.UpdatedAt,
	}, nil
}

// GetStats aggregates user statistics.
func (s *UserService) GetStats(ctx context.Context, userID string) (*models.UserStats, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	accessible, err := s.db.CountAccessibleDocuments(ctx, userUUID)
	if err != nil {
		return nil, err
	}

	owned, err := s.db.CountOwnedDocuments(ctx, userUUID)
	if err != nil {
		return nil, err
	}

	workspaces, err := s.db.CountWorkspacesByUser(ctx, userUUID)
	if err != nil {
		return nil, err
	}

	attachments, err := s.db.CountAttachmentsUploaded(ctx, userUUID)
	if err != nil {
		return nil, err
	}

	snapshots, err := s.db.CountSnapshotsAuthored(ctx, uuid.NullUUID{UUID: userUUID, Valid: true})
	if err != nil {
		return nil, err
	}

	return &models.UserStats{
		AccessibleDocuments: int(accessible),
		OwnedDocuments:      int(owned),
		Workspaces:          int(workspaces),
		AttachmentsUploaded: int(attachments),
		SnapshotsAuthored:   int(snapshots),
	}, nil
}

func normalizeLanguage(lang string) string {
	if lang == "" {
		return ""
	}
	lower := strings.ToLower(lang)
	switch lower {
	case "en", "en-us", "en-gb":
		return "en"
	case "zh", "zh-cn", "zh-hans":
		return "zh-CN"
	case "zh-tw", "zh-hant", "zh-hk", "zh-mo":
		return "zh-TW"
	default:
		return ""
	}
}

// -------------------------------------------------------------------------
// Type Conversion Helpers
// -------------------------------------------------------------------------

// storeUserToModel converts a store.User to *models.User
func storeUserToModel(u *store.User) *models.User {
	return &models.User{
		ID:                u.ID.String(),
		Username:          u.Username,
		Email:             u.Email,
		PasswordHash:      u.PasswordHash,
		PreferredLanguage: u.PreferredLanguage,
		IsAdmin:           u.IsAdmin,
		CreatedAt:         u.CreatedAt,
		UpdatedAt:         u.UpdatedAt,
	}
}
