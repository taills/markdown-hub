// Package api implements HTTP and WebSocket handlers for MarkdownHub.
package api

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/lib/pq"

	"markdownhub/internal/core"
	"markdownhub/internal/store"
)

const jwtCookieName = "mh_token"

// jwtSecret must be set before serving requests (injected via Server).
var jwtSecret []byte

// claims holds the JWT payload.
type claims struct {
	UserID string `json:"user_id"`
	jwt.RegisteredClaims
}

// generateToken mints a signed JWT for the given user.
func generateToken(userID string) (string, error) {
	c := claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, c)
	return token.SignedString(jwtSecret)
}

// parseToken validates a JWT and returns the embedded claims.
func parseToken(tokenString string) (*claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	c, ok := token.Claims.(*claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return c, nil
}

// authMiddleware extracts the JWT from the Authorization header or cookie
// and stores the user ID in the Gin context.
func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := ""
		// Try Authorization: Bearer <token>
		if auth := c.GetHeader("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			tokenString = strings.TrimPrefix(auth, "Bearer ")
		}
		// Fall back to cookie.
		if tokenString == "" {
			if cookie, err := c.Cookie(jwtCookieName); err == nil {
				tokenString = cookie
			}
		}
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			c.Abort()
			return
		}
		cl, err := parseToken(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}
		c.Set("user_id", cl.UserID)
		c.Next()
	}
}

// optionalAuthMiddleware extracts the JWT if present but doesn't require it.
// This allows anonymous access to public resources while still identifying
// authenticated users.
func optionalAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := ""
		// Try Authorization: Bearer <token>
		if auth := c.GetHeader("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			tokenString = strings.TrimPrefix(auth, "Bearer ")
		}
		// Fall back to cookie.
		if tokenString == "" {
			if cookie, err := c.Cookie(jwtCookieName); err == nil {
				tokenString = cookie
			}
		}
		// If token exists and is valid, add user ID to context
		if tokenString != "" {
			if cl, err := parseToken(tokenString); err == nil {
				c.Set("user_id", cl.UserID)
			}
		}
		// Continue regardless of auth status
		c.Next()
	}
}

// getUserID extracts the authenticated user ID from Gin context.
func getUserID(c *gin.Context) (string, bool) {
	userID, exists := c.Get("user_id")
	if !exists {
		return "", false
	}
	id, ok := userID.(string)
	return id, ok
}

// -------------------------------------------------------------------------
// Error helpers
// -------------------------------------------------------------------------

func isUnauthorized(err error) bool { return errors.Is(err, core.ErrUnauthorized) }
func isInvalidInput(err error) bool { return errors.Is(err, core.ErrInvalidInput) }
func isNotFound(err error) bool     { return errors.Is(err, store.ErrNotFound) }

func errStatus(err error) int {
	switch {
	case isUnauthorized(err):
		return http.StatusForbidden
	case isInvalidInput(err):
		return http.StatusBadRequest
	case isNotFound(err):
		return http.StatusNotFound
	default:
		return http.StatusInternalServerError
	}
}

type clientErrorInfo struct {
	status  int
	key     string
	message string
}

var uniqueConstraintErrors = map[string]clientErrorInfo{
	"workspaces_owner_id_name_key": {
		status:  http.StatusConflict,
		key:     "errors.workspaceNameExists",
		message: "Workspace name already exists.",
	},
	"users_username_key": {
		status:  http.StatusConflict,
		key:     "errors.usernameExists",
		message: "Username already exists.",
	},
	"users_email_key": {
		status:  http.StatusConflict,
		key:     "errors.emailExists",
		message: "Email already exists.",
	},
	"workspace_members_workspace_id_user_id_key": {
		status:  http.StatusConflict,
		key:     "errors.workspaceMemberExists",
		message: "User already exists in this workspace.",
	},
	"document_permissions_document_id_user_id_key": {
		status:  http.StatusConflict,
		key:     "errors.documentPermissionExists",
		message: "Collaborator already exists for this document.",
	},
	"heading_permissions_document_id_user_id_heading_anchor_key": {
		status:  http.StatusConflict,
		key:     "errors.headingPermissionExists",
		message: "Heading permission already exists for this user.",
	},
	"attachments_document_id_file_path_key": {
		status:  http.StatusConflict,
		key:     "errors.attachmentExists",
		message: "Attachment already exists.",
	},
}

func dbErrorInfo(err error) (clientErrorInfo, bool) {
	var pqErr *pq.Error
	if !errors.As(err, &pqErr) {
		return clientErrorInfo{}, false
	}

	switch pqErr.Code {
	case "23505":
		if info, ok := uniqueConstraintErrors[pqErr.Constraint]; ok {
			return info, true
		}
		return clientErrorInfo{
			status:  http.StatusConflict,
			key:     "errors.duplicate",
			message: "Resource already exists.",
		}, true
	case "23503":
		return clientErrorInfo{
			status:  http.StatusBadRequest,
			key:     "errors.invalidReference",
			message: "Referenced resource does not exist.",
		}, true
	case "23502":
		return clientErrorInfo{
			status:  http.StatusBadRequest,
			key:     "errors.missingField",
			message: "Missing required field.",
		}, true
	default:
		return clientErrorInfo{
			status:  http.StatusInternalServerError,
			key:     "errors.database",
			message: "Database error.",
		}, true
	}
}

func errorResponse(err error) (int, gin.H) {
	if info, ok := dbErrorInfo(err); ok {
		return info.status, gin.H{
			"error":     info.message,
			"error_key": info.key,
		}
	}
	return errStatus(err), gin.H{"error": err.Error()}
}

func respondError(c *gin.Context, err error) {
	status, payload := errorResponse(err)
	c.JSON(status, payload)
}

// -------------------------------------------------------------------------
// CSRF Protection
// -------------------------------------------------------------------------

const csrfCookieName = "mh_csrf"
const csrfHeaderName = "X-CSRF-Token"

// csrfMiddleware provides CSRF protection using the Double Submit Cookie pattern.
// It generates a CSRF token, sets it as an HTTP-only cookie, and validates
// the token on state-changing requests (POST, PUT, DELETE, PATCH).
func csrfMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip CSRF check for safe methods
		if c.Request.Method == "GET" || c.Request.Method == "HEAD" || c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}

		// Skip CSRF check for public auth endpoints (login/register before authentication)
		path := c.Request.URL.Path
		if path == "/api/auth/login" || path == "/api/auth/register" {
			c.Next()
			return
		}

		// Get CSRF token from header
		csrfToken := c.GetHeader(csrfHeaderName)
		if csrfToken == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "csrf token missing"})
			c.Abort()
			return
		}

		// Get CSRF token from cookie
		cookieToken, err := c.Cookie(csrfCookieName)
		if err != nil || cookieToken == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "csrf token missing"})
			c.Abort()
			return
		}

		// Compare tokens using constant-time comparison
		if !secureCompare(csrfToken, cookieToken) {
			c.JSON(http.StatusForbidden, gin.H{"error": "csrf token mismatch"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// secureCompare performs constant-time comparison to prevent timing attacks.
func secureCompare(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	result := 0
	for i := 0; i < len(a); i++ {
		result |= int(a[i]) ^ int(b[i])
	}
	return result == 0
}

// generateCSRFToken generates a cryptographically secure random token.
func generateCSRFToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		// Fallback to time-based token if crypto fails
		return hex.EncodeToString([]byte(time.Now().String()))
	}
	return hex.EncodeToString(b)
}
