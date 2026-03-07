-- Settings table for application configuration
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings if not exist
INSERT INTO settings (key, value, description) VALUES
    ('LOG_LEVEL', 'info', 'Logging level: debug, info, warn, error'),
    ('LOG_PRETTY', 'true', 'Pretty print logs: true, false')
ON CONFLICT (key) DO NOTHING;
