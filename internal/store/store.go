package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"markdownhub/internal/models"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

// ErrNotFound is returned when a requested record does not exist.
var ErrNotFound = errors.New("not found")

// DB wraps a *sql.DB and provides transaction support.
// All data access operations should use sqlc-generated queries.
type DB struct {
	*Queries
	db *sql.DB
}

// NewDB opens a PostgreSQL connection and initializes the store.
func NewDB(dataSourceName string) (*DB, error) {
	db, err := sql.Open("postgres", dataSourceName)
	if err != nil {
		return nil, fmt.Errorf("failed to open db: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Verify connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping db: %w", err)
	}

	return &DB{
		Queries: New(db),
		db:      db,
	}, nil
}

// Close closes the underlying database connection pool.
func (s *DB) Close() error {
	return s.db.Close()
}

// Ping verifies a connection to the database is still alive.
func (s *DB) Ping(ctx context.Context) error {
	return s.db.PingContext(ctx)
}

// -------------------------------------------------------------------------
// Transaction Support
// -------------------------------------------------------------------------

// BeginTx starts a new database transaction.
func (s *DB) BeginTx(ctx context.Context) (*sql.Tx, error) {
	return s.db.BeginTx(ctx, nil)
}

// WithTransaction executes a function within a database transaction.
// If the function returns an error, the transaction is rolled back.
// Otherwise, the transaction is committed.
func (s *DB) WithTransaction(ctx context.Context, fn func(*Queries) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		}
	}()

	qtx := s.Queries.WithTx(tx)
	if err := fn(qtx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			return fmt.Errorf("tx error: %w, rollback error: %v", err, rbErr)
		}
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}

	return nil
}

// -------------------------------------------------------------------------
// Type Conversion Helpers
// -------------------------------------------------------------------------

// parseUUID converts a string to uuid.UUID
func parseUUID(s string) (uuid.UUID, error) {
	return uuid.Parse(s)
}

// mustParseUUID converts a string to uuid.UUID, panics on error (use only when sure)
func mustParseUUID(s string) uuid.UUID {
	id, err := uuid.Parse(s)
	if err != nil {
		panic(fmt.Sprintf("invalid UUID: %s", s))
	}
	return id
}

// uuidToString converts uuid.UUID to string
func uuidToString(id uuid.UUID) string {
	return id.String()
}

// uuidPtrToString converts uuid.NullUUID to *string
func uuidPtrToString(id uuid.NullUUID) *string {
	if !id.Valid {
		return nil
	}
	s := id.UUID.String()
	return &s
}

// stringPtrToUUID converts *string to uuid.NullUUID
func stringPtrToUUID(s *string) uuid.NullUUID {
	if s == nil {
		return uuid.NullUUID{Valid: false}
	}
	id, err := uuid.Parse(*s)
	if err != nil {
		return uuid.NullUUID{Valid: false}
	}
	return uuid.NullUUID{UUID: id, Valid: true}
}

// stringToNullUUID converts string to uuid.NullUUID
func stringToNullUUID(s string) uuid.NullUUID {
	id, err := uuid.Parse(s)
	if err != nil {
		return uuid.NullUUID{Valid: false}
	}
	return uuid.NullUUID{UUID: id, Valid: true}
}

// nullUUIDToString converts uuid.NullUUID to string
func nullUUIDToString(id uuid.NullUUID) string {
	if !id.Valid {
		return ""
	}
	return id.UUID.String()
}

// convertPermissionLevel converts store.PermissionLevel to models.PermissionLevel
func convertPermissionLevel(level PermissionLevel) models.PermissionLevel {
	return models.PermissionLevel(level)
}

// convertPermissionLevelToStore converts models.PermissionLevel to store.PermissionLevel
func convertPermissionLevelToStore(level models.PermissionLevel) PermissionLevel {
	return PermissionLevel(level)
}
