-- Add is_public field to workspaces table
ALTER TABLE workspaces ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE;

-- Add is_public field to documents table
ALTER TABLE documents ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for faster public document queries
CREATE INDEX idx_documents_public ON documents(is_public) WHERE is_public = TRUE;
CREATE INDEX idx_workspaces_public ON workspaces(is_public) WHERE is_public = TRUE;
