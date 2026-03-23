-- name: CreateDocument :one
INSERT INTO documents (owner_id, parent_id, title, content, visibility, inherit_visibility, sort_order)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetDocumentByID :one
SELECT * FROM documents WHERE id = $1;

-- name: ListDocumentsByOwner :many
SELECT * FROM documents WHERE owner_id = $1 ORDER BY sort_order, updated_at DESC;

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

-- name: UpdateDocumentVisibility :one
UPDATE documents
SET visibility = $2, inherit_visibility = $3, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteDocument :exec
DELETE FROM documents WHERE id = $1;

-- name: UpdateDocumentParent :one
UPDATE documents
SET parent_id = $2, sort_order = $3, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: ListChildDocuments :many
SELECT * FROM documents WHERE parent_id = $1 ORDER BY sort_order, updated_at DESC;

-- name: ListRootDocuments :many
SELECT * FROM documents WHERE parent_id IS NULL AND owner_id = $1 ORDER BY sort_order, updated_at DESC;

-- name: CountOwnedDocuments :one
SELECT COUNT(*) FROM documents WHERE owner_id = $1;

-- name: CountAccessibleDocuments :one
SELECT COUNT(DISTINCT d.id)
FROM documents d
LEFT JOIN document_permissions dp ON dp.document_id = d.id AND dp.user_id = $1
WHERE d.owner_id = $1 OR dp.user_id IS NOT NULL;

-- name: ListPublicDocuments :many
SELECT * FROM documents WHERE visibility = 'public' ORDER BY updated_at DESC LIMIT 20;

-- name: UpdateDocumentSortOrder :exec
UPDATE documents SET sort_order = $2, updated_at = NOW() WHERE id = $1;

-- name: SearchDocuments :many
SELECT id, parent_id, title, content, owner_id, visibility, inherit_visibility, is_public, created_at, updated_at, sort_order
FROM documents
WHERE visibility = 'public'
  AND (title ILIKE '%' || $1 || '%' OR content ILIKE '%' || $1 || '%')
ORDER BY updated_at DESC
LIMIT 20;

-- name: SearchUserDocuments :many
SELECT d.id, d.title, d.content, d.owner_id, d.visibility, d.is_public, d.created_at, d.updated_at, d.sort_order
FROM documents d
LEFT JOIN document_permissions dp ON dp.document_id = d.id AND dp.user_id = $1
WHERE (d.owner_id = $1 OR dp.user_id IS NOT NULL)
  AND (d.title ILIKE '%' || $2 || '%' OR d.content ILIKE '%' || $2 || '%')
ORDER BY d.updated_at DESC
LIMIT 20;

-- name: GetDocumentPath :many
WITH RECURSIVE doc_path AS (
    SELECT d.id, d.parent_id, d.title, 1 as depth
    FROM documents d
    WHERE d.id = $1
    UNION ALL
    SELECT d.id, d.parent_id, d.title, dp.depth + 1
    FROM documents d
    JOIN doc_path dp ON d.id = dp.parent_id
)
SELECT * FROM doc_path ORDER BY depth;

-- name: ListDocumentsWithPermission :many
SELECT DISTINCT d.*
FROM documents d
LEFT JOIN document_permissions dp ON dp.document_id = d.id AND dp.user_id = $1
WHERE d.owner_id = $1 OR dp.user_id IS NOT NULL;
