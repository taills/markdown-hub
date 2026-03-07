package config

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"sync"

	"markdownhub/internal/store"
)

// Config holds application configuration loaded from database and environment
type Config struct {
	mu         sync.RWMutex
	JWTSecret  string
	LogLevel   string
	LogPretty  bool
	db         *store.DB
}

// Default config values
const (
	DefaultLogLevel  = "info"
	DefaultLogPretty = true
	JWTSecretLen     = 32
)

// Singleton instance
var cfg *Config

// Init initializes the configuration system
func Init(db *store.DB, envJWTSecret string) error {
	cfg = &Config{
		db:        db,
		LogLevel:  DefaultLogLevel,
		LogPretty: DefaultLogPretty,
	}

	// Load settings from database
	if err := cfg.loadFromDB(context.Background()); err != nil {
		return fmt.Errorf("failed to load config from database: %w", err)
	}

	// Override with environment variables if provided
	if envJWTSecret != "" {
		cfg.JWTSecret = envJWTSecret
	}
	if envLogLevel := os.Getenv("LOG_LEVEL"); envLogLevel != "" {
		cfg.LogLevel = envLogLevel
	}
	if envLogPretty := os.Getenv("LOG_PRETTY"); envLogPretty != "" {
		cfg.LogPretty = envLogPretty == "true"
	}

	// Generate JWT secret if not set
	if cfg.JWTSecret == "" {
		if err := cfg.generateJWTSecret(context.Background()); err != nil {
			return fmt.Errorf("failed to generate JWT secret: %w", err)
		}
	}

	return nil
}

// Get returns the global config instance
func Get() *Config {
	return cfg
}

// GetJWTSecret returns the JWT secret
func (c *Config) GetJWTSecret() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.JWTSecret
}

// GetLogLevel returns the log level
func (c *Config) GetLogLevel() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.LogLevel
}

// GetLogPretty returns whether to use pretty logging
func (c *Config) GetLogPretty() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.LogPretty
}

// SetJWTSecret updates the JWT secret in config and database
func (c *Config) SetJWTSecret(ctx context.Context, secret string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if len(secret) < 32 {
		return fmt.Errorf("JWT secret must be at least 32 characters")
	}

	c.JWTSecret = secret
	return c.db.UpsertSetting(ctx, store.UpsertSettingParams{
		Key:         "JWT_SECRET",
		Value:       secret,
		Description: sql.NullString{String: "JWT signing key (auto-generated if not set)", Valid: true},
	})
}

// SetLogLevel updates the log level in config and database
func (c *Config) SetLogLevel(ctx context.Context, level string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Validate log level
	validLevels := map[string]bool{"debug": true, "info": true, "warn": true, "error": true}
	if !validLevels[level] {
		return fmt.Errorf("invalid log level: %s", level)
	}

	c.LogLevel = level
	return c.db.UpsertSetting(ctx, store.UpsertSettingParams{
		Key:         "LOG_LEVEL",
		Value:       level,
		Description: sql.NullString{String: "Logging level: debug, info, warn, error", Valid: true},
	})
}

// SetLogPretty updates the log pretty setting in config and database
func (c *Config) SetLogPretty(ctx context.Context, pretty bool) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.LogPretty = pretty
	return c.db.UpsertSetting(ctx, store.UpsertSettingParams{
		Key:         "LOG_PRETTY",
		Value:       fmt.Sprintf("%t", pretty),
		Description: sql.NullString{String: "Pretty print logs: true, false", Valid: true},
	})
}

// loadFromDB loads configuration from the database
func (c *Config) loadFromDB(ctx context.Context) error {
	settings, err := c.db.GetAllSettings(ctx)
	if err != nil {
		return err
	}

	for _, s := range settings {
		switch s.Key {
		case "JWT_SECRET":
			c.JWTSecret = s.Value
		case "LOG_LEVEL":
			c.LogLevel = s.Value
		case "LOG_PRETTY":
			c.LogPretty = s.Value == "true"
		}
	}

	return nil
}

// generateJWTSecret generates a random JWT secret and saves it to the database
func (c *Config) generateJWTSecret(ctx context.Context) error {
	secret := generateRandomString(JWTSecretLen)
	c.JWTSecret = secret

	// Save to database
	err := c.db.UpsertSetting(ctx, store.UpsertSettingParams{
		Key:         "JWT_SECRET",
		Value:       secret,
		Description: sql.NullString{String: "JWT signing key (auto-generated)", Valid: true},
	})
	if err != nil {
		return err
	}

	return nil
}

// generateRandomString generates a cryptographically secure random string
func generateRandomString(length int) string {
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		// Fallback to less secure random
		for i := range b {
			b[i] = byte(i % 256)
		}
	}
	return hex.EncodeToString(b)[:length]
}
