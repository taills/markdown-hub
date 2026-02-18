-- Create attachments table
CREATE TABLE attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    upload_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    filename     TEXT NOT NULL,
    file_type    TEXT NOT NULL,  -- e.g. 'image/png', 'application/pdf'
    file_size    BIGINT NOT NULL, -- bytes
    file_path    TEXT NOT NULL,   -- stored location (e.g. '/uploads/uuid')
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (document_id, file_path)
);

-- Create attachment_references table to track usage
CREATE TABLE attachment_references (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attachment_id   UUID NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    referenced_at   INT NOT NULL,   -- byte offset in markdown content
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_document ON attachments(document_id);
CREATE INDEX idx_attachment_refs_attachment ON attachment_references(attachment_id);
CREATE INDEX idx_attachment_refs_document ON attachment_references(document_id);
