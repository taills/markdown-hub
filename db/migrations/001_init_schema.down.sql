DROP INDEX IF EXISTS idx_workspace_members_user;
DROP INDEX IF EXISTS idx_workspace_members_workspace;
DROP INDEX IF EXISTS idx_workspaces_owner;

DROP INDEX IF EXISTS idx_heading_perms_document;
DROP INDEX IF EXISTS idx_doc_perms_document;

DROP INDEX IF EXISTS idx_snapshots_created_at;
DROP INDEX IF EXISTS idx_snapshots_document_id;

DROP INDEX IF EXISTS idx_attachment_refs_document;
DROP INDEX IF EXISTS idx_attachment_refs_attachment;

DROP INDEX IF EXISTS idx_attachments_workspace_level;
DROP INDEX IF EXISTS idx_attachments_workspace_path;
DROP INDEX IF EXISTS idx_attachments_workspace_id;
DROP INDEX IF EXISTS idx_attachments_document;

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