-- Migration to add authentication fields
-- Run this on existing databases

-- Add authentication fields to users table
ALTER TABLE users ADD COLUMN email TEXT UNIQUE;
ALTER TABLE users ADD COLUMN password TEXT;
ALTER TABLE users ADD COLUMN avatar TEXT;
ALTER TABLE users ADD COLUMN avatar_type TEXT CHECK(avatar_type IN ('image', 'emoji', 'initials')) DEFAULT 'initials';
ALTER TABLE users ADD COLUMN last_login DATETIME;

-- Add fields to businesses table for multi-tenant
ALTER TABLE businesses ADD COLUMN slug TEXT UNIQUE;
ALTER TABLE businesses ADD COLUMN plan TEXT CHECK(plan IN ('free', 'basic', 'pro')) DEFAULT 'free';
ALTER TABLE businesses ADD COLUMN plan_limits TEXT; -- JSON with limits
ALTER TABLE businesses ADD COLUMN logo TEXT;
ALTER TABLE businesses ADD COLUMN currency TEXT DEFAULT 'MXN';
ALTER TABLE businesses ADD COLUMN tax_rate REAL DEFAULT 0.16;
ALTER TABLE businesses ADD COLUMN settings TEXT; -- JSON for additional settings

-- Create refresh tokens table for JWT refresh
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create device sessions table for PIN quick login
CREATE TABLE IF NOT EXISTS device_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    business_id INTEGER NOT NULL,
    device_token TEXT NOT NULL UNIQUE,
    device_name TEXT,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- Update roles to support more options
-- Note: SQLite doesn't support ALTER COLUMN, so this is for new databases
-- For existing databases, we'll handle role validation in the application
