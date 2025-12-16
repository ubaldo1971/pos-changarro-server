const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, 'src/db/database.sqlite');
const db = new Database(dbPath);

// Check current businesses
console.log('\n=== Current Businesses ===');
const businesses = db.prepare('SELECT id, name, plan, slug FROM businesses').all();
console.log(businesses);

// Check current users
console.log('\n=== Current Users ===');
const users = db.prepare('SELECT id, name, email, business_id, role FROM users').all();
console.log(users);

// Add tiendita3 in Pro mode
console.log('\n=== Adding tiendita3 (Pro) ===');

const planLimits = JSON.stringify({
    maxProducts: -1, // unlimited
    maxUsers: -1,    // unlimited
    canImportCSV: true,
    canExportReports: true,
    canUseMultiDevice: true,
    hasAPIAccess: true,
    hasPrioritySupport: true
});

try {
    // Insert business
    const insertBusiness = db.prepare(`
        INSERT INTO businesses (name, slug, plan, plan_limits, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
    `);

    const result = insertBusiness.run('Tiendita3', 'tiendita3', 'pro', planLimits);
    const businessId = result.lastInsertRowid;
    console.log('Business created with ID:', businessId);

    // Create owner user
    const hashedPassword = bcrypt.hashSync('test123', 10);
    const insertUser = db.prepare(`
        INSERT INTO users (business_id, name, email, password, role, pin, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
    `);

    const userResult = insertUser.run(
        businessId,
        'Admin Tiendita3',
        'tiendita3@test.com',
        hashedPassword,
        'owner',
        '1234'
    );
    console.log('User created with ID:', userResult.lastInsertRowid);

    // Update business owner_id
    db.prepare('UPDATE businesses SET owner_id = ? WHERE id = ?').run(userResult.lastInsertRowid, businessId);
    console.log('Business owner updated');

    console.log('\n✅ Tiendita3 created successfully!');
    console.log('Email: tiendita3@test.com');
    console.log('Password: test123');
    console.log('PIN: 1234');
    console.log('Plan: Pro');

} catch (error) {
    if (error.message.includes('UNIQUE')) {
        console.log('Tiendita3 already exists, skipping...');
    } else {
        console.error('Error:', error.message);
    }
}

// Show final state
console.log('\n=== Final State ===');
const finalBusinesses = db.prepare('SELECT id, name, plan, slug FROM businesses').all();
console.log('Businesses:', finalBusinesses);

db.close();
