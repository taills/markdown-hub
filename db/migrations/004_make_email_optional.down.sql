-- Revert: Make email field required again
-- Note: This migration may fail if there are NULL emails in the database
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
