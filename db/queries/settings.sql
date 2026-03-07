-- name: GetSettingByKey :one
SELECT key, value, description, created_at, updated_at
FROM settings
WHERE key = $1;

-- name: GetAllSettings :many
SELECT key, value, description, created_at, updated_at
FROM settings;

-- name: UpsertSetting :exec
INSERT INTO settings (key, value, description, updated_at)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    description = COALESCE(EXCLUDED.description, settings.description),
    updated_at = NOW();
