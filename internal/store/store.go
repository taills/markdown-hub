package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	_ "github.com/lib/pq"

	"markdownhub/internal/models"
)

// ErrNotFound is returned when a requested record does not exist.
var ErrNotFound = errors.New("not found")

// DB wraps a *sql.DB and implements all repository operations.
type DB struct {
	db *sql.DB
}

// New opens a PostgreSQL connection and pings it.
func New(dataSourceName string) (*DB, error) {
	db, err := sql.Open("postgres", dataSourceName)
	if err != nil {
		return nil, fmt.Errorf("failed to open db: %w", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping db: %w", err)
	}
	return &DB{db: db}, nil
}

// Close closes the underlying connection pool.
func (s *DB) Close() error { return s.db.Close() }

// -------------------------------------------------------------------------
// Users
// -------------------------------------------------------------------------

func (s *DB) CreateUser(ctx context.Context, username, email, passwordHash string) (*models.User, error) {
	u := &models.User{
		ID:           uuid.New().String(),
		Username:     username,
		Email:        email,
		PasswordHash: passwordHash,
	}
	row := s.db.QueryRowContext(ctx,
		`INSERT INTO users (id, username, email, password_hash)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, username, email, password_hash, created_at, updated_at`,
		u.ID, u.Username, u.Email, u.PasswordHash,
	)
	return scanUser(row)
}

func (s *DB) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, username, email, password_hash, created_at, updated_at FROM users WHERE id = $1`, id)
	return scanUser(row)
}

func (s *DB) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, username, email, password_hash, created_at, updated_at FROM users WHERE email = $1`, email)
	return scanUser(row)
}

func (s *DB) GetUserByUsername(ctx context.Context, username string) (*models.User, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, username, email, password_hash, created_at, updated_at FROM users WHERE username = $1`, username)
	return scanUser(row)
}

func scanUser(row *sql.Row) (*models.User, error) {
	u := &models.User{}
	err := row.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan user: %w", err)
	}
	return u, nil
}

// -------------------------------------------------------------------------
// Documents
// -------------------------------------------------------------------------

func (s *DB) CreateDocument(ctx context.Context, ownerID, title, content string) (*models.Document, error) {
	id := uuid.New().String()
	row := s.db.QueryRowContext(ctx,
		`INSERT INTO documents (id, owner_id, title, content)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, owner_id, title, content, created_at, updated_at`,
		id, ownerID, title, content,
	)
	return scanDocument(row)
}

func (s *DB) GetDocumentByID(ctx context.Context, id string) (*models.Document, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, owner_id, title, content, created_at, updated_at FROM documents WHERE id = $1`, id)
	return scanDocument(row)
}

func (s *DB) ListDocumentsByOwner(ctx context.Context, ownerID string) ([]*models.Document, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, owner_id, title, content, created_at, updated_at
		 FROM documents WHERE owner_id = $1 ORDER BY updated_at DESC`, ownerID)
	if err != nil {
		return nil, fmt.Errorf("list documents: %w", err)
	}
	defer rows.Close()
	return scanDocuments(rows)
}

func (s *DB) UpdateDocumentContent(ctx context.Context, id, content string) (*models.Document, error) {
	row := s.db.QueryRowContext(ctx,
		`UPDATE documents SET content = $2, updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, owner_id, title, content, created_at, updated_at`,
		id, content,
	)
	return scanDocument(row)
}

func (s *DB) UpdateDocumentTitle(ctx context.Context, id, title string) (*models.Document, error) {
	row := s.db.QueryRowContext(ctx,
		`UPDATE documents SET title = $2, updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, owner_id, title, content, created_at, updated_at`,
		id, title,
	)
	return scanDocument(row)
}

func (s *DB) DeleteDocument(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM documents WHERE id = $1`, id)
	return err
}

func scanDocument(row *sql.Row) (*models.Document, error) {
	d := &models.Document{}
	err := row.Scan(&d.ID, &d.OwnerID, &d.Title, &d.Content, &d.CreatedAt, &d.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan document: %w", err)
	}
	return d, nil
}

func scanDocuments(rows *sql.Rows) ([]*models.Document, error) {
	var docs []*models.Document
	for rows.Next() {
		d := &models.Document{}
		if err := rows.Scan(&d.ID, &d.OwnerID, &d.Title, &d.Content, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan document row: %w", err)
		}
		docs = append(docs, d)
	}
	return docs, rows.Err()
}

// -------------------------------------------------------------------------
// Snapshots
// -------------------------------------------------------------------------

