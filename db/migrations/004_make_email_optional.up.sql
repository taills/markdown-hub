-- Make email field optional and remove UNIQUE constraint on email
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
