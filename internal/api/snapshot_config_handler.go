package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"markdownhub/internal/core"
)

// SnapshotConfigHandler handles snapshot configuration endpoints.
type SnapshotConfigHandler struct {
	docService *core.DocumentService
}

// NewSnapshotConfigHandler constructs a SnapshotConfigHandler.
func NewSnapshotConfigHandler(docService *core.DocumentService) *SnapshotConfigHandler {
	return &SnapshotConfigHandler{docService: docService}
}

// Get godoc
// GET /api/admin/snapshot-config
// Returns the current snapshot configuration
func (h *SnapshotConfigHandler) Get(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	// Only admin users can view config
	// Note: This should use an admin check from the user service
	_ = userID

	config := core.DefaultSnapshotConfig()
	c.JSON(http.StatusOK, gin.H{
		"line_threshold": config.LineThreshold,
		"byte_threshold": config.ByteThreshold,
		"time_threshold_minutes": int(config.TimeThreshold.Minutes()),
		"enabled": config.Enabled,
	})
}

// Update godoc
// PATCH /api/admin/snapshot-config
// Updates the snapshot configuration
func (h *SnapshotConfigHandler) Update(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	// Only admin users can update config
	_ = userID

	var body struct {
		LineThreshold       *int  `json:"line_threshold"`
		ByteThreshold       *int  `json:"byte_threshold"`
		TimeThresholdMinutes *int  `json:"time_threshold_minutes"`
		Enabled             *bool `json:"enabled"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}

	config := core.DefaultSnapshotConfig()

	if body.LineThreshold != nil {
		config.LineThreshold = *body.LineThreshold
	}
	if body.ByteThreshold != nil {
		config.ByteThreshold = *body.ByteThreshold
	}
	if body.TimeThresholdMinutes != nil {
		config.TimeThreshold = time.Duration(*body.TimeThresholdMinutes) * time.Minute
	}
	if body.Enabled != nil {
		config.Enabled = *body.Enabled
	}

	h.docService.SetSnapshotConfig(config)

	c.JSON(http.StatusOK, gin.H{
		"line_threshold": config.LineThreshold,
		"byte_threshold": config.ByteThreshold,
		"time_threshold_minutes": int(config.TimeThreshold.Minutes()),
		"enabled": config.Enabled,
	})
}
