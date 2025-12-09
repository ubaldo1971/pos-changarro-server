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
                }
            });
        }
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
