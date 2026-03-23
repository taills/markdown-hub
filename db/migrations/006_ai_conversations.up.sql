-- AI 对话会话表
CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI 消息表
CREATE TABLE IF NOT EXISTS ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_ai_conv_user ON ai_conversations(user_id);
CREATE INDEX idx_ai_conv_document ON ai_conversations(document_id);
CREATE INDEX idx_ai_conv_created_at ON ai_conversations(created_at DESC);
CREATE INDEX idx_ai_msg_conversation ON ai_messages(conversation_id);
CREATE INDEX idx_ai_msg_created_at ON ai_messages(created_at);
