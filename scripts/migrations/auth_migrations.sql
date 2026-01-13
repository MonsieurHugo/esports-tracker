-- Authentication System Migrations
-- Run this script to add authentication tables to the esports_tracker database

-- 1. Add new columns to users table (if they don't exist)
DO $$
BEGIN
    -- Email verification
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verified') THEN
        ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verified_at') THEN
        ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP NULL;
    END IF;

    -- 2FA
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'two_factor_enabled') THEN
        ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT false NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'two_factor_secret') THEN
        ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR(64) NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'two_factor_recovery_codes') THEN
        ALTER TABLE users ADD COLUMN two_factor_recovery_codes TEXT NULL;
    END IF;

    -- Security
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'failed_login_attempts') THEN
        ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0 NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'locked_until') THEN
        ALTER TABLE users ADD COLUMN locked_until TIMESTAMP NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login_at') THEN
        ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login_ip') THEN
        ALTER TABLE users ADD COLUMN last_login_ip VARCHAR(45) NULL;
    END IF;

    RAISE NOTICE 'Users table columns updated successfully';
END $$;

-- 2. Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Create email_verification_tokens table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Create oauth_accounts table
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    provider_email VARCHAR(254) NULL,
    access_token TEXT NULL,
    refresh_token TEXT NULL,
    token_expires_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NULL,
    UNIQUE(user_id, provider),
    UNIQUE(provider, provider_user_id)
);

-- 5. Create auth_audit_logs table
CREATE TABLE IF NOT EXISTS auth_audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL NULL,
    action VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    success BOOLEAN DEFAULT true NOT NULL,
    reason VARCHAR(255) NULL,
    metadata JSONB NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for auth_audit_logs
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_user_action ON auth_audit_logs(user_id, action);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_created_at ON auth_audit_logs(created_at);

-- Mark existing users as email verified (since they existed before this system)
UPDATE users SET email_verified = true WHERE email_verified = false;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Authentication migrations completed successfully!';
END $$;
