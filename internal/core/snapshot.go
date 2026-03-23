package core

import (
	"context"
	"database/sql"
	"fmt"

	"markdownhub/internal/models"
	"markdownhub/internal/store"

	"github.com/google/uuid"
)

// SnapshotService handles version-history operations.
type SnapshotService struct {
	db          *store.DB
	permService *PermissionService
}

// NewSnapshotService constructs a SnapshotService.
func NewSnapshotService(db *store.DB, permService *PermissionService) *SnapshotService {
	return &SnapshotService{db: db, permService: permService}
}

// CreateSnapshot explicitly saves a snapshot (e.g. on user request).
func (s *SnapshotService) CreateSnapshot(ctx context.Context, documentID, authorID, message string) (*models.Snapshot, error) {
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, store.ErrNotFound
		}
		return nil, err
	}

	modelDoc := storeDocToModel(&doc)
	if err := s.requireWorkspaceOrDocumentPermission(ctx, modelDoc, authorID, models.PermissionEdit); err != nil {
		return nil, err
	}

	authorUUID, err := uuid.Parse(authorID)
	if err != nil {
		return nil, fmt.Errorf("invalid author ID: %w", err)
	}

	snap, err := s.db.CreateSnapshot(ctx, store.CreateSnapshotParams{
		DocumentID: docUUID,
		AuthorID:   uuid.NullUUID{UUID: authorUUID, Valid: true},
		Content:    doc.Content,
		Message:    message,
	})
	if err != nil {
		return nil, fmt.Errorf("create snapshot: %w", err)
	}

	return storeSnapshotToModel(&snap), nil
}

// ListSnapshots returns paginated snapshots for a document.
func (s *SnapshotService) ListSnapshots(ctx context.Context, documentID, userID string, limit, offset int) ([]*models.Snapshot, error) {
	docUUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := s.db.GetDocumentByID(ctx, docUUID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, store.ErrNotFound
		}
		return nil, err
	}

	modelDoc := storeDocToModel(&doc)
	if err := s.requireWorkspaceOrDocumentPermission(ctx, modelDoc, userID, models.PermissionRead); err != nil {
		return nil, err
	}

	snaps, err := s.db.ListSnapshotsByDocument(ctx, store.ListSnapshotsByDocumentParams{
		DocumentID: docUUID,
		Limit:      int32(limit),
		Offset:     int32(offset),
	})
	if err != nil {
		return nil, err
	}

	return storeSnapshotsToModels(snaps), nil
}

// GetSnapshot retrieves a single snapshot by ID.
func (s *SnapshotService) GetSnapshot(ctx context.Context, snapshotID, userID string) (*models.Snapshot, error) {
	snapUUID, err := uuid.Parse(snapshotID)
	if err != nil {
		return nil, fmt.Errorf("invalid snapshot ID: %w", err)
	}

	snap, err := s.db.GetSnapshotByID(ctx, snapUUID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, store.ErrNotFound
		}
		return nil, err
	}

	doc, err := s.db.GetDocumentByID(ctx, snap.DocumentID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, store.ErrNotFound
		}
		return nil, err
	}

	modelDoc := storeDocToModel(&doc)
	if err := s.requireWorkspaceOrDocumentPermission(ctx, modelDoc, userID, models.PermissionRead); err != nil {
		return nil, err
	}

	return storeSnapshotToModel(&snap), nil
}

