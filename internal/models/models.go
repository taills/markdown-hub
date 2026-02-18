package models

import (
	"time"
)

// PermissionLevel defines access rights.
type PermissionLevel string

const (
	PermissionRead   PermissionLevel = "read"
	PermissionEdit   PermissionLevel = "edit"
	PermissionManage PermissionLevel = "manage"
)

// User represents a registered account.
type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Document is the top-level writable unit.
type Document struct {
	ID        string    `json:"id"`
	OwnerID   string    `json:"owner_id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Snapshot is an immutable point-in-time copy of a Document.
type Snapshot struct {
	ID         string    `json:"id"`
	DocumentID string    `json:"document_id"`
	AuthorID   string    `json:"author_id"`
	Content    string    `json:"content"`
	Message    string    `json:"message"`
	CreatedAt  time.Time `json:"created_at"`
}

// DocumentPermission grants a user access to a whole document.
type DocumentPermission struct {
	ID         string          `json:"id"`
	DocumentID string          `json:"document_id"`
	UserID     string          `json:"user_id"`
	Level      PermissionLevel `json:"level"`
	CreatedAt  time.Time       `json:"created_at"`
	Username   string          `json:"username,omitempty"` // optional, populated when needed
}

// HeadingPermission grants a user fine-grained access to a specific heading
// section within a document.
type HeadingPermission struct {
	ID            string          `json:"id"`
	DocumentID    string          `json:"document_id"`
	UserID        string          `json:"user_id"`
	HeadingAnchor string          `json:"heading_anchor"`
	Level         PermissionLevel `json:"level"`
	CreatedAt     time.Time       `json:"created_at"`
}

// HeadingSection maps a heading anchor to its byte range in the document.
type HeadingSection struct {
	Anchor    string `json:"anchor"`
	Title     string `json:"title"`
	Level     int    `json:"level"` // heading depth (1-6)
	StartByte int    `json:"start_byte"`
	EndByte   int    `json:"end_byte"`
}

// Attachment represents a file upload associated with a document.
type Attachment struct {
	ID         string    `json:"id"`
	DocumentID string    `json:"document_id"`
	UploadBy   string    `json:"upload_by"`
	Filename   string    `json:"filename"`
	FileType   string    `json:"file_type"` // e.g. 'image/png'
	FileSize   int64     `json:"file_size"` // bytes
	FilePath   string    `json:"file_path"` // storage path
	CreatedAt  time.Time `json:"created_at"`
}

// AttachmentReference tracks where an attachment is used in a document.
type AttachmentReference struct {
	ID           string    `json:"id"`
	AttachmentID string    `json:"attachment_id"`
	DocumentID   string    `json:"document_id"`
	ReferencedAt int       `json:"referenced_at"` // byte offset
	CreatedAt    time.Time `json:"created_at"`
}

// DocumentListItem extends Document with permission information for list views.
type DocumentListItem struct {
	*Document
	Permission *PermissionLevel `json:"permission,omitempty"` // nil = owner, otherwise the permission level
}
