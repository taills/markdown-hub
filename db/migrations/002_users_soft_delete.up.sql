-- Add soft-delete / active flag to users
ALTER TABLE users
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
