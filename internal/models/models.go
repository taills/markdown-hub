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
	ID                string    `json:"id"`
	Username          string    `json:"username"`
	Email             string    `json:"email"`
	PasswordHash      string    `json:"-"`
	PreferredLanguage string    `json:"preferred_language"`
	IsAdmin           bool      `json:"is_admin"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// UserStats aggregates account-level metrics.
type UserStats struct {
	AccessibleDocuments int `json:"accessible_documents"`
	OwnedDocuments      int `json:"owned_documents"`
	Workspaces          int `json:"workspaces"`
	AttachmentsUploaded int `json:"attachments_uploaded"`
	SnapshotsAuthored   int `json:"snapshots_authored"`
}

// Document is the top-level writable unit.
type Document struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	OwnerID     string    `json:"owner_id"`
	Title       string    `json:"title"`
	Content     string    `json:"content"`
	IsPublic    bool      `json:"is_public"`
	SortOrder   int       `json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// DocumentSearchResult represents a document search result with workspace name
type DocumentSearchResult struct {
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	Content       string    `json:"content"`
	WorkspaceID   string    `json:"workspace_id"`
	OwnerID       string    `json:"owner_id"`
	IsPublic      bool      `json:"is_public"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	SortOrder     int       `json:"sort_order"`
	WorkspaceName string    `json:"workspace_name,omitempty"`
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
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	DocumentID  *string   `json:"document_id,omitempty"`
	UploadBy    string    `json:"upload_by"`
	Filename    string    `json:"filename"`
	FileType    string    `json:"file_type"` // e.g. 'image/png'
	FileSize    int64     `json:"file_size"` // bytes
	FilePath    string    `json:"file_path"` // storage path
	CreatedAt   time.Time `json:"created_at"`
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

// Workspace represents a collaborative space that contains documents and attachments.
type Workspace struct {
	ID        string    `json:"id"`
	OwnerID   string    `json:"owner_id"`
	Name      string    `json:"name"`
	IsPublic  bool      `json:"is_public"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// WorkspaceMember grants a user access to a workspace.
type WorkspaceMember struct {
	ID          string          `json:"id"`
	WorkspaceID string          `json:"workspace_id"`
	UserID      string          `json:"user_id"`
	Level       PermissionLevel `json:"level"`
	CreatedAt   time.Time       `json:"created_at"`
	Username    string          `json:"username,omitempty"`
}

// AdminLog records administrative operations for audit trail.
type AdminLog struct {
	ID             string                 `json:"id"`
	AdminID        string                 `json:"admin_id"`
	Action         string                 `json:"action"`
	TargetType     string                 `json:"target_type"`
	TargetID       string                 `json:"target_id,omitempty"`
	TargetUsername string                 `json:"target_username,omitempty"`
	Details        map[string]interface{} `json:"details,omitempty"`
	IpAddress      string                 `json:"ip_address,omitempty"`
	UserAgent      string                 `json:"user_agent,omitempty"`
	CreatedAt      time.Time              `json:"created_at"`
	AdminUsername  string                 `json:"admin_username,omitempty"`
}

// Comment represents a comment on a document or heading.
type Comment struct {
	ID            string    `json:"id"`
	DocumentID    string    `json:"document_id"`
	AuthorID      string    `json:"author_id"`
	Content       string    `json:"content"`
	HeadingAnchor *string   `json:"heading_anchor,omitempty"` // nil means document-level comment
	ParentID      *string   `json:"parent_id,omitempty"`      // nil means root comment
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	AuthorUsername string   `json:"author_username,omitempty"`
	Replies       []*Comment `json:"replies,omitempty"`
}

// AIConversation represents an AI conversation session associated with a document.
type AIConversation struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	DocumentID string    `json:"document_id"`
	Title      string    `json:"title"`
	CreatedAt  time.Time `json:"created_at"`
}

// AIMessage represents a message in an AI conversation.
type AIMessage struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	Role           string    `json:"role"` // "user" or "assistant"
	Content        string    `json:"content"`
	CreatedAt      time.Time `json:"created_at"`
}

// AIMessageRole defines the role of an AI message.
const (
	AIRoleUser      = "user"
	AIRoleAssistant = "assistant"
)
