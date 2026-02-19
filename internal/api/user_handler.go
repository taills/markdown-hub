package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

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
func (h *UserHandler) Stats(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	stats, err := h.userService.GetStats(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, stats)
}

// UpdatePassword godoc
// PATCH /api/users/me/password
func (h *UserHandler) UpdatePassword(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	if err := h.userService.UpdatePassword(c.Request.Context(), userID, body.CurrentPassword, body.NewPassword); err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// UpdatePreferences godoc
// PATCH /api/users/me/preferences
func (h *UserHandler) UpdatePreferences(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var body struct {
		PreferredLanguage string `json:"preferred_language"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	user, err := h.userService.UpdatePreferredLanguage(c.Request.Context(), userID, body.PreferredLanguage)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, user)
}
