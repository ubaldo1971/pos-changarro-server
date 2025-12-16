const db = require('better-sqlite3')('database.sqlite');

console.log('=== CREATING FREE PLAN TEST BUSINESS ===\n');

// Check if test business already exists
const existing = db.prepare('SELECT id FROM businesses WHERE name = ?').get('TestFree');

if (existing) {
    console.log('Test business already exists, deleting...');
    db.prepare('DELETE FROM users WHERE business_id = ?').run(existing.id);
    db.prepare('DELETE FROM products WHERE business_id = ?').run(existing.id);
    db.prepare('DELETE FROM businesses WHERE id = ?').run(existing.id);
}

// Create test business with FREE plan
const result = db.prepare(`
    INSERT INTO businesses (name, plan, created_at)
    VALUES (?, ?, ?)
`).run('TestFree', 'free', new Date().toISOString());

const businessId = result.lastInsertRowid;
console.log(`Created business: TestFree (ID: ${businessId}) with FREE plan`);

// Create test user
db.prepare(`
    INSERT INTO users (business_id, name, role, pin, email, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(businessId, 'Test User', 'owner', '1234', 'test@free.com', 1, new Date().toISOString());

console.log('Created test user: test@free.com (PIN: 1234)');

// Add 20 products (the limit for FREE plan)
console.log('\nAdding 20 products (FREE plan limit)...');
for (let i = 1; i <= 20; i++) {
    db.prepare(`
        INSERT INTO products (business_id, name, price, stock, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        businessId,
        `Test Product ${i}`,
        10 + i,
        10,
        1,
        new Date().toISOString(),
        new Date().toISOString()
    );
}

// Verify
const count = db.prepare('SELECT COUNT(*) as count FROM products WHERE business_id = ?').get(businessId);
console.log(`✅ Added ${count.count} products`);

console.log('\n=== TEST BUSINESS CREATED ===');
console.log('Login credentials:');
console.log('  Email: test@free.com');
console.log('  PIN: 1234');
console.log('  Plan: FREE (20 products max)');
console.log('  Current products: 20/20');
console.log('\n⚠️  Try adding a 21st product - it should be blocked!');

db.close();
