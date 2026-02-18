-- name: CreateDocument :one
INSERT INTO documents (owner_id, title, content, workspace_id)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetDocumentByID :one
SELECT * FROM documents WHERE id = $1;

-- name: ListDocumentsByOwner :many
SELECT * FROM documents WHERE owner_id = $1 ORDER BY updated_at DESC;

-- name: UpdateDocumentContent :one
UPDATE documents
SET content = $2, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: UpdateDocumentTitle :one
UPDATE documents
SET title = $2, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: UpdateDocumentPublicStatus :one
UPDATE documents
SET is_public = $2, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteDocument :exec
DELETE FROM documents WHERE id = $1;
