-- name: UpsertDocumentPermission :one
INSERT INTO document_permissions (document_id, user_id, level)
VALUES ($1, $2, $3)
ON CONFLICT (document_id, user_id)
DO UPDATE SET level = EXCLUDED.level
RETURNING *;

-- name: GetDocumentPermission :one
SELECT * FROM document_permissions
WHERE document_id = $1 AND user_id = $2;

-- name: ListDocumentPermissions :many
SELECT * FROM document_permissions WHERE document_id = $1;

-- name: DeleteDocumentPermission :exec
DELETE FROM document_permissions WHERE document_id = $1 AND user_id = $2;

-- name: UpsertHeadingPermission :one
INSERT INTO heading_permissions (document_id, user_id, heading_anchor, level)
VALUES ($1, $2, $3, $4)
ON CONFLICT (document_id, user_id, heading_anchor)
DO UPDATE SET level = EXCLUDED.level
RETURNING *;

-- name: GetHeadingPermission :one
SELECT * FROM heading_permissions
WHERE document_id = $1 AND user_id = $2 AND heading_anchor = $3;

-- name: ListHeadingPermissions :many
SELECT * FROM heading_permissions
WHERE document_id = $1 AND user_id = $2;

-- name: DeleteHeadingPermission :exec
DELETE FROM heading_permissions
WHERE document_id = $1 AND user_id = $2 AND heading_anchor = $3;
-- name: ListPermissionsWithUsername :many
SELECT 
    dp.id, 
    dp.document_id, 
    dp.user_id, 
    dp.level, 
    dp.created_at,
    u.username
FROM document_permissions dp
JOIN users u ON dp.user_id = u.id
WHERE dp.document_id = $1;

-- name: ListDocumentsWithPermission :many
SELECT DISTINCT d.* FROM documents d
JOIN document_permissions dp ON d.id = dp.document_id
WHERE dp.user_id = $1
ORDER BY d.updated_at DESC;

-- name: GetDocumentPermissionByUsername :one
SELECT dp.* FROM document_permissions dp
JOIN users u ON dp.user_id = u.id
WHERE dp.document_id = $1 AND u.username = $2;