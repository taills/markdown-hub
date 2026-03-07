package api

import (
	"time"

	"github.com/gin-gonic/gin"
	"markdownhub/internal/logger"
)

// LoggerMiddleware logs HTTP requests with structured logging
func LoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery

		// Process request
		c.Next()

		// Calculate latency
		latency := time.Since(start)

		// Get status code and size
		statusCode := c.Writer.Status()
		bodySize := c.Writer.Size()

		// Build log event
		event := logger.Logger.Info().
			Str("method", c.Request.Method).
			Str("path", path).
			Int("status", statusCode).
			Dur("latency", latency).
			Int("size", bodySize).
			Str("ip", c.ClientIP()).
			Str("user_agent", c.Request.UserAgent())

		if raw != "" {
			event.Str("query", raw)
		}

		// Add user ID if available
		if userID, exists := c.Get("user_id"); exists {
			if id, ok := userID.(string); ok {
				event.Str("user_id", id)
			}
		}

		// Log errors
		if len(c.Errors) > 0 {
			event.Str("errors", c.Errors.String())
		}

		// Set level based on status code
		if statusCode >= 500 {
			event = logger.Logger.Error().
				Str("method", c.Request.Method).
				Str("path", path).
				Int("status", statusCode).
				Dur("latency", latency)
		} else if statusCode >= 400 {
			event = logger.Logger.Warn().
				Str("method", c.Request.Method).
				Str("path", path).
				Int("status", statusCode).
				Dur("latency", latency)
		}

		event.Msg("HTTP request")
	}
}
