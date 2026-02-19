package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

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
func (h *AuthHandler) Register(c *gin.Context) {
	var body struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	user, err := h.authService.Register(c.Request.Context(), body.Username, body.Email, body.Password)
	if err != nil {
		c.JSON(errStatus(err), gin.H{"error": err.Error()})
		return
	}
	token, err := generateToken(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate token"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"user":  user,
		"token": token,
	})
}

// Login godoc
// POST /api/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	user, err := h.authService.Login(c.Request.Context(), body.Email, body.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	token, err := generateToken(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"user":  user,
		"token": token,
	})
}

// Me godoc
// GET /api/auth/me
func (h *AuthHandler) Me(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	user, err := h.authService.GetUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(errStatus(err), gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, user)
}
