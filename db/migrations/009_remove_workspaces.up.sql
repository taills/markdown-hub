-- 迁移脚本: 移除 Workspace，重构为树形文档结构
-- 时间: 2026-03-24

BEGIN;

-- 1. 添加 parent_id, visibility, inherit_visibility 字段到 documents
ALTER TABLE documents ADD COLUMN parent_id UUID REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE documents ADD COLUMN inherit_visibility BOOLEAN NOT NULL DEFAULT true;

-- 2. 为每个 workspace 创建一个"根文档"，使用与 workspace 相同的 ID
INSERT INTO documents (id, owner_id, parent_id, title, content, is_public, visibility, inherit_visibility, sort_order, created_at, updated_at)
SELECT
    ws.id,
    ws.owner_id,
    NULL,  -- 根文档的 parent_id 为空
    ws.name,
    '',
    ws.is_public,
    CASE WHEN ws.is_public THEN 'public' ELSE 'internal' END,
    true,
    ws.sort_order,
    ws.created_at,
    ws.updated_at
FROM workspaces ws;

-- 3. 将原 workspace 下的文档 parent_id 指向新的根文档（workspace 转换的根文档）
UPDATE documents d
SET parent_id = d.workspace_id
WHERE d.workspace_id IS NOT NULL
  AND d.id != d.workspace_id  -- 排除已经是根文档的记录
  AND d.parent_id IS NULL;  -- 只更新还没有设置 parent_id 的文档

-- 4. 将 workspace_id 设置为根文档的 owner_id（更新 workspace_id 非空的记录）
UPDATE documents d
SET workspace_id = d.owner_id
WHERE d.workspace_id IS NOT NULL
  AND d.id = d.workspace_id;  -- 只更新根文档

-- 5. 将 workspace_id 改为可为空（稍后会删除）
ALTER TABLE documents ALTER COLUMN workspace_id DROP NOT NULL;

-- 6. 将 workspace_members 权限迁移到根文档的 document_permissions
INSERT INTO document_permissions (document_id, user_id, level, created_at)
SELECT
    ws.id,  -- 根文档ID
    wm.user_id,
    wm.level,
    wm.created_at
FROM workspace_members wm
JOIN workspaces ws ON ws.id = wm.workspace_id
ON CONFLICT (document_id, user_id) DO NOTHING;

-- 7. 处理 attachments：workspace_id 改为可选
ALTER TABLE attachments DROP CONSTRAINT attachments_workspace_id_fkey;
ALTER TABLE attachments DROP COLUMN workspace_id;
ALTER TABLE attachments ALTER COLUMN document_id DROP NOT NULL;

-- 8. 删除外键约束
ALTER TABLE documents DROP CONSTRAINT documents_workspace_id_fkey;

-- 9. 删除 workspace 相关表
DROP TABLE workspace_members;
DROP TABLE workspaces;

-- 10. 从 documents 表删除 workspace_id 列
ALTER TABLE documents DROP COLUMN workspace_id;

-- 11. 添加索引
CREATE INDEX idx_documents_parent_id ON documents(parent_id);
CREATE INDEX idx_documents_visibility ON documents(visibility);
CREATE INDEX idx_documents_inherit_visibility ON documents(inherit_visibility);

COMMIT;
