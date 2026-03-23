-- Social accounts table for third-party login (dingtalk, wecom, feishu)
CREATE TABLE social_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider            TEXT NOT NULL CHECK (provider IN ('dingtalk', 'wecom', 'feishu')),
    external_user_id    TEXT NOT NULL,
    external_nickname   TEXT,
    access_token        TEXT,
    refresh_token       TEXT,
    token_expires_at    TIMESTAMPTZ,
    bound_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, external_user_id),
    UNIQUE (user_id, provider)
);

CREATE INDEX idx_social_accounts_user_id ON social_accounts(user_id);
CREATE INDEX idx_social_accounts_provider ON social_accounts(provider);

-- is_active column already exists in 002_users_soft_delete migration
