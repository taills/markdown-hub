package api

import (
	"net/http"

	"markdownhub/internal/core"
)

// UserHandler manages user preferences and stats.
type UserHandler struct {
	userService *core.UserService
}

// NewUserHandler constructs a UserHandler.
func NewUserHandler(userService *core.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

// Stats godoc
// GET /api/users/me/stats
func (h *UserHandler) Stats(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	stats, err := h.userService.GetStats(r.Context(), userID)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

// UpdatePassword godoc
// PATCH /api/users/me/password
func (h *UserHandler) UpdatePassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := h.userService.UpdatePassword(r.Context(), userID, body.CurrentPassword, body.NewPassword); err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UpdatePreferences godoc
// PATCH /api/users/me/preferences
func (h *UserHandler) UpdatePreferences(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	var body struct {
		PreferredLanguage string `json:"preferred_language"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	user, err := h.userService.UpdatePreferredLanguage(r.Context(), userID, body.PreferredLanguage)
	if err != nil {
		writeError(w, errStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, user)
}
