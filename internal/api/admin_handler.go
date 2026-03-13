package api

import (
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"markdownhub/internal/core"
	"markdownhub/internal/store"
)

// AdminHandler provides admin-only endpoints for managing users and resources.
type AdminHandler struct {
	adminSvc *core.AdminService
	authSvc  *core.AuthService
}

// NewAdminHandler constructs an AdminHandler.
func NewAdminHandler(adminSvc *core.AdminService, authSvc *core.AuthService) *AdminHandler {
	return &AdminHandler{
		adminSvc: adminSvc,
		authSvc:  authSvc,
	}
}

// getClientIP extracts the client IP address from the request.
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header first (for reverse proxies)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2, ...)
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}

	// Fall back to remote address
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// AdminCheckMiddleware verifies the caller is an admin; returns 403 if not.
// Must be called after the request is authenticated (userID extracted from context).
// Note: This is not used in the current implementation since Gin middleware is preferred.
func (h *AdminHandler) AdminCheckMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := getUserID(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}

		user, err := h.authSvc.GetUser(c.Request.Context(), userID)
		if err != nil {
			respondError(c, err)
			c.Abort()
			return
		}

		if !user.IsAdmin {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: admin required"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// ListUsers returns all active users (admin only).
func (h *AdminHandler) ListUsers(c *gin.Context) {
	// Verify admin status
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	user, err := h.authSvc.GetUser(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}

	if !user.IsAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: admin required"})
		return
	}

	// Fetch all users
	users, err := h.adminSvc.ListUsers(c.Request.Context())
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, users)
}

// SetAdminRequest is the JSON body for setting admin status.
type SetAdminRequest struct {
	IsAdmin bool `json:"is_admin"`
}

// SetAdmin updates a user's admin status (admin only).
func (h *AdminHandler) SetAdmin(c *gin.Context) {
	// Verify admin status
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	user, err := h.authSvc.GetUser(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}

	if !user.IsAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: admin required"})
		return
	}

	// Extract target user ID from path parameter
	targetUserID := c.Param("id")

	var req SetAdminRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// Extract IP address and User-Agent
	ipAddress := getClientIP(c.Request)
	userAgent := c.GetHeader("User-Agent")

	updated, err := h.adminSvc.SetUserAdmin(c.Request.Context(), userID, targetUserID, req.IsAdmin, ipAddress, userAgent)
	if err != nil {
		if err == store.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, updated)
}

// DeleteUser soft-deletes a user (admin only).
func (h *AdminHandler) DeleteUser(c *gin.Context) {
	// Verify admin status
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	user, err := h.authSvc.GetUser(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}

	if !user.IsAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: admin required"})
		return
	}

	// Extract target user ID from path parameter
	targetUserID := c.Param("id")

	// Extract IP address and User-Agent
	ipAddress := getClientIP(c.Request)
	userAgent := c.GetHeader("User-Agent")

	if err := h.adminSvc.DeleteUser(c.Request.Context(), userID, targetUserID, ipAddress, userAgent); err != nil {
		if err == store.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		respondError(c, err)
		return
	}

	c.Status(http.StatusNoContent)
}

// ResetPasswordRequest is the JSON body for resetting a user's password.
type ResetPasswordRequest struct {
	UserID string `json:"user_id"`
}

// ResetPasswordResponse is the JSON response for password reset.
type ResetPasswordResponse struct {
	UserID      string `json:"user_id"`
	NewPassword string `json:"new_password"`
}

// ResetPassword generates a new random password for a user (admin only).
func (h *AdminHandler) ResetPassword(c *gin.Context) {
	// Verify admin status
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	user, err := h.authSvc.GetUser(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}

	if !user.IsAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: admin required"})
		return
	}

	// Extract target user ID from path parameter
	targetUserID := c.Param("id")

	// Extract IP address and User-Agent
	ipAddress := getClientIP(c.Request)
	userAgent := c.GetHeader("User-Agent")

	newPassword, err := h.adminSvc.ResetPassword(c.Request.Context(), userID, targetUserID, ipAddress, userAgent)
	if err != nil {
		if err == store.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, ResetPasswordResponse{
		UserID:      targetUserID,
		NewPassword: newPassword,
	})
}

