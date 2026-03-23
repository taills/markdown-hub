package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"markdownhub/internal/core"
)

// AuthHandler handles registration and login.
type AuthHandler struct {
	authService   *core.AuthService
	socialService *core.SocialService
}

// NewAuthHandler constructs an AuthHandler.
func NewAuthHandler(authService *core.AuthService, socialService *core.SocialService) *AuthHandler {
	return &AuthHandler{authService: authService, socialService: socialService}
}

// Register godoc
// POST /api/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var body struct {
		Username string `json:"username"`
		Email    string `json:"email"` // Optional
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	user, err := h.authService.Register(c.Request.Context(), body.Username, body.Email, body.Password)
	if err != nil {
		respondError(c, err)
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
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	user, err := h.authService.Login(c.Request.Context(), body.Username, body.Password)
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
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, user)
}

// GetDingTalkQR godoc
// GET /api/auth/social/dingtalk/qr
func (h *AuthHandler) GetDingTalkQR(c *gin.Context) {
	qrURL, state, err := h.socialService.GetSocialQRURL(core.SocialProviderDingTalk)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"qr_code_url": qrURL,
		"state":       state,
	})
}

// GetWeComQR godoc
// GET /api/auth/social/wecom/qr
func (h *AuthHandler) GetWeComQR(c *gin.Context) {
	qrURL, state, err := h.socialService.GetSocialQRURL(core.SocialProviderWeCom)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"qr_code_url": qrURL,
		"state":       state,
	})
}

// GetFeishuQR godoc
// GET /api/auth/social/feishu/qr
func (h *AuthHandler) GetFeishuQR(c *gin.Context) {
	qrURL, state, err := h.socialService.GetSocialQRURL(core.SocialProviderFeishu)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"qr_code_url": qrURL,
		"state":       state,
	})
}

// SocialCallback godoc
// GET /api/auth/social/callback/:provider
func (h *AuthHandler) SocialCallback(c *gin.Context) {
	provider := c.Param("provider")
	code := c.Query("code")
	state := c.Query("state")

	result, err := h.socialService.HandleSocialCallback(c.Request.Context(), provider, code, state)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if result.NeedBind {
		c.JSON(http.StatusOK, gin.H{
			"need_bind":       true,
			"temporary_token": result.TemporaryToken,
			"provider":        result.Provider,
			"external_id":     result.ExternalID,
			"external_nickname": result.ExternalNick,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user":  result.User,
		"token": result.Token,
	})
}

// BindSocial godoc
// POST /api/auth/social/bind
func (h *AuthHandler) BindSocial(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var body struct {
		Provider string `json:"provider"`
		Code    string `json:"code"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}

	account, err := h.socialService.BindSocialAccount(c.Request.Context(), userID, body.Provider, body.Code)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":        true,
		"provider":       account.Provider,
		"bound_at":       account.BoundAt,
		"external_nickname": account.ExternalNickname,
	})
}

// UnbindSocial godoc
// DELETE /api/auth/social/bind/:provider
func (h *AuthHandler) UnbindSocial(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	provider := c.Param("provider")
	if err := h.socialService.UnbindSocialAccount(c.Request.Context(), userID, provider); err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// ListSocialAccounts godoc
// GET /api/auth/social/accounts
func (h *AuthHandler) ListSocialAccounts(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	accounts, err := h.socialService.ListSocialAccounts(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"accounts": accounts})
}

// GetCompleteStatus godoc
// GET /api/auth/me/complete-status
func (h *AuthHandler) GetCompleteStatus(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	status, err := h.socialService.GetCompleteStatus(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, status)
}

// CompleteProfile godoc
// POST /api/auth/complete-profile
func (h *AuthHandler) CompleteProfile(c *gin.Context) {
	var body struct {
		TemporaryToken string `json:"temporary_token"`
		Username       string `json:"username"`
		Password       string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}

	user, err := h.socialService.CompleteProfile(c.Request.Context(), body.TemporaryToken, body.Username, body.Password)
	if err != nil {
		respondError(c, err)
		return
	}

	token, err := generateToken(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"user":    user,
		"token":   token,
	})
}
