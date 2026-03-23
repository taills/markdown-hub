-- 评论表：支持文档评论和标题锚点评论
CREATE TABLE IF NOT EXISTS comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    heading_anchor  TEXT,                              -- NULL 表示针对整个文档的评论，非NULL表示针对特定标题
    parent_id       UUID REFERENCES comments(id) ON DELETE CASCADE,  -- 支持回复评论
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_comments_document_id ON comments(document_id);
CREATE INDEX idx_comments_author_id ON comments(author_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);
CREATE INDEX idx_comments_heading_anchor ON comments(heading_anchor) WHERE heading_anchor IS NOT NULL;
