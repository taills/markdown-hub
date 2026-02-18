package core

import (
	"context"
	"database/sql"
	"fmt"

	"markdownhub/internal/models"
	"markdownhub/internal/store"
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
	doc, err := s.db.GetDocumentByID(ctx, documentID)
	if err != nil {
		return nil, err
	}
	if err := s.requireWorkspaceOrDocumentPermission(ctx, doc, authorID, models.PermissionEdit); err != nil {
		return nil, err
	}
	snap, err := s.db.CreateSnapshot(ctx, documentID, authorID, doc.Content, message)
	if err != nil {
		return nil, fmt.Errorf("create snapshot: %w", err)
	}
	return snap, nil
}

// ListSnapshots returns paginated snapshots for a document.
func (s *SnapshotService) ListSnapshots(ctx context.Context, documentID, userID string, limit, offset int) ([]*models.Snapshot, error) {
	doc, err := s.db.GetDocumentByID(ctx, documentID)
	if err != nil {
		return nil, err
	}
	if err := s.requireWorkspaceOrDocumentPermission(ctx, doc, userID, models.PermissionRead); err != nil {
		return nil, err
	}
	return s.db.ListSnapshotsByDocument(ctx, documentID, limit, offset)
}

// GetSnapshot retrieves a single snapshot by ID.
func (s *SnapshotService) GetSnapshot(ctx context.Context, snapshotID, userID string) (*models.Snapshot, error) {
	snap, err := s.db.GetSnapshotByID(ctx, snapshotID)
	if err != nil {
		return nil, err
	}
	doc, err := s.db.GetDocumentByID(ctx, snap.DocumentID)
	if err != nil {
		return nil, err
	}
	if err := s.requireWorkspaceOrDocumentPermission(ctx, doc, userID, models.PermissionRead); err != nil {
		return nil, err
	}
	return snap, nil
}

// RestoreSnapshot replaces the document content with a snapshot's content.
func (s *SnapshotService) RestoreSnapshot(ctx context.Context, snapshotID, userID string) (*models.Document, error) {
	snap, err := s.db.GetSnapshotByID(ctx, snapshotID)
	if err != nil {
		return nil, err
	}
	doc, err := s.db.GetDocumentByID(ctx, snap.DocumentID)
	if err != nil {
		return nil, err
	}
	if err := s.requireWorkspaceOrDocumentPermission(ctx, doc, userID, models.PermissionEdit); err != nil {
		return nil, err
	}

	// Save current state and restore in a transaction
	var restoredDoc *models.Document
	err = s.db.WithTransaction(ctx, func(tx *sql.Tx) error {
		// Save current state as a snapshot before restoring
		_, err := s.db.CreateSnapshotTx(ctx, tx, doc.ID, userID, doc.Content, "pre-restore snapshot")
		if err != nil {
			return fmt.Errorf("create pre-restore snapshot: %w", err)
		}

		// Restore the snapshot content
		restoredDoc, err = s.db.UpdateDocumentContentTx(ctx, tx, doc.ID, snap.Content)
		if err != nil {
			return fmt.Errorf("restore document content: %w", err)
		}

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
	if err := s.permService.RequireWorkspacePermission(ctx, doc.WorkspaceID, userID, required); err == nil {
		return nil
	}
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
