-- name: CreateUser :one
INSERT INTO users (username, email, password_hash)
VALUES ($1, $2, $3)
RETURNING id, username, email, password_hash, preferred_language, is_admin, created_at, updated_at;

-- name: CreateUserWithAdmin :one
INSERT INTO users (username, email, password_hash, is_admin)
VALUES ($1, $2, $3, $4)
RETURNING id, username, email, password_hash, preferred_language, is_admin, created_at, updated_at;

-- name: GetUserByID :one
SELECT id, username, email, password_hash, preferred_language, is_admin, created_at, updated_at FROM users WHERE id = $1;

-- name: GetUserByEmail :one
SELECT id, username, email, password_hash, preferred_language, is_admin, created_at, updated_at FROM users WHERE email = $1;

-- name: GetUserByUsername :one
SELECT id, username, email, password_hash, preferred_language, is_admin, created_at, updated_at FROM users WHERE username = $1;

-- name: ListUsers :many
SELECT id, username, email, password_hash, preferred_language, is_admin, created_at, updated_at FROM users ORDER BY created_at DESC;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;

-- name: UpdateUserPassword :exec
UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1;

-- name: UpdateUserPreferredLanguage :one
UPDATE users SET preferred_language = $2, updated_at = NOW()
WHERE id = $1
RETURNING id, username, email, password_hash, preferred_language, is_admin, created_at, updated_at;

-- name: CountUsers :one
SELECT COUNT(*) FROM users;