func (s *DB) CreateSnapshot(ctx context.Context, documentID, authorID, content, message string) (*models.Snapshot, error) {
	id := uuid.New().String()
	row := s.db.QueryRowContext(ctx,
		`INSERT INTO snapshots (id, document_id, author_id, content, message)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, document_id, author_id, content, message, created_at`,
		id, documentID, authorID, content, message,
	)
	snap := &models.Snapshot{}
	err := row.Scan(&snap.ID, &snap.DocumentID, &snap.AuthorID, &snap.Content, &snap.Message, &snap.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create snapshot: %w", err)
	}
	return snap, nil
}

func (s *DB) GetSnapshotByID(ctx context.Context, id string) (*models.Snapshot, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, document_id, author_id, content, message, created_at FROM snapshots WHERE id = $1`, id)
	snap := &models.Snapshot{}
	err := row.Scan(&snap.ID, &snap.DocumentID, &snap.AuthorID, &snap.Content, &snap.Message, &snap.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get snapshot: %w", err)
	}
	return snap, nil
}

func (s *DB) ListSnapshotsByDocument(ctx context.Context, documentID string, limit, offset int) ([]*models.Snapshot, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, document_id, author_id, content, message, created_at
		 FROM snapshots WHERE document_id = $1
		 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		documentID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("list snapshots: %w", err)
	}
	defer rows.Close()
	var snaps []*models.Snapshot
	for rows.Next() {
		snap := &models.Snapshot{}
		if err := rows.Scan(&snap.ID, &snap.DocumentID, &snap.AuthorID, &snap.Content, &snap.Message, &snap.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan snapshot: %w", err)
		}
		snaps = append(snaps, snap)
	}
	return snaps, rows.Err()
}

func (s *DB) GetLatestSnapshot(ctx context.Context, documentID string) (*models.Snapshot, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, document_id, author_id, content, message, created_at
		 FROM snapshots WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1`, documentID)
	snap := &models.Snapshot{}
	err := row.Scan(&snap.ID, &snap.DocumentID, &snap.AuthorID, &snap.Content, &snap.Message, &snap.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get latest snapshot: %w", err)
	}
	return snap, nil
}

// -------------------------------------------------------------------------
// Permissions
// -------------------------------------------------------------------------

func (s *DB) UpsertDocumentPermission(ctx context.Context, documentID, userID string, level models.PermissionLevel) (*models.DocumentPermission, error) {
	id := uuid.New().String()
	row := s.db.QueryRowContext(ctx,
		`INSERT INTO document_permissions (id, document_id, user_id, level)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (document_id, user_id) DO UPDATE SET level = EXCLUDED.level
		 RETURNING id, document_id, user_id, level, created_at`,
		id, documentID, userID, string(level),
	)
	p := &models.DocumentPermission{}
	var lvl string
	err := row.Scan(&p.ID, &p.DocumentID, &p.UserID, &lvl, &p.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("upsert doc permission: %w", err)
	}
	p.Level = models.PermissionLevel(lvl)
	return p, nil
}

func (s *DB) GetDocumentPermission(ctx context.Context, documentID, userID string) (*models.DocumentPermission, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, document_id, user_id, level, created_at
		 FROM document_permissions WHERE document_id = $1 AND user_id = $2`,
		documentID, userID,
	)
	p := &models.DocumentPermission{}
	var lvl string
	err := row.Scan(&p.ID, &p.DocumentID, &p.UserID, &lvl, &p.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get doc permission: %w", err)
	}
	p.Level = models.PermissionLevel(lvl)
	return p, nil
}

func (s *DB) ListDocumentPermissions(ctx context.Context, documentID string) ([]*models.DocumentPermission, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, document_id, user_id, level, created_at
		 FROM document_permissions WHERE document_id = $1`, documentID)
	if err != nil {
		return nil, fmt.Errorf("list doc permissions: %w", err)
	}
	defer rows.Close()
	var perms []*models.DocumentPermission
	for rows.Next() {
		p := &models.DocumentPermission{}
		var lvl string
		if err := rows.Scan(&p.ID, &p.DocumentID, &p.UserID, &lvl, &p.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan doc permission: %w", err)
		}
		p.Level = models.PermissionLevel(lvl)
		perms = append(perms, p)
	}
	return perms, rows.Err()
}

