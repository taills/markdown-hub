CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE permission_level AS ENUM ('read', 'edit', 'manage');

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username    TEXT NOT NULL UNIQUE,
    email       TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    default_workspace_id UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workspaces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, name)
);

CREATE TABLE workspace_members (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level        permission_level NOT NULL DEFAULT 'read',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, user_id)
);

ALTER TABLE users
    ADD CONSTRAINT fk_users_default_workspace
    FOREIGN KEY (default_workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT;

CREATE TABLE documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    upload_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    filename     TEXT NOT NULL,
    file_type    TEXT NOT NULL,
    file_size    BIGINT NOT NULL,
    file_path    TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    UNIQUE (document_id, file_path)
);

CREATE TABLE attachment_references (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attachment_id   UUID NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    referenced_at   INT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE snapshots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    author_id   UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    content     TEXT NOT NULL,
    message     TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE document_permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level       permission_level NOT NULL DEFAULT 'read',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, user_id)
);

CREATE TABLE heading_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    heading_anchor  TEXT NOT NULL,
    level           permission_level NOT NULL DEFAULT 'read',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, user_id, heading_anchor)
);

CREATE INDEX idx_documents_owner_id ON documents(owner_id);
CREATE INDEX idx_documents_workspace_id ON documents(workspace_id);

CREATE INDEX idx_attachments_document ON attachments(document_id);
CREATE INDEX idx_attachments_workspace_id ON attachments(workspace_id);

-- Make document_id nullable for workspace-level attachments
ALTER TABLE attachments
ALTER COLUMN document_id DROP NOT NULL;

-- Update the unique constraint to exclude NULL document_id values
-- This allows multiple workspace-level attachments to the same file_path
DROP INDEX IF EXISTS idx_attachments_workspace_path;
CREATE UNIQUE INDEX idx_attachments_workspace_path ON attachments(workspace_id, file_path) WHERE document_id IS NOT NULL;

-- Add an index for workspace-level attachments (document_id IS NULL)
CREATE INDEX idx_attachments_workspace_level ON attachments(workspace_id) WHERE document_id IS NULL;

CREATE INDEX idx_attachment_refs_attachment ON attachment_references(attachment_id);
CREATE INDEX idx_attachment_refs_document ON attachment_references(document_id);

CREATE INDEX idx_snapshots_document_id ON snapshots(document_id);
CREATE INDEX idx_snapshots_created_at  ON snapshots(document_id, created_at DESC);

CREATE INDEX idx_doc_perms_document ON document_permissions(document_id);
CREATE INDEX idx_heading_perms_document ON heading_permissions(document_id);

CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);