-- name: CreateAdminLog :one
INSERT INTO admin_logs (admin_id, action, target_type, target_id, target_username, details, ip_address, user_agent)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, admin_id, action, target_type, target_id, target_username, details, ip_address, user_agent, created_at;

-- name: ListAdminLogs :many
SELECT 
  al.id, 
  al.admin_id, 
  u.username as admin_username,
  al.action, 
  al.target_type, 
  al.target_id, 
  al.target_username, 
  al.details, 
  al.ip_address, 
  al.user_agent, 
  al.created_at
FROM admin_logs al
LEFT JOIN users u ON al.admin_id = u.id
ORDER BY al.created_at DESC
LIMIT $1 OFFSET $2;

-- name: ListAdminLogsByAdmin :many
SELECT 
  al.id, 
  al.admin_id, 
  u.username as admin_username,
  al.action, 
  al.target_type, 
  al.target_id, 
  al.target_username, 
  al.details, 
  al.ip_address, 
  al.user_agent, 
  al.created_at
FROM admin_logs al
LEFT JOIN users u ON al.admin_id = u.id
WHERE al.admin_id = $1
ORDER BY al.created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountAdminLogs :one
SELECT COUNT(*) FROM admin_logs;
