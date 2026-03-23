-- 回滚脚本: 恢复 Workspace 结构
-- 时间: 2026-03-24

BEGIN;

-- 1. 重新创建 workspaces 表
CREATE TABLE workspaces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    is_public   BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, name)
);

-- 2. 重新创建 workspace_members 表
CREATE TABLE workspace_members (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level        permission_level NOT NULL DEFAULT 'read',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, user_id)
);

-- 3. 为每个根文档恢复 workspace 记录
INSERT INTO workspaces (id, owner_id, name, is_public, sort_order, created_at, updated_at)
SELECT
    d.id,
    d.owner_id,
    d.title,
    d.is_public,
    d.sort_order,
    d.created_at,
    d.updated_at
FROM documents d
WHERE d.parent_id IS NULL
  AND d.content = ''  -- 根文档的特征是空内容
  AND NOT EXISTS (SELECT 1 FROM documents d2 WHERE d2.parent_id = d.id);

-- 4. 恢复 workspace_id 列并重建外键
ALTER TABLE documents ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- 5. 将子文档的 workspace_id 指向根文档
UPDATE documents d
SET workspace_id = d.parent_id
WHERE d.parent_id IS NOT NULL;

-- 6. 将根文档的 workspace_id 指向自己
UPDATE documents d
SET workspace_id = d.id
WHERE d.parent_id IS NULL
  AND d.content = '';

-- 7. 恢复 attachments 的 workspace_id
ALTER TABLE attachments ADD COLUMN workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE;

-- 8. 恢复 attachments 的 workspace_id 值
UPDATE attachments a
SET workspace_id = COALESCE(
    (SELECT d.workspace_id FROM documents d WHERE d.id = a.document_id),
    (SELECT d.owner_id FROM documents d WHERE d.id = a.document_id)
);

-- 9. 迁移 document_permissions 回到 workspace_members
INSERT INTO workspace_members (workspace_id, user_id, level, created_at)
SELECT
    dp.document_id,  -- 根文档ID作为 workspace_id
    dp.user_id,
    dp.level,
    dp.created_at
FROM document_permissions dp
JOIN documents d ON d.id = dp.document_id
WHERE d.parent_id IS NULL
  AND d.content = ''
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- 10. 删除根文档（由 workspace 恢复后再删除）
DELETE FROM documents d
WHERE d.parent_id IS NULL
  AND d.content = ''
  AND EXISTS (SELECT 1 FROM workspaces ws WHERE ws.id = d.id);

-- 11. 恢复 documents 的 workspace_id 为 NOT NULL
ALTER TABLE documents ALTER COLUMN workspace_id SET NOT NULL;

-- 12. 恢复索引
DROP INDEX IF EXISTS idx_documents_parent_id;
DROP INDEX IF EXISTS idx_documents_visibility;
DROP INDEX IF EXISTS idx_documents_inherit_visibility;

-- 13. 删除新增的字段
ALTER TABLE documents DROP COLUMN IF EXISTS parent_id;
ALTER TABLE documents DROP COLUMN IF EXISTS visibility;
ALTER TABLE documents DROP COLUMN IF EXISTS inherit_visibility;

-- 14. 删除 document_permissions 中指向根文档的记录
DELETE FROM document_permissions dp
WHERE EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = dp.document_id
    AND d.parent_id IS NULL
    AND d.content = ''
);

COMMIT;
