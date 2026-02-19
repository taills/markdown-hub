-- Rollback soft-delete column on users
ALTER TABLE users
  DROP COLUMN IF EXISTS is_active;
