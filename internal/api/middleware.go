// Package api implements HTTP and WebSocket handlers for MarkdownHub.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

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
// and stores the user ID in the request context.
func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenString := ""
		// Try Authorization: Bearer <token>
		if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			tokenString = strings.TrimPrefix(auth, "Bearer ")
		}
		// Fall back to cookie.
		if tokenString == "" {
			if c, err := r.Cookie(jwtCookieName); err == nil {
				tokenString = c.Value
			}
		}
		if tokenString == "" {
			writeError(w, http.StatusUnauthorized, "missing token")
			return
		}
		c, err := parseToken(tokenString)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid token")
			return
		}
		ctx := context.WithValue(r.Context(), ctxKeyUserID, c.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

type contextKey string

const ctxKeyUserID contextKey = "user_id"

// userIDFromContext extracts the authenticated user ID.
func userIDFromContext(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(ctxKeyUserID).(string)
	return id, ok
}

// -------------------------------------------------------------------------
// JSON helpers
// -------------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeJSON(r *http.Request, v interface{}) error {
	return json.NewDecoder(r.Body).Decode(v)
}

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
