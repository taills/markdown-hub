-- name: CreateSnapshot :one
INSERT INTO snapshots (document_id, author_id, content, message)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetSnapshotByID :one
SELECT * FROM snapshots WHERE id = $1;

-- name: ListSnapshotsByDocument :many
SELECT * FROM snapshots
WHERE document_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetLatestSnapshot :one
SELECT * FROM snapshots
WHERE document_id = $1
ORDER BY created_at DESC
LIMIT 1;

-- name: CountSnapshotsAuthored :one
SELECT COUNT(*) FROM snapshots WHERE author_id = $1;
