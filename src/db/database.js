const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../database.sqlite');
const schemaPath = path.join(__dirname, 'schema.sql');

let db;

function getDb() {
    if (!db) {
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
            } else {
                console.log('Connected to the SQLite database.');
                db.run('PRAGMA journal_mode = WAL');
            }
        });
    }
    return db;
}

function init() {
    const database = getDb();

    // Check if tables exist
    database.get("SELECT name FROM sqlite_master WHERE type='table' AND name='products'", (err, row) => {
        if (!row) {
            console.log('Initializing database schema...');
            const schema = fs.readFileSync(schemaPath, 'utf8');

            // sqlite3 exec runs all statements
            database.exec(schema, (err) => {
                if (err) {
                    console.error('Error executing schema:', err.message);
                } else {
                    console.log('Database initialized successfully.');
                    runMigrations(database);
                }
            });
        } else {
            // Tables exist, run migrations for any missing columns
            runMigrations(database);
        }
    });
}

// Run migrations for existing databases
function runMigrations(database) {
    const migrations = [
        // Add cancelled column to sales if not exists
        "ALTER TABLE sales ADD COLUMN cancelled INTEGER DEFAULT 0",
        "ALTER TABLE sales ADD COLUMN cancelled_at TEXT",
        "ALTER TABLE sales ADD COLUMN cancellation_id INTEGER",
        // Create cancellations table if not exists
        `CREATE TABLE IF NOT EXISTS cancellations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            business_id INTEGER NOT NULL,
            sale_id INTEGER NOT NULL,
            cancelled_by INTEGER NOT NULL,
            cancellation_reason_code TEXT NOT NULL,
            cancellation_reason_text TEXT NOT NULL,
            observations TEXT,
            requires_refund INTEGER DEFAULT 0,
            refund_method TEXT,
            refund_status TEXT DEFAULT 'pending',
            refund_amount REAL,
            refund_processed_at TEXT,
            refund_processed_by INTEGER,
            cancelled_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (business_id) REFERENCES businesses(id),
            FOREIGN KEY (sale_id) REFERENCES sales(id),
            FOREIGN KEY (cancelled_by) REFERENCES users(id)
        )`,
        // Create refunds table if not exists
        `CREATE TABLE IF NOT EXISTS refunds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cancellation_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            method TEXT NOT NULL,
            reference TEXT,
            bank_account TEXT,
            notes TEXT,
            processed_by INTEGER NOT NULL,
            processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cancellation_id) REFERENCES cancellations(id)
        )`,
        // Create cancellation_audit table if not exists
        `CREATE TABLE IF NOT EXISTS cancellation_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cancellation_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            performed_by INTEGER NOT NULL,
            details TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cancellation_id) REFERENCES cancellations(id)
        )`,
        // Create pending_subscriptions table if not exists
        `CREATE TABLE IF NOT EXISTS pending_subscriptions (
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
        )`,
        // Create business_users table if not exists
        // Create business_users table if not exists
        `CREATE TABLE IF NOT EXISTS business_users (
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
        )`,
        // Fix for missing columns used in auth middleware
        "ALTER TABLE businesses ADD COLUMN suspended INTEGER DEFAULT 0",
        "ALTER TABLE businesses ADD COLUMN plan_limits TEXT",
        // Add product_name to sale_items for display purposes
        "ALTER TABLE sale_items ADD COLUMN product_name TEXT",
        // Add cancelled_quantity to sale_items for partial cancellations
        "ALTER TABLE sale_items ADD COLUMN cancelled_quantity INTEGER DEFAULT 0",
        // Create cancelled_items table for partial cancellations
        `CREATE TABLE IF NOT EXISTS cancelled_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cancellation_id INTEGER NOT NULL,
            sale_item_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            refund_amount REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cancellation_id) REFERENCES cancellations(id),
            FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )`,
        // Add client_sale_id to sales table for sync deduplication
        "ALTER TABLE sales ADD COLUMN client_sale_id INTEGER"
    ];

    migrations.forEach((sql, index) => {
        database.run(sql, [], (err) => {
            if (err) {
                // Ignore "duplicate column" errors - means migration already ran
                if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('no such table')) {
                    console.log(`Migration ${index + 1} skipped/applied:`, err.message);
                }
            } else {
                console.log(`Migration ${index + 1} applied successfully`);
            }
        });
    });
}

// Promisify helper
function query(sql, params = []) {
    const database = getDb();
    return new Promise((resolve, reject) => {
        database.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function run(sql, params = []) {
    const database = getDb();
    return new Promise((resolve, reject) => {
        database.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

module.exports = {
    getDb,
    init,
    query,
    run
};
