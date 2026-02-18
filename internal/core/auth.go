// Package core implements MarkdownHub business logic.
package core

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/crypto/bcrypt"

	"markdownhub/internal/models"
	"markdownhub/internal/store"
)

// ErrUnauthorized is returned when a user lacks the required permission.
var ErrUnauthorized = errors.New("unauthorized")

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
func (s *AuthService) Register(ctx context.Context, username, email, password string) (*models.User, error) {
	if username == "" || email == "" || password == "" {
		return nil, fmt.Errorf("%w: username, email, and password are required", ErrInvalidInput)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}
	user, err := s.db.CreateUser(ctx, username, email, string(hash))
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return user, nil
}

// Login verifies credentials and returns the user on success.
func (s *AuthService) Login(ctx context.Context, email, password string) (*models.User, error) {
	user, err := s.db.GetUserByEmail(ctx, email)
	if errors.Is(err, store.ErrNotFound) {
		return nil, fmt.Errorf("%w: invalid credentials", ErrUnauthorized)
	}
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	if err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, fmt.Errorf("%w: invalid credentials", ErrUnauthorized)
	}
	return user, nil
}

// GetUser retrieves a user by ID.
func (s *AuthService) GetUser(ctx context.Context, userID string) (*models.User, error) {
	return s.db.GetUserByID(ctx, userID)
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
