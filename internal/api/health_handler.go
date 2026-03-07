package api

import (
	"net/http"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"
	"markdownhub/internal/store"
)

var startTime = time.Now()

// HealthHandler handles health check and metrics endpoints
type HealthHandler struct {
	db *store.DB
}

// NewHealthHandler constructs a HealthHandler
func NewHealthHandler(db *store.DB) *HealthHandler {
	return &HealthHandler{db: db}
}

// Health godoc
// GET /health
// Returns the health status of the application
func (h *HealthHandler) Health(c *gin.Context) {
	// Check database connection
	ctx := c.Request.Context()
	if err := h.db.Ping(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": "unhealthy",
			"error":  "database connection failed",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "healthy",
		"uptime": time.Since(startTime).String(),
	})
}

// Metrics godoc
// GET /metrics
// Returns application metrics
func (h *HealthHandler) Metrics(c *gin.Context) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	c.JSON(http.StatusOK, gin.H{
		"uptime_seconds": time.Since(startTime).Seconds(),
		"goroutines":     runtime.NumGoroutine(),
		"memory": gin.H{
			"alloc_mb":       m.Alloc / 1024 / 1024,
			"total_alloc_mb": m.TotalAlloc / 1024 / 1024,
			"sys_mb":         m.Sys / 1024 / 1024,
			"num_gc":         m.NumGC,
		},
		"go_version": runtime.Version(),
	})
}

// Ready godoc
// GET /ready
// Returns readiness status (for Kubernetes probes)
func (h *HealthHandler) Ready(c *gin.Context) {
	// Check if the service is ready to accept traffic
	ctx := c.Request.Context()
	if err := h.db.Ping(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": "not ready",
			"error":  "database not ready",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "ready",
	})
}