// RestoreSnapshot replaces the document content with a snapshot's content.
func (s *SnapshotService) RestoreSnapshot(ctx context.Context, snapshotID, userID string) (*models.Document, error) {
	snapUUID, err := uuid.Parse(snapshotID)
	if err != nil {
		return nil, fmt.Errorf("invalid snapshot ID: %w", err)
	}

	snap, err := s.db.GetSnapshotByID(ctx, snapUUID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, store.ErrNotFound
		}
		return nil, err
	}

	doc, err := s.db.GetDocumentByID(ctx, snap.DocumentID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, store.ErrNotFound
		}
		return nil, err
	}

	modelDoc := storeDocToModel(&doc)
	if err := s.requireWorkspaceOrDocumentPermission(ctx, modelDoc, userID, models.PermissionEdit); err != nil {
		return nil, err
	}

	// Save current state and restore in a transaction
	var restoredDoc *models.Document
	err = s.db.WithTransaction(ctx, func(qtx *store.Queries) error {
		// Parse user ID
		userUUID, err := uuid.Parse(userID)
		if err != nil {
			return fmt.Errorf("invalid user ID: %w", err)
		}

		// Save current state as a snapshot before restoring
		_, err = qtx.CreateSnapshot(ctx, store.CreateSnapshotParams{
			DocumentID: snap.DocumentID,
			AuthorID:   uuid.NullUUID{UUID: userUUID, Valid: true},
			Content:    doc.Content,
			Message:    "pre-restore snapshot",
		})
		if err != nil {
			return fmt.Errorf("create pre-restore snapshot: %w", err)
		}

		// Restore the snapshot content
		restoredDocSQL, err := qtx.UpdateDocumentContent(ctx, store.UpdateDocumentContentParams{
			ID:      snap.DocumentID,
			Content: snap.Content,
		})
		if err != nil {
			return fmt.Errorf("restore document content: %w", err)
		}

		// Convert sqlc Document to models.Document
		restoredDoc = storeDocToModel(&restoredDocSQL)

		return nil
	})
	if err != nil {
		return nil, err
	}

	return restoredDoc, nil
}

func (s *SnapshotService) requireWorkspaceOrDocumentPermission(
	ctx context.Context,
	doc *models.Document,
	userID string,
	required models.PermissionLevel,
) error {
	return s.permService.RequireDocumentPermission(ctx, doc.ID, userID, doc.OwnerID, required)
}

// DiffSnapshots computes a line-level diff between two snapshot contents.
func DiffSnapshots(oldContent, newContent string) []DiffLine {
	return computeDiff(oldContent, newContent)
}

// DiffLine represents a single line in a unified diff output.
type DiffLine struct {
	Type    string `json:"type"` // "equal", "insert", "delete"
	Content string `json:"content"`
}

// computeDiff performs a simple Myers-inspired line diff.
func computeDiff(a, b string) []DiffLine {
	aLines := splitLines(a)
	bLines := splitLines(b)

	// LCS-based diff using dynamic programming.
	m, n := len(aLines), len(bLines)
	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}
	for i := m - 1; i >= 0; i-- {
		for j := n - 1; j >= 0; j-- {
			if aLines[i] == bLines[j] {
				dp[i][j] = dp[i+1][j+1] + 1
			} else if dp[i+1][j] >= dp[i][j+1] {
				dp[i][j] = dp[i+1][j]
			} else {
				dp[i][j] = dp[i][j+1]
			}
		}
	}

	var result []DiffLine
	i, j := 0, 0
	for i < m || j < n {
		switch {
		case i < m && j < n && aLines[i] == bLines[j]:
			result = append(result, DiffLine{Type: "equal", Content: aLines[i]})
			i++
			j++
		case j < n && (i >= m || dp[i][j+1] >= dp[i+1][j]):
			result = append(result, DiffLine{Type: "insert", Content: bLines[j]})
			j++
		default:
			result = append(result, DiffLine{Type: "delete", Content: aLines[i]})
			i++
		}
	}
	return result
}

func splitLines(s string) []string {
	if s == "" {
		return nil
	}
	return splitByNewline(s)
}

func splitByNewline(s string) []string {
	var lines []string
	start := 0
	for i, c := range s {
		if c == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start <= len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

// -------------------------------------------------------------------------
// Type Conversion Helpers
// -------------------------------------------------------------------------

// storeSnapshotToModel converts a store.Snapshot to *models.Snapshot
func storeSnapshotToModel(s *store.Snapshot) *models.Snapshot {
	authorID := ""
	if s.AuthorID.Valid {
		authorID = s.AuthorID.UUID.String()
	}

	return &models.Snapshot{
		ID:         s.ID.String(),
		DocumentID: s.DocumentID.String(),
		AuthorID:   authorID,
		Content:    s.Content,
		Message:    s.Message,
		CreatedAt:  s.CreatedAt,
	}
}

// storeSnapshotsToModels converts []store.Snapshot to []*models.Snapshot
func storeSnapshotsToModels(snaps []store.Snapshot) []*models.Snapshot {
	result := make([]*models.Snapshot, len(snaps))
	for i := range snaps {
		result[i] = storeSnapshotToModel(&snaps[i])
	}
	return result
}
