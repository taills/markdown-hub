-- Remove indexes
DROP INDEX IF EXISTS idx_workspaces_public;
DROP INDEX IF EXISTS idx_documents_public;

-- Remove is_public field from documents table
ALTER TABLE documents DROP COLUMN IF EXISTS is_public;

-- Remove is_public field from workspaces table
ALTER TABLE workspaces DROP COLUMN IF EXISTS is_public;