// UpdateEmailRequest is the JSON body for updating a user's email.
type UpdateEmailRequest struct {
	Email string `json:"email" binding:"omitempty,email"`
}

// UpdateEmail updates a user's email address (admin only).
func (h *AdminHandler) UpdateEmail(c *gin.Context) {
	// Verify admin status
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	user, err := h.authSvc.GetUser(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}

	if !user.IsAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: admin required"})
		return
	}

	// Extract target user ID from path parameter
	targetUserID := c.Param("id")

	var req UpdateEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid email format"})
		return
	}

	// Extract IP address and User-Agent
	ipAddress := getClientIP(c.Request)
	userAgent := c.GetHeader("User-Agent")

	updatedUser, err := h.adminSvc.UpdateUserEmail(c.Request.Context(), userID, targetUserID, req.Email, ipAddress, userAgent)
	if err != nil {
		if err == store.ErrNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, updatedUser)
}

// SettingResponse represents a setting for API responses.
type SettingResponse struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Description string `json:"description"`
}

// GetSiteTitle returns the current site title (admin only).
func (h *AdminHandler) GetSiteTitle(c *gin.Context) {
	setting, err := h.adminSvc.GetSetting(c.Request.Context(), "SITE_TITLE")
	if err != nil {
		if err == store.ErrNotFound {
			// Return default if not found
			c.JSON(http.StatusOK, SettingResponse{
				Key:         "SITE_TITLE",
				Value:       "MarkdownHub",
				Description: "Site title displayed on the homepage",
			})
			return
		}
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, SettingResponse{
		Key:         setting.Key,
		Value:       setting.Value,
		Description: setting.Description.String,
	})
}

// GetSiteTitlePublic returns the current site title (public, no auth required).
func (h *AdminHandler) GetSiteTitlePublic(c *gin.Context) {
	setting, err := h.adminSvc.GetSetting(c.Request.Context(), "SITE_TITLE")
	if err != nil {
		if err == store.ErrNotFound {
			// Return default if not found
			c.JSON(http.StatusOK, gin.H{
				"site_title": "MarkdownHub",
			})
			return
		}
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"site_title": setting.Value,
	})
}

// GetPluginConfig returns the plugin configuration.
func (h *AdminHandler) GetPluginConfig(c *gin.Context) {
	siteTitle := "MarkdownHub"
	setting, err := h.adminSvc.GetSetting(c.Request.Context(), "SITE_TITLE")
	if err == nil && setting != nil {
		siteTitle = setting.Value
	}

	c.JSON(http.StatusOK, gin.H{
		"site_name": siteTitle,
		"site_url":  "https://markdownhub.example.com",
	})
}

// UpdateSiteTitleRequest is the JSON body for updating site title.
type UpdateSiteTitleRequest struct {
	Value string `json:"value" binding:"required,min=1,max=255"`
}

// UpdateSiteTitle updates the site title (admin only).
func (h *AdminHandler) UpdateSiteTitle(c *gin.Context) {
	// Verify admin status
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	user, err := h.authSvc.GetUser(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}

	if !user.IsAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: admin required"})
		return
	}

	var req UpdateSiteTitleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	err = h.adminSvc.UpdateSetting(c.Request.Context(), "SITE_TITLE", req.Value, "Site title displayed on the homepage")
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, SettingResponse{
		Key:         "SITE_TITLE",
		Value:       req.Value,
		Description: "Site title displayed on the homepage",
	})
}

// ListLogs returns admin audit logs (admin only).
func (h *AdminHandler) ListLogs(c *gin.Context) {
	// Verify admin status
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	user, err := h.authSvc.GetUser(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}

	if !user.IsAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: admin required"})
		return
	}

	// Parse query parameters for pagination
	const maxLimit = 1000
	limit := 100
	offset := 0
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= maxLimit {
			limit = l
		}
	}
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	logs, err := h.adminSvc.ListLogs(c.Request.Context(), limit, offset)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, logs)
}
