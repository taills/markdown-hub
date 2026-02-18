package core

import (
	"context"
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"

	"markdownhub/internal/models"
	"markdownhub/internal/store"
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
	user, err := s.db.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}
	if err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(currentPassword)); err != nil {
		return fmt.Errorf("%w: invalid credentials", ErrUnauthorized)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	if err := s.db.UpdateUserPassword(ctx, userID, string(hash)); err != nil {
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
	user, err := s.db.UpdateUserPreferredLanguage(ctx, userID, lang)
	if err != nil {
		return nil, fmt.Errorf("update language: %w", err)
	}
	return user, nil
}

// GetStats aggregates user statistics.
func (s *UserService) GetStats(ctx context.Context, userID string) (*models.UserStats, error) {
	accessible, err := s.db.CountAccessibleDocuments(ctx, userID)
	if err != nil {
		return nil, err
	}
	owned, err := s.db.CountOwnedDocuments(ctx, userID)
	if err != nil {
		return nil, err
	}
	workspaces, err := s.db.CountWorkspacesByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	attachments, err := s.db.CountAttachmentsUploaded(ctx, userID)
	if err != nil {
		return nil, err
	}
	snapshots, err := s.db.CountSnapshotsAuthored(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &models.UserStats{
		AccessibleDocuments: accessible,
		OwnedDocuments:      owned,
		Workspaces:          workspaces,
		AttachmentsUploaded: attachments,
		SnapshotsAuthored:   snapshots,
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
