-- name: CreateSocialAccount :one
INSERT INTO social_accounts (user_id, provider, external_user_id, external_nickname, access_token, refresh_token, token_expires_at, bound_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
RETURNING id, user_id, provider, external_user_id, external_nickname, access_token, refresh_token, token_expires_at, bound_at;

-- name: GetSocialAccountByProviderAndExternalID :one
SELECT id, user_id, provider, external_user_id, external_nickname, access_token, refresh_token, token_expires_at, bound_at
FROM social_accounts
WHERE provider = $1 AND external_user_id = $2;

-- name: GetSocialAccountByUserAndProvider :one
SELECT id, user_id, provider, external_user_id, external_nickname, access_token, refresh_token, token_expires_at, bound_at
FROM social_accounts
WHERE user_id = $1 AND provider = $2;

-- name: ListSocialAccountsByUser :many
SELECT id, user_id, provider, external_user_id, external_nickname, access_token, refresh_token, token_expires_at, bound_at
FROM social_accounts
WHERE user_id = $1;

-- name: DeleteSocialAccount :exec
DELETE FROM social_accounts WHERE user_id = $1 AND provider = $2;

-- name: DeleteSocialAccountByID :exec
DELETE FROM social_accounts WHERE id = $1;
