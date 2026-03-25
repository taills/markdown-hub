// Package core implements MarkdownHub business logic.
package core

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
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

// Social provider types
const (
	SocialProviderDingTalk = "dingtalk"
	SocialProviderWeCom   = "wecom"
	SocialProviderFeishu  = "feishu"
)

// SocialProviderList lists all supported providers
var SocialProviderList = []string{SocialProviderDingTalk, SocialProviderWeCom, SocialProviderFeishu}

// ErrSocialBindFailed is returned when third-party binding fails.
var ErrSocialBindFailed = errors.New("social bind failed")

// ErrSocialLoginFailed is returned when third-party login fails.
var ErrSocialLoginFailed = errors.New("social login failed")

// ErrAccountNotComplete is returned when account needs profile completion.
var ErrAccountNotComplete = errors.New("account not complete")

// SocialAccount represents a bound third-party account for API responses.
type SocialAccount struct {
	Provider         string    `json:"provider"`
	ExternalNickname string    `json:"external_nickname,omitempty"`
	BoundAt          time.Time `json:"bound_at"`
}

// CompleteStatus represents whether a user needs to complete their profile.
type CompleteStatus struct {
	NeedComplete   bool     `json:"need_complete"`
	MissingFields  []string `json:"missing_fields,omitempty"`
	TemporaryToken string   `json:"temporary_token,omitempty"`
}

