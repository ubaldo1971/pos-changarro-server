const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('Checking cash_sessions schema...');
    db.all("PRAGMA table_info(cash_sessions)", (err, rows) => {
        if (err) {
            console.error('Error getting schema:', err);
            return;
        }
        console.log('Current columns:', rows.map(r => r.name).join(', '));

        const hasOpeningAmount = rows.some(r => r.name === 'opening_amount');

        if (!hasOpeningAmount) {
            console.log('Adding missing column: opening_amount');
            db.run("ALTER TABLE cash_sessions ADD COLUMN opening_amount REAL DEFAULT 0", (err) => {
                if (err) console.error('Error adding column:', err);
                else console.log('Column added successfully');
            });
        } else {
            console.log('Column opening_amount already exists');
        }

        // Check for other potentially missing columns based on schema.sql
        const expectedColumns = ['closing_amount', 'expected_amount', 'difference', 'notes', 'status', 'opened_at', 'closed_at'];
        expectedColumns.forEach(col => {
            if (!rows.some(r => r.name === col)) {
                console.log(`Adding missing column: ${col}`);
                // Simple type assumption, adjust if needed
                let type = 'REAL';
                if (col === 'notes' || col === 'status') type = 'TEXT';
                if (col.endsWith('_at')) type = 'DATETIME';

                db.run(`ALTER TABLE cash_sessions ADD COLUMN ${col} ${type}`, (err) => {
                    if (err) console.error(`Error adding ${col}:`, err);
                    else console.log(`${col} added successfully`);
                });
            }
        });
    });
});
