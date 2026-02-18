-- name: CreateWorkspace :one
INSERT INTO workspaces (owner_id, name)
VALUES ($1, $2)
RETURNING *;

-- name: GetWorkspaceByID :one
SELECT * FROM workspaces WHERE id = $1;

-- name: ListWorkspacesByOwner :many
SELECT * FROM workspaces WHERE owner_id = $1 ORDER BY updated_at DESC;

-- name: UpdateWorkspaceName :one
UPDATE workspaces
SET name = $2, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: UpdateWorkspacePublicStatus :one
UPDATE workspaces
SET is_public = $2, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteWorkspace :exec
DELETE FROM workspaces WHERE id = $1;

-- name: ListWorkspaceMembers :many
SELECT wm.id, wm.workspace_id, wm.user_id, wm.level, wm.created_at, u.username
FROM workspace_members wm
JOIN users u ON wm.user_id = u.id
WHERE wm.workspace_id = $1
ORDER BY wm.created_at;

-- name: GetWorkspaceMember :one
SELECT * FROM workspace_members 
WHERE workspace_id = $1 AND user_id = $2;

-- name: UpsertWorkspaceMember :one
INSERT INTO workspace_members (workspace_id, user_id, level)
VALUES ($1, $2, $3)
ON CONFLICT (workspace_id, user_id) 
DO UPDATE SET level = EXCLUDED.level
RETURNING *;

-- name: DeleteWorkspaceMember :exec
DELETE FROM workspace_members 
WHERE workspace_id = $1 AND user_id = $2;

-- name: ListWorkspacesByMember :many
SELECT w.* FROM workspaces w
JOIN workspace_members wm ON w.id = wm.workspace_id
WHERE wm.user_id = $1
ORDER BY w.updated_at DESC;

-- name: ListDocumentsByWorkspace :many
SELECT * FROM documents 
WHERE workspace_id = $1
ORDER BY updated_at DESC;