// SocialLoginResult represents the result of a social login attempt.
type SocialLoginResult struct {
	Token          string         `json:"token,omitempty"`
	User           *models.User   `json:"user,omitempty"`
	NeedBind       bool           `json:"need_bind,omitempty"`
	TemporaryToken string         `json:"temporary_token,omitempty"`
	Provider       string         `json:"provider,omitempty"`
	ExternalID     string         `json:"external_id,omitempty"`
	ExternalNick   string         `json:"external_nickname,omitempty"`
}

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

		// Create root document for new user
		_, err = qtx.CreateDocument(ctx, store.CreateDocumentParams{
			OwnerID:           row.ID,
			ParentID:          uuid.NullUUID{}, // NULL for root document
			Title:             "欢迎使用 MarkdownHub",
			Content:           "# 欢迎使用 MarkdownHub\n\n这是你的第一个文档，开始你的写作之旅吧！\n\n## 功能特性\n\n- 实时协作编辑\n- Markdown 语法支持\n- 文档树形结构\n- 权限管理\n\n开始编辑这个文档，或创建新的文档。",
			Visibility:        "internal",
			InheritVisibility: true,
			SortOrder:         0,
		})
		if err != nil {
			return fmt.Errorf("create root document: %w", err)
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
// SocialService
// -------------------------------------------------------------------------

// SocialService handles third-party social login operations.
type SocialService struct {
	db           *store.DB
	authService  *AuthService
}

// NewSocialService constructs a SocialService.
func NewSocialService(db *store.DB, authService *AuthService) *SocialService {
	return &SocialService{db: db, authService: authService}
}

// IsValidProvider checks if a provider string is valid.
func IsValidProvider(provider string) bool {
	for _, p := range SocialProviderList {
		if p == provider {
			return true
		}
	}
	return false
}

// GetSocialQRURL generates a QR code URL and state for the given provider.
// The state is used to verify the callback.
func (s *SocialService) GetSocialQRURL(provider string) (string, string, error) {
	if !IsValidProvider(provider) {
		return "", "", fmt.Errorf("%w: invalid provider", ErrInvalidInput)
	}

	// Generate state for CSRF protection
	stateBytes := make([]byte, 32)
	if _, err := rand.Read(stateBytes); err != nil {
		return "", "", fmt.Errorf("generate state: %w", err)
	}
	state := hex.EncodeToString(stateBytes)

	// Generate QR URL based on provider
	// Note: In production, these URLs would come from configuration
	var qrURL string
	switch provider {
	case SocialProviderDingTalk:
		// DingTalk QR login URL format (placeholder - would be configured)
		qrURL = "https://oapi.dingtalk.com/connect/qrconnect?appid=YOUR_APP_ID&response_type=code&scope=snsapi_login&state=" + state + "&redirect_uri=YOUR_REDIRECT_URI"
	case SocialProviderWeCom:
		// WeCom QR login URL format (placeholder - would be configured)
		qrURL = "https://open.work.weixin.qq.com/wwopen/sso/qrConnect?appid=YOUR_APP_ID&agentid=YOUR_AGENT_ID&state=" + state + "&redirect_uri=YOUR_REDIRECT_URI"
	case SocialProviderFeishu:
		// Feishu QR login URL format (placeholder - would be configured)
		qrURL = "https://open.feishu.cn/open-apis/authen/authorize?app_id=YOUR_APP_ID&redirect_uri=YOUR_REDIRECT_URI&state=" + state + "&scope=contact:user.base:readonly"
	}

	return qrURL, state, nil
}

// SocialUserInfo holds user info from third-party provider.
type SocialUserInfo struct {
	ExternalID   string
	ExternalNick string
	AccessToken  string
	RefreshToken string
	ExpiresAt    time.Time
}

// ExchangeCodeForUserInfo exchanges an authorization code for user info.
// This is a placeholder - actual implementation would call provider APIs.
func (s *SocialService) ExchangeCodeForUserInfo(provider, code string) (*SocialUserInfo, error) {
	if !IsValidProvider(provider) {
		return nil, fmt.Errorf("%w: invalid provider", ErrInvalidInput)
	}
	if code == "" {
		return nil, fmt.Errorf("%w: code is required", ErrInvalidInput)
	}

	// TODO: In production, exchange code with actual provider APIs
	// This is a placeholder implementation that returns mock data
	// Real implementation would:
	// 1. Call DingTalk/WeCom/Feishu API to exchange code for access token
	// 2. Call provider API to get user info
	// 3. Return actual user info

	return &SocialUserInfo{
		ExternalID:   "external_" + provider + "_" + code,
		ExternalNick: "User_" + provider,
		AccessToken:  "access_" + code,
		RefreshToken: "refresh_" + code,
		ExpiresAt:    time.Now().Add(2 * time.Hour),
	}, nil
}

// HandleSocialCallback handles the callback from third-party login.
// Returns login result - either full login or need bind with temporary token.
func (s *SocialService) HandleSocialCallback(ctx context.Context, provider, code, state string) (*SocialLoginResult, error) {
	if !IsValidProvider(provider) {
		return nil, fmt.Errorf("%w: invalid provider", ErrInvalidInput)
	}

	// Exchange code for user info
	userInfo, err := s.ExchangeCodeForUserInfo(provider, code)
	if err != nil {
		return nil, fmt.Errorf("%w: exchange code: %v", ErrSocialLoginFailed, err)
	}

	// Check if this external user is already bound to a user
	account, err := s.db.GetSocialAccountByProviderAndExternalID(ctx, store.GetSocialAccountByProviderAndExternalIDParams{
		Provider:       provider,
		ExternalUserID: userInfo.ExternalID,
	})
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		return nil, fmt.Errorf("check social account: %w", err)
	}

	if err == nil {
		// Account is bound - log in the user
		user, err := s.authService.GetUser(ctx, account.UserID.String())
		if err != nil {
			return nil, fmt.Errorf("get bound user: %w", err)
		}

		// Generate token
		token, err := generateUserToken(user.ID)
		if err != nil {
			return nil, fmt.Errorf("generate token: %w", err)
		}

		return &SocialLoginResult{
			Token:    token,
			User:     user,
			NeedBind: false,
		}, nil
	}

	// Account not bound - return temporary token for binding
	tempToken, err := generateTemporaryToken(userInfo.ExternalID, provider)
	if err != nil {
		return nil, fmt.Errorf("generate temp token: %w", err)
	}

	return &SocialLoginResult{
		NeedBind:       true,
		TemporaryToken: tempToken,
		Provider:       provider,
		ExternalID:     userInfo.ExternalID,
		ExternalNick:   userInfo.ExternalNick,
	}, nil
}

