package api

import (
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"markdownhub/internal/logger"
)

// MaxUserAgentLength limits the User-Agent length to prevent log injection
const MaxUserAgentLength = 500

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

		// Sanitize User-Agent to prevent log injection
		userAgent := c.Request.UserAgent()
		if len(userAgent) > MaxUserAgentLength {
			userAgent = userAgent[:MaxUserAgentLength] + " [truncated]"
		}
		// Remove newlines and carriage returns from User-Agent
		userAgent = strings.ReplaceAll(userAgent, "\n", " ")
		userAgent = strings.ReplaceAll(userAgent, "\r", "")

		// Build log event
		event := logger.Logger.Info().
			Str("method", c.Request.Method).
			Str("path", path).
			Int("status", statusCode).
			Dur("latency", latency).
			Int("size", bodySize).
			Str("ip", c.ClientIP()).
			Str("user_agent", userAgent)

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
