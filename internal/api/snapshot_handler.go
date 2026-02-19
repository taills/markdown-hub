package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"markdownhub/internal/core"
)

// SnapshotHandler handles version history operations.
type SnapshotHandler struct {
	snapshotService *core.SnapshotService
}

// NewSnapshotHandler constructs a SnapshotHandler.
func NewSnapshotHandler(snapshotService *core.SnapshotService) *SnapshotHandler {
	return &SnapshotHandler{snapshotService: snapshotService}
}

// Create godoc
// POST /api/documents/{id}/snapshots
func (h *SnapshotHandler) Create(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	docID := c.Param("id")
	var body struct {
		Message string `json:"message"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON"})
		return
	}
	snap, err := h.snapshotService.CreateSnapshot(c.Request.Context(), docID, userID, body.Message)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, snap)
}

// List godoc
// GET /api/documents/{id}/snapshots?limit=20&offset=0
func (h *SnapshotHandler) List(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	docID := c.Param("id")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	snaps, err := h.snapshotService.ListSnapshots(c.Request.Context(), docID, userID, limit, offset)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, snaps)
}

// Restore godoc
// POST /api/snapshots/{id}/restore
func (h *SnapshotHandler) Restore(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	snapID := c.Param("id")
	doc, err := h.snapshotService.RestoreSnapshot(c.Request.Context(), snapID, userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, doc)
}

// Diff godoc
// GET /api/snapshots/{id}/diff?compare={otherId}
func (h *SnapshotHandler) Diff(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	snapID := c.Param("id")
	compareID := c.Query("compare")

	snap, err := h.snapshotService.GetSnapshot(c.Request.Context(), snapID, userID)
	if err != nil {
		respondError(c, err)
		return
	}

	var compareContent string
	if compareID != "" {
		other, err := h.snapshotService.GetSnapshot(c.Request.Context(), compareID, userID)
		if err != nil {
			respondError(c, err)
			return
		}
		compareContent = other.Content
	}

	diff := core.DiffSnapshots(compareContent, snap.Content)
	c.JSON(http.StatusOK, diff)
}