func (s *DB) DeleteDocumentPermission(ctx context.Context, documentID, userID string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM document_permissions WHERE document_id = $1 AND user_id = $2`,
		documentID, userID)
	return err
}

func (s *DB) UpsertHeadingPermission(ctx context.Context, documentID, userID, headingAnchor string, level models.PermissionLevel) (*models.HeadingPermission, error) {
	id := uuid.New().String()
	row := s.db.QueryRowContext(ctx,
		`INSERT INTO heading_permissions (id, document_id, user_id, heading_anchor, level)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (document_id, user_id, heading_anchor) DO UPDATE SET level = EXCLUDED.level
		 RETURNING id, document_id, user_id, heading_anchor, level, created_at`,
		id, documentID, userID, headingAnchor, string(level),
	)
	p := &models.HeadingPermission{}
	var lvl string
	err := row.Scan(&p.ID, &p.DocumentID, &p.UserID, &p.HeadingAnchor, &lvl, &p.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("upsert heading permission: %w", err)
	}
	p.Level = models.PermissionLevel(lvl)
	return p, nil
}

func (s *DB) GetHeadingPermission(ctx context.Context, documentID, userID, headingAnchor string) (*models.HeadingPermission, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, document_id, user_id, heading_anchor, level, created_at
		 FROM heading_permissions WHERE document_id = $1 AND user_id = $2 AND heading_anchor = $3`,
		documentID, userID, headingAnchor,
	)
	p := &models.HeadingPermission{}
	var lvl string
	err := row.Scan(&p.ID, &p.DocumentID, &p.UserID, &p.HeadingAnchor, &lvl, &p.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get heading permission: %w", err)
	}
	p.Level = models.PermissionLevel(lvl)
	return p, nil
}

func (s *DB) ListHeadingPermissions(ctx context.Context, documentID, userID string) ([]*models.HeadingPermission, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, document_id, user_id, heading_anchor, level, created_at
		 FROM heading_permissions WHERE document_id = $1 AND user_id = $2`,
		documentID, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list heading permissions: %w", err)
	}
	defer rows.Close()
	var perms []*models.HeadingPermission
	for rows.Next() {
		p := &models.HeadingPermission{}
		var lvl string
		if err := rows.Scan(&p.ID, &p.DocumentID, &p.UserID, &p.HeadingAnchor, &lvl, &p.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan heading permission: %w", err)
		}
		p.Level = models.PermissionLevel(lvl)
		perms = append(perms, p)
	}
	return perms, rows.Err()
}

func (s *DB) DeleteHeadingPermission(ctx context.Context, documentID, userID, headingAnchor string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM heading_permissions WHERE document_id = $1 AND user_id = $2 AND heading_anchor = $3`,
		documentID, userID, headingAnchor)
	return err
}

// -------------------------------------------------------------------------
// Permission Enhancements (with username)
// -------------------------------------------------------------------------

func (s *DB) ListDocumentPermissionsWithUsername(ctx context.Context, documentID string) ([]*models.DocumentPermission, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT dp.id, dp.document_id, dp.user_id, dp.level, dp.created_at, u.username
		 FROM document_permissions dp
		 JOIN users u ON dp.user_id = u.id
		 WHERE dp.document_id = $1`, documentID)
	if err != nil {
		return nil, fmt.Errorf("list doc permissions with username: %w", err)
	}
	defer rows.Close()
	var perms []*models.DocumentPermission
	for rows.Next() {
		p := &models.DocumentPermission{}
		var lvl string
		if err := rows.Scan(&p.ID, &p.DocumentID, &p.UserID, &lvl, &p.CreatedAt, &p.Username); err != nil {
			return nil, fmt.Errorf("scan doc permission: %w", err)
		}
		p.Level = models.PermissionLevel(lvl)
		perms = append(perms, p)
	}
	return perms, rows.Err()
}

func (s *DB) ListDocumentsWithPermission(ctx context.Context, userID string) ([]*models.Document, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT DISTINCT d.id, d.owner_id, d.title, d.content, d.created_at, d.updated_at
		 FROM documents d
		 JOIN document_permissions dp ON d.id = dp.document_id
		 WHERE dp.user_id = $1
		 ORDER BY d.updated_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list documents with permission: %w", err)
	}
	defer rows.Close()
	return scanDocuments(rows)
}

func (s *DB) GetDocumentPermissionByUsername(ctx context.Context, documentID, username string) (*models.DocumentPermission, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT dp.id, dp.document_id, dp.user_id, dp.level, dp.created_at
		 FROM document_permissions dp
		 JOIN users u ON dp.user_id = u.id
		 WHERE dp.document_id = $1 AND u.username = $2`,
		documentID, username)
	p := &models.DocumentPermission{}
	var lvl string
	err := row.Scan(&p.ID, &p.DocumentID, &p.UserID, &lvl, &p.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get doc permission by username: %w", err)
	}
	p.Level = models.PermissionLevel(lvl)
	return p, nil
}

