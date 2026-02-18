DROP INDEX IF EXISTS idx_attachments_workspace_id;
DROP INDEX IF EXISTS idx_attachments_document;

DROP INDEX IF EXISTS idx_documents_workspace_updated_at;
DROP INDEX IF EXISTS idx_documents_workspace_id;
DROP INDEX IF EXISTS idx_documents_owner_id;

DROP TABLE IF EXISTS heading_permissions;
DROP TABLE IF EXISTS document_permissions;
DROP TABLE IF EXISTS snapshots;
DROP TABLE IF EXISTS attachment_references;
DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS workspace_members;
DROP TABLE IF EXISTS workspaces;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS permission_level;
