package api

import (
	"net/http"

	"markdownhub/internal/core"
)

// AuthHandler handles registration and login.
type AuthHandler struct {
	authService *core.AuthService
}

// NewAuthHandler constructs an AuthHandler.
func NewAuthHandler(authService *core.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

// Register godoc
// POST /api/auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	user, err := h.authService.Register(r.Context(), body.Username, body.Email, body.Password)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	token, err := generateToken(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not generate token")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"user":  user,
		"token": token,
	})
}

// Login godoc
// POST /api/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	user, err := h.authService.Login(r.Context(), body.Email, body.Password)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	token, err := generateToken(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not generate token")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"user":  user,
		"token": token,
	})
}

// Me godoc
// GET /api/auth/me
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	user, err := h.authService.GetUser(r.Context(), userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, user)
}