// BindSocialAccount binds a third-party account to an existing user.
func (s *SocialService) BindSocialAccount(ctx context.Context, userID, provider, code string) (*SocialAccount, error) {
	if !IsValidProvider(provider) {
		return nil, fmt.Errorf("%w: invalid provider", ErrInvalidInput)
	}

	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	// Verify user exists
	_, err = s.db.GetUserByID(ctx, userUUID)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	// Get user info from provider
	userInfo, err := s.ExchangeCodeForUserInfo(provider, code)
	if err != nil {
		return nil, fmt.Errorf("%w: exchange code: %v", ErrSocialBindFailed, err)
	}

	// Check if already bound to another user
	existing, err := s.db.GetSocialAccountByProviderAndExternalID(ctx, store.GetSocialAccountByProviderAndExternalIDParams{
		Provider:       provider,
		ExternalUserID: userInfo.ExternalID,
	})
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		return nil, fmt.Errorf("check existing binding: %w", err)
	}
	if err == nil {
		if existing.UserID.String() != userID {
			return nil, fmt.Errorf("%w: already bound to another user", ErrSocialBindFailed)
		}
		// Already bound to this user, return existing
		return &SocialAccount{
			Provider:         existing.Provider,
			ExternalNickname: existing.ExternalNickname.String,
			BoundAt:          existing.BoundAt,
		}, nil
	}

	// Create new binding
	account, err := s.db.CreateSocialAccount(ctx, store.CreateSocialAccountParams{
		UserID:           userUUID,
		Provider:         provider,
		ExternalUserID:   userInfo.ExternalID,
		ExternalNickname: sql.NullString{String: userInfo.ExternalNick, Valid: userInfo.ExternalNick != ""},
		AccessToken:      sql.NullString{String: userInfo.AccessToken, Valid: userInfo.AccessToken != ""},
		RefreshToken:     sql.NullString{String: userInfo.RefreshToken, Valid: userInfo.RefreshToken != ""},
		TokenExpiresAt:   sql.NullTime{Time: userInfo.ExpiresAt, Valid: !userInfo.ExpiresAt.IsZero()},
	})
	if err != nil {
		return nil, fmt.Errorf("%w: create social account: %v", ErrSocialBindFailed, err)
	}

	return &SocialAccount{
		Provider:         account.Provider,
		ExternalNickname: account.ExternalNickname.String,
		BoundAt:          account.BoundAt,
	}, nil
}

// UnbindSocialAccount unbinds a third-party account from a user.
func (s *SocialService) UnbindSocialAccount(ctx context.Context, userID, provider string) error {
	if !IsValidProvider(provider) {
		return fmt.Errorf("%w: invalid provider", ErrInvalidInput)
	}

	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	// Check if user has password login (cannot unbind if no password)
	user, err := s.db.GetUserByID(ctx, userUUID)
	if err != nil {
		return fmt.Errorf("user not found: %w", err)
	}

	// Password hash exists means user has password
	if user.PasswordHash == "" {
		return fmt.Errorf("%w: cannot unbind - no password set", ErrForbidden)
	}

	err = s.db.DeleteSocialAccount(ctx, store.DeleteSocialAccountParams{
		UserID:   userUUID,
		Provider: provider,
	})
	if err != nil {
		return fmt.Errorf("delete social account: %w", err)
	}

	return nil
}

// ListSocialAccounts lists all bound social accounts for a user.
func (s *SocialService) ListSocialAccounts(ctx context.Context, userID string) ([]SocialAccount, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	accounts, err := s.db.ListSocialAccountsByUser(ctx, userUUID)
	if err != nil {
		return nil, fmt.Errorf("list social accounts: %w", err)
	}

	result := make([]SocialAccount, len(accounts))
	for i, acc := range accounts {
		result[i] = SocialAccount{
			Provider:         acc.Provider,
			ExternalNickname: acc.ExternalNickname.String,
			BoundAt:          acc.BoundAt,
		}
	}

	return result, nil
}

