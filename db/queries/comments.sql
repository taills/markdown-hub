-- name: CreateComment :one
INSERT INTO comments (document_id, author_id, content, heading_anchor, parent_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetCommentByID :one
SELECT * FROM comments WHERE id = $1;

-- name: ListCommentsByDocument :many
SELECT * FROM comments
WHERE document_id = $1
ORDER BY created_at ASC;

-- name: ListCommentsByDocumentAndAnchor :many
SELECT * FROM comments
WHERE document_id = $1 AND heading_anchor = $2
ORDER BY created_at ASC;

-- name: ListDocumentComments :many
SELECT * FROM comments
WHERE document_id = $1 AND heading_anchor IS NULL
ORDER BY created_at ASC;

-- name: UpdateComment :one
UPDATE comments
SET content = $2, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteComment :exec
DELETE FROM comments WHERE id = $1;

-- name: ListCommentsByAuthor :many
SELECT * FROM comments WHERE author_id = $1 ORDER BY created_at DESC;

-- name: CountCommentsByDocument :one
SELECT COUNT(*) FROM comments WHERE document_id = $1;

-- name: ListCommentReplies :many
SELECT * FROM comments WHERE parent_id = $1 ORDER BY created_at ASC;
