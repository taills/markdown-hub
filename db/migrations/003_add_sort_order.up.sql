-- Add sort_order to workspaces: default 0, users can set custom ordering.
ALTER TABLE workspaces ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Add sort_order to documents.
ALTER TABLE documents ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_workspaces_sort_order ON workspaces(sort_order);
CREATE INDEX idx_documents_sort_order ON documents(sort_order);
