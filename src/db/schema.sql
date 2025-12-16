-- Businesses Table
CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    owner_id INTEGER,
    address TEXT,
    phone TEXT,
    logo TEXT,
    plan TEXT CHECK(plan IN ('free', 'basic', 'pro')) DEFAULT 'free',
    plan_limits TEXT, -- JSON with plan limits
    currency TEXT DEFAULT 'MXN',
    tax_rate REAL DEFAULT 0.16,
    settings TEXT, -- JSON for additional settings
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT CHECK(role IN ('owner', 'admin', 'manager', 'cashier', 'accountant')) NOT NULL DEFAULT 'cashier',
    pin TEXT NOT NULL DEFAULT '1234',
    phone TEXT,
    avatar TEXT,
    avatar_type TEXT CHECK(avatar_type IN ('image', 'emoji', 'initials')) DEFAULT 'initials',
    active INTEGER DEFAULT 1,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id)
);

-- Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Device Sessions Table (for PIN quick login)
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

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id)
);

-- Products Table
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    cost REAL DEFAULT 0,
    category_id INTEGER,
    barcode TEXT,
    stock REAL DEFAULT 0,
    min_stock REAL DEFAULT 5,
    type TEXT CHECK(type IN ('unit', 'weight')) DEFAULT 'unit',
    provider TEXT,
    image TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Sales Table
CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    total REAL NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT DEFAULT 'completed',
    cancelled INTEGER DEFAULT 0,
    cancelled_at TEXT,
    cancellation_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Sale Items Table
CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    subtotal REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Cash Sessions Table
CREATE TABLE IF NOT EXISTS cash_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    opening_amount REAL NOT NULL,
    closing_amount REAL,
    expected_amount REAL,
    difference REAL,
    status TEXT CHECK(status IN ('open', 'closed')) DEFAULT 'open',
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    notes TEXT,
    FOREIGN KEY (business_id) REFERENCES businesses(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Stock Movements Table
CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT CHECK(type IN ('sale', 'restock', 'adjustment', 'return')) NOT NULL,
    quantity REAL NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Pending Subscriptions Table (for plan upgrades)
CREATE TABLE IF NOT EXISTS pending_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    plan_key TEXT NOT NULL,
    preference_id TEXT,
    payment_id TEXT,
    external_reference TEXT,
    status TEXT CHECK(status IN ('pending', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (business_id) REFERENCES businesses(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Business Users Table (for multi-tenant access)
CREATE TABLE IF NOT EXISTS business_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    business_id INTEGER NOT NULL,
    role TEXT CHECK(role IN ('owner', 'admin', 'manager', 'cashier', 'accountant', 'member')) DEFAULT 'member',
    active INTEGER DEFAULT 1,
    invited_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id),
    UNIQUE(user_id, business_id)
);
