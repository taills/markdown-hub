// Package api implements HTTP and WebSocket handlers for MarkdownHub.
package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

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
