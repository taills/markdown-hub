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
	limit := 100
	offset := 0
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
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