// -------------------------------------------------------------------------
// Attachments
// -------------------------------------------------------------------------

func (s *DB) CreateAttachment(ctx context.Context, documentID, uploadBy, filename, fileType string, fileSize int64, filePath string) (*models.Attachment, error) {
	id := uuid.New().String()
	row := s.db.QueryRowContext(ctx,
		`INSERT INTO attachments (id, document_id, upload_by, filename, file_type, file_size, file_path)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, document_id, upload_by, filename, file_type, file_size, file_path, created_at`,
		id, documentID, uploadBy, filename, fileType, fileSize, filePath)
	a := &models.Attachment{}
	err := row.Scan(&a.ID, &a.DocumentID, &a.UploadBy, &a.Filename, &a.FileType, &a.FileSize, &a.FilePath, &a.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create attachment: %w", err)
	}
	return a, nil
}

func (s *DB) GetAttachmentByID(ctx context.Context, id string) (*models.Attachment, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, document_id, upload_by, filename, file_type, file_size, file_path, created_at FROM attachments WHERE id = $1`, id)
	a := &models.Attachment{}
	err := row.Scan(&a.ID, &a.DocumentID, &a.UploadBy, &a.Filename, &a.FileType, &a.FileSize, &a.FilePath, &a.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get attachment: %w", err)
	}
	return a, nil
}

func (s *DB) ListDocumentAttachments(ctx context.Context, documentID string) ([]*models.Attachment, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, document_id, upload_by, filename, file_type, file_size, file_path, created_at
		 FROM attachments WHERE document_id = $1 ORDER BY created_at DESC`, documentID)
	if err != nil {
		return nil, fmt.Errorf("list attachments: %w", err)
	}
	defer rows.Close()
	var attachments []*models.Attachment
	for rows.Next() {
		a := &models.Attachment{}
		if err := rows.Scan(&a.ID, &a.DocumentID, &a.UploadBy, &a.Filename, &a.FileType, &a.FileSize, &a.FilePath, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan attachment: %w", err)
		}
		attachments = append(attachments, a)
	}
	return attachments, rows.Err()
}

func (s *DB) DeleteAttachment(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM attachments WHERE id = $1`, id)
	return err
}

func (s *DB) CreateAttachmentReference(ctx context.Context, attachmentID, documentID string, referencedAt int) (*models.AttachmentReference, error) {
	id := uuid.New().String()
	row := s.db.QueryRowContext(ctx,
		`INSERT INTO attachment_references (id, attachment_id, document_id, referenced_at)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, attachment_id, document_id, referenced_at, created_at`,
		id, attachmentID, documentID, referencedAt)
	ar := &models.AttachmentReference{}
	err := row.Scan(&ar.ID, &ar.AttachmentID, &ar.DocumentID, &ar.ReferencedAt, &ar.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create attachment reference: %w", err)
	}
	return ar, nil
}

func (s *DB) ListAttachmentReferences(ctx context.Context, attachmentID string) ([]*models.AttachmentReference, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, attachment_id, document_id, referenced_at, created_at FROM attachment_references WHERE attachment_id = $1`, attachmentID)
	if err != nil {
		return nil, fmt.Errorf("list attachment references: %w", err)
	}
	defer rows.Close()
	var refs []*models.AttachmentReference
	for rows.Next() {
		ar := &models.AttachmentReference{}
		if err := rows.Scan(&ar.ID, &ar.AttachmentID, &ar.DocumentID, &ar.ReferencedAt, &ar.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan attachment reference: %w", err)
		}
		refs = append(refs, ar)
	}
	return refs, rows.Err()
}

func (s *DB) GetUnreferencedAttachments(ctx context.Context, documentID string) ([]*models.Attachment, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT a.id, a.document_id, a.upload_by, a.filename, a.file_type, a.file_size, a.file_path, a.created_at
		 FROM attachments a
		 LEFT JOIN attachment_references ar ON a.id = ar.attachment_id
		 WHERE a.document_id = $1 AND ar.id IS NULL`, documentID)
	if err != nil {
		return nil, fmt.Errorf("list unreferenced attachments: %w", err)
	}
	defer rows.Close()
	var attachments []*models.Attachment
	for rows.Next() {
		a := &models.Attachment{}
		if err := rows.Scan(&a.ID, &a.DocumentID, &a.UploadBy, &a.Filename, &a.FileType, &a.FileSize, &a.FilePath, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan attachment: %w", err)
		}
		attachments = append(attachments, a)
	}
	return attachments, rows.Err()
}
