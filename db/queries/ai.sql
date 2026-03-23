-- name: CreateAIConversation :one
INSERT INTO ai_conversations (user_id, document_id, title)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetAIConversationByID :one
SELECT * FROM ai_conversations WHERE id = $1;

-- name: ListAIConversationsByDocument :many
SELECT * FROM ai_conversations
WHERE document_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListAIConversationsByUser :many
SELECT * FROM ai_conversations
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: DeleteAIConversation :exec
DELETE FROM ai_conversations WHERE id = $1;

-- name: CreateAIMessage :one
INSERT INTO ai_messages (conversation_id, role, content)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListAIMessagesByConversation :many
SELECT * FROM ai_messages
WHERE conversation_id = $1
ORDER BY created_at ASC;

-- name: GetLatestAIMessages :many
SELECT * FROM ai_messages
WHERE conversation_id = $1
ORDER BY created_at DESC
LIMIT $2;

-- name: CountAIConversationsByUser :one
SELECT COUNT(*) FROM ai_conversations WHERE user_id = $1;
