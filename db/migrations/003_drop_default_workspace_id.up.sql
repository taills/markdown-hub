ALTER TABLE users
    DROP CONSTRAINT IF EXISTS fk_users_default_workspace;

ALTER TABLE users
    DROP COLUMN IF EXISTS default_workspace_id;

CREATE INDEX IF NOT EXISTS idx_documents_workspace_updated_at
    ON documents(workspace_id, updated_at DESC);
