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
        )`
    ];

    migrations.forEach((sql, index) => {
        database.run(sql, [], (err) => {
            if (err) {
                // Ignore "duplicate column" errors - means migration already ran
                if (!err.message.includes('duplicate column') && !err.message.includes('already exists')) {
                    console.log(`Migration ${index + 1} skipped:`, err.message.substring(0, 50));
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
