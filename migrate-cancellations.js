const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

console.log('🔄 Running cancellations migration...\n');

const db = new Database('database.sqlite');

// Read migration file
const migrationSQL = fs.readFileSync(
    path.join(__dirname, 'src/db/migrations/add-cancellations.sql'),
    'utf8'
);

try {
    // Execute each statement
    const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let skipCount = 0;

    statements.forEach((statement, index) => {
        try {
            db.exec(statement);
            successCount++;
            console.log(`✅ Statement ${index + 1}/${statements.length} executed`);
        } catch (error) {
            // Ignore "duplicate column" errors (migration already run)
            if (error.message.includes('duplicate column') ||
                error.message.includes('already exists')) {
                skipCount++;
                console.log(`⚠️  Statement ${index + 1}: Already exists (skipped)`);
            } else {
                console.error(`❌ Statement ${index + 1} failed:`, error.message);
                console.error(`Statement: ${statement.substring(0, 100)}...`);
                throw error;
            }
        }
    });

    console.log(`\n✅ Migration completed!`);
    console.log(`   ${successCount} statements executed`);
    console.log(`   ${skipCount} statements skipped (already exist)`);
    console.log('\nCancellations module database ready!');

} catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
} finally {
    db.close();
}