// GetCompleteStatus checks if a user needs to complete their profile.
func (s *SocialService) GetCompleteStatus(ctx context.Context, userID string) (*CompleteStatus, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	user, err := s.db.GetUserByID(ctx, userUUID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	// Check if user has username and password
	missingFields := []string{}
	if user.Username == "" || strings.HasPrefix(user.Username, "temp_") {
		missingFields = append(missingFields, "username")
	}
	if user.PasswordHash == "" {
		missingFields = append(missingFields, "password")
	}

	if len(missingFields) > 0 {
		// Generate temporary token
		tempToken, err := generateTemporaryToken(user.ID.String(), "complete")
		if err != nil {
			return nil, fmt.Errorf("generate temp token: %w", err)
		}
		return &CompleteStatus{
			NeedComplete:   true,
			MissingFields:  missingFields,
			TemporaryToken: tempToken,
		}, nil
	}

	return &CompleteStatus{
		NeedComplete: false,
	}, nil
}

// CompleteProfile completes a user's profile after third-party login.
func (s *SocialService) CompleteProfile(ctx context.Context, temporaryToken, username, password string) (*models.User, error) {
	if username == "" || password == "" {
		return nil, fmt.Errorf("%w: username and password are required", ErrInvalidInput)
	}

	// Validate username
	if len(username) < 3 || len(username) > 50 {
		return nil, fmt.Errorf("%w: username must be 3-50 characters", ErrInvalidInput)
	}
	if !regexp.MustCompile(`^[a-zA-Z0-9_]+$`).MatchString(username) {
		return nil, fmt.Errorf("%w: username can only contain letters, numbers, and underscores", ErrInvalidInput)
	}
	if len(password) < 6 {
		return nil, fmt.Errorf("%w: password must be at least 6 characters", ErrInvalidInput)
	}

	// Parse temporary token to get user ID and provider
	userID, _, err := parseTemporaryToken(temporaryToken)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid temporary token", ErrUnauthorized)
	}

	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	// Get user
	user, err := s.db.GetUserByID(ctx, userUUID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	// Update username and password
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	err = s.db.UpdateUserPassword(ctx, store.UpdateUserPasswordParams{
		ID:           userUUID,
		PasswordHash: string(hash),
	})
	if err != nil {
		return nil, fmt.Errorf("update password: %w", err)
	}

	// Update username
	_, err = s.db.UpdateUserUsername(ctx, store.UpdateUserUsernameParams{
		ID:       userUUID,
		Username: username,
	})
	if err != nil {
		return nil, fmt.Errorf("update username: %w", err)
	}

	// Activate user
	_, err = s.db.UpdateUserActive(ctx, store.UpdateUserActiveParams{
		ID:       userUUID,
		IsActive: true,
	})
	if err != nil {
		return nil, fmt.Errorf("activate user: %w", err)
	}

	// Generate token
	token, err := generateUserToken(user.ID.String())
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}
	_ = token // Token is generated but we return the user - caller generates final token

	// Convert to model
	emailStr := ""
	if user.Email.Valid {
		emailStr = user.Email.String
	}

	return &models.User{
		ID:                user.ID.String(),
		Username:          username,
		Email:             emailStr,
		PasswordHash:      "", // Don't return password hash
		PreferredLanguage: user.PreferredLanguage,
		IsAdmin:           user.IsAdmin,
		CreatedAt:         user.CreatedAt,
		UpdatedAt:         user.UpdatedAt,
	}, nil
}

// generateUserToken generates a JWT token for a user.
// This is a placeholder - actual implementation would use JWT.
func generateUserToken(userID string) (string, error) {
	// TODO: Use actual JWT generation
	// For now, return a placeholder
	return "jwt_token_placeholder_" + userID, nil
}

// temporary tokens are stored in memory for simplicity
// In production, use Redis or database
var temporaryTokens = make(map[string]tempTokenData)

type tempTokenData struct {
	UserID    string
	Provider  string
	CreatedAt time.Time
}

// generateTemporaryToken generates a temporary token for incomplete accounts.
func generateTemporaryToken(userID, provider string) (string, error) {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	token := hex.EncodeToString(tokenBytes)

	temporaryTokens[token] = tempTokenData{
		UserID:    userID,
		Provider:  provider,
		CreatedAt: time.Now(),
	}

	return token, nil
}

// parseTemporaryToken parses and validates a temporary token.
func parseTemporaryToken(token string) (string, string, error) {
	data, ok := temporaryTokens[token]
	if !ok {
		return "", "", fmt.Errorf("invalid or expired token")
	}

	// Token expires after 30 minutes
	if time.Since(data.CreatedAt) > 30*time.Minute {
		delete(temporaryTokens, token)
		return "", "", fmt.Errorf("token expired")
	}

	return data.UserID, data.Provider, nil
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
