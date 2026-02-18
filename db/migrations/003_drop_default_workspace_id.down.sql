DROP INDEX IF EXISTS idx_documents_workspace_updated_at;

ALTER TABLE users
    ADD COLUMN default_workspace_id UUID;

ALTER TABLE users
    ADD CONSTRAINT fk_users_default_workspace
    FOREIGN KEY (default_workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT;
