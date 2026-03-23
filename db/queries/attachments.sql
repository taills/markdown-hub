-- name: CreateAttachment :one
INSERT INTO attachments (document_id, upload_by, filename, file_type, file_size, file_path)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetAttachmentByID :one
SELECT * FROM attachments WHERE id = $1;

-- name: ListDocumentAttachments :many
SELECT * FROM attachments WHERE document_id = $1 ORDER BY created_at DESC;

-- name: DeleteAttachment :exec
DELETE FROM attachments WHERE id = $1;

-- name: CreateAttachmentReference :one
INSERT INTO attachment_references (attachment_id, document_id, referenced_at)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListAttachmentReferences :many
SELECT * FROM attachment_references WHERE attachment_id = $1;

-- name: ListDocumentAttachmentReferences :many
SELECT ar.* FROM attachment_references ar
JOIN attachments a ON ar.attachment_id = a.id
WHERE a.document_id = $1;

-- name: GetUnreferencedAttachments :many
SELECT a.* FROM attachments a
LEFT JOIN attachment_references ar ON a.id = ar.attachment_id
WHERE a.document_id = $1 AND ar.id IS NULL;

-- name: DeleteAttachmentReference :exec
DELETE FROM attachment_references WHERE attachment_id = $1 AND document_id = $2;

-- name: CountAttachmentsUploaded :one
SELECT COUNT(*) FROM attachments WHERE upload_by = $1;
