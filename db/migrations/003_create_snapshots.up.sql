CREATE TABLE snapshots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    author_id   UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    content     TEXT NOT NULL,
    message     TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_document_id ON snapshots(document_id);
CREATE INDEX idx_snapshots_created_at  ON snapshots(document_id, created_at DESC);
