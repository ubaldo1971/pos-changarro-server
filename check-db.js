const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

// La base de datos real está en la raíz del servidor
const dbPath = path.join(__dirname, 'database.sqlite');
console.log('Using DB:', dbPath);

const db = new Database(dbPath);

// Check tables
console.log('\n=== Tables ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables.map(t => t.name));

// Check current businesses
console.log('\n=== Current Businesses ===');
try {
    const businesses = db.prepare('SELECT id, name, plan, slug FROM businesses').all();
    console.log('Count:', businesses.length);
    businesses.forEach(b => console.log(`- ID ${b.id}: ${b.name} (plan: ${b.plan || 'free'}, slug: ${b.slug})`));
} catch (e) {
    console.log('Error:', e.message);
}

// Check current users
console.log('\n=== Current Users ===');
try {
    const users = db.prepare('SELECT id, name, email, business_id, role FROM users').all();
    console.log('Count:', users.length);
    users.forEach(u => console.log(`- ID ${u.id}: ${u.name} (${u.email}) - business: ${u.business_id}, role: ${u.role}`));
} catch (e) {
    console.log('Error:', e.message);
}

// Add tiendita3 if not exists
console.log('\n=== Adding Tiendita3 ===');
try {
    const existing = db.prepare("SELECT id FROM businesses WHERE slug = 'tiendita3'").get();
    if (existing) {
        console.log('Tiendita3 already exists with ID:', existing.id);
        // Update to Pro
        db.prepare("UPDATE businesses SET plan = 'pro' WHERE id = ?").run(existing.id);
        console.log('Updated to Pro plan');
    } else {
        const planLimits = JSON.stringify({
            maxProducts: -1,
            maxUsers: -1,
            canImportCSV: true,
            canExportReports: true,
            canUseMultiDevice: true
        });

        const bizResult = db.prepare(`
            INSERT INTO businesses (name, slug, plan, plan_limits)
            VALUES ('Tiendita3', 'tiendita3', 'pro', ?)
        `).run(planLimits);

        const businessId = bizResult.lastInsertRowid;
        console.log('Created business ID:', businessId);

        const hashedPassword = bcrypt.hashSync('test123', 10);
        const userResult = db.prepare(`
            INSERT INTO users (business_id, name, email, password, role, pin, active)
            VALUES (?, 'Admin Pro', 'tiendita3@test.com', ?, 'owner', '1234', 1)
        `).run(businessId, hashedPassword);

        console.log('Created user ID:', userResult.lastInsertRowid);

        db.prepare('UPDATE businesses SET owner_id = ? WHERE id = ?')
            .run(userResult.lastInsertRowid, businessId);

        console.log('\n✅ Tiendita3 creada!');
        console.log('Email: tiendita3@test.com');
        console.log('Password: test123');
        console.log('Plan: Pro');
    }
} catch (e) {
    console.log('Error:', e.message);
}

// Show final businesses
console.log('\n=== Final Businesses ===');
try {
    const businesses = db.prepare('SELECT id, name, plan FROM businesses').all();
    businesses.forEach(b => console.log(`- ${b.id}: ${b.name} (${b.plan})`));
} catch (e) {
    console.log('Error:', e.message);
}

db.close();
