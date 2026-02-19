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

-- name: ListDocumentsByWorkspace :many
SELECT * FROM documents WHERE workspace_id = $1 ORDER BY sort_order, updated_at DESC;

-- name: CountOwnedDocuments :one
SELECT COUNT(*) FROM documents WHERE owner_id = $1;

-- name: CountAccessibleDocuments :one
SELECT COUNT(DISTINCT d.id)
FROM documents d
LEFT JOIN workspace_members wm ON wm.workspace_id = d.workspace_id AND wm.user_id = $1
LEFT JOIN document_permissions dp ON dp.document_id = d.id AND dp.user_id = $1
WHERE wm.user_id IS NOT NULL OR dp.user_id IS NOT NULL;

-- name: UpdateDocumentSortOrder :exec
UPDATE documents SET sort_order = $2, updated_at = NOW() WHERE id = $1;
