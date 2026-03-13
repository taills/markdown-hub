// Package core implements MarkdownHub business logic.
package core

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"markdownhub/internal/models"
	"markdownhub/internal/store"
)

// ErrUnauthorized is returned when a user lacks the required permission.
var ErrUnauthorized = errors.New("unauthorized")

// ErrForbidden is returned when user doesn't have permission.
var ErrForbidden = errors.New("forbidden")

// ErrInvalidInput is returned for malformed request data.
var ErrInvalidInput = errors.New("invalid input")

// -------------------------------------------------------------------------
// AuthService
// -------------------------------------------------------------------------

// AuthService handles user registration and authentication.
type AuthService struct {
	db *store.DB
}

// NewAuthService constructs an AuthService.
func NewAuthService(db *store.DB) *AuthService {
	return &AuthService{db: db}
}

// Register creates a new user account.
// email is optional and can be empty string.
func (s *AuthService) Register(ctx context.Context, username, email, password string) (*models.User, error) {
	if username == "" || password == "" {
		return nil, fmt.Errorf("%w: username and password are required", ErrInvalidInput)
	}
	// Validate username length
	if len(username) < 3 || len(username) > 50 {
		return nil, fmt.Errorf("%w: username must be 3-50 characters", ErrInvalidInput)
	}
	// Validate username format (alphanumeric and underscore only)
	if !regexp.MustCompile(`^[a-zA-Z0-9_]+$`).MatchString(username) {
		return nil, fmt.Errorf("%w: username can only contain letters, numbers, and underscores", ErrInvalidInput)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	// Convert email to sql.NullString
	var emailNull sql.NullString
	if email != "" {
		emailNull = sql.NullString{String: email, Valid: true}
	}

	var user *models.User
	err = s.db.WithTransaction(ctx, func(qtx *store.Queries) error {
		// Check if this is the first user
		count, err := qtx.CountUsers(ctx)
		if err != nil {
			return fmt.Errorf("count users: %w", err)
		}

		// First user becomes admin
		isAdmin := count == 0

		// Create user within transaction
		row, err := qtx.CreateUserWithAdmin(ctx, store.CreateUserWithAdminParams{
			Username:     username,
			Email:        emailNull,
			PasswordHash: string(hash),
			IsAdmin:      isAdmin,
		})
		if err != nil {
			return fmt.Errorf("create user: %w", err)
		}

		// Convert sql.NullString to string for model
		emailStr := ""
		if row.Email.Valid {
			emailStr = row.Email.String
		}

		user = &models.User{
			ID:                row.ID.String(),
			Username:          row.Username,
			Email:             emailStr,
			PasswordHash:      row.PasswordHash,
			PreferredLanguage: row.PreferredLanguage,
			IsAdmin:           row.IsAdmin,
			CreatedAt:         row.CreatedAt,
			UpdatedAt:         row.UpdatedAt,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return user, nil
}

// Login verifies credentials and returns the user on success.
// Uses username instead of email for authentication.
func (s *AuthService) Login(ctx context.Context, username, password string) (*models.User, error) {
	user, err := s.db.GetUserByUsername(ctx, username)
	if errors.Is(err, store.ErrNotFound) {
		return nil, fmt.Errorf("%w: invalid credentials", ErrUnauthorized)
	}
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	if err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, fmt.Errorf("%w: invalid credentials", ErrUnauthorized)
	}

	// Convert sql.NullString to string for model
	emailStr := ""
	if user.Email.Valid {
		emailStr = user.Email.String
	}

	return &models.User{
		ID:                user.ID.String(),
		Username:          user.Username,
		Email:             emailStr,
		PasswordHash:      user.PasswordHash,
		PreferredLanguage: user.PreferredLanguage,
		IsAdmin:           user.IsAdmin,
		CreatedAt:         user.CreatedAt,
		UpdatedAt:         user.UpdatedAt,
	}, nil
}

// GetUser retrieves a user by ID.
func (s *AuthService) GetUser(ctx context.Context, userID string) (*models.User, error) {
	uuid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}
	user, err := s.db.GetUserByID(ctx, uuid)
	if err != nil {
		return nil, err
	}

	// Convert sql.NullString to string for model
	emailStr := ""
	if user.Email.Valid {
		emailStr = user.Email.String
	}

	return &models.User{
		ID:                user.ID.String(),
		Username:          user.Username,
		Email:             emailStr,
		PasswordHash:      user.PasswordHash,
		PreferredLanguage: user.PreferredLanguage,
		IsAdmin:           user.IsAdmin,
		CreatedAt:         user.CreatedAt,
		UpdatedAt:         user.UpdatedAt,
	}, nil
}

// -------------------------------------------------------------------------
// MarkdownParser
// -------------------------------------------------------------------------

var headingRe = regexp.MustCompile(`(?m)^(#{1,6})\s+(.+)$`)

// ParseHeadings builds a slice of HeadingSection from raw Markdown content,
// mapping each heading to its byte range in the document.
func ParseHeadings(content string) []models.HeadingSection {
	matches := headingRe.FindAllStringSubmatchIndex(content, -1)
	sections := make([]models.HeadingSection, 0, len(matches))

	for i, m := range matches {
		hashes := content[m[2]:m[3]]
		title := strings.TrimSpace(content[m[4]:m[5]])
		anchor := toAnchor(title)
		level := len(hashes)
		startByte := m[0]
		endByte := len(content)
		if i+1 < len(matches) {
			endByte = matches[i+1][0]
		}
		sections = append(sections, models.HeadingSection{
			Anchor:    anchor,
			Title:     title,
			Level:     level,
			StartByte: startByte,
			EndByte:   endByte,
		})
	}
	return sections
}

// toAnchor converts a heading title to a URL-safe lowercase anchor.
func toAnchor(title string) string {
	var sb strings.Builder
	prevDash := false
	for _, r := range strings.ToLower(title) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			sb.WriteRune(r)
			prevDash = false
		} else if !prevDash {
			sb.WriteRune('-')
			prevDash = true
		}
	}
	return strings.Trim(sb.String(), "-")
}
