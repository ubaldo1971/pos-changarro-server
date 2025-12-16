const db = require('better-sqlite3')('database.sqlite');

console.log('=== TESTING PLAN LIMITS ===\n');

// Get all businesses with their plans
const businesses = db.prepare(`
    SELECT b.id, b.name, b.plan, 
           (SELECT COUNT(*) FROM products WHERE business_id = b.id) as product_count,
           (SELECT COUNT(*) FROM users WHERE business_id = b.id) as user_count
    FROM businesses b
`).all();

console.log('Current businesses and usage:');
businesses.forEach(b => {
    const limits = {
        free: { maxProducts: 20, maxUsers: 1 },
        basic: { maxProducts: 300, maxUsers: 5 },
        pro: { maxProducts: -1, maxUsers: -1 }
    };

    const planLimits = limits[b.plan] || limits.free;
    const productStatus = planLimits.maxProducts === -1 ? 'Unlimited' :
        `${b.product_count}/${planLimits.maxProducts}`;
    const userStatus = planLimits.maxUsers === -1 ? 'Unlimited' :
        `${b.user_count}/${planLimits.maxUsers}`;

    console.log(`\n${b.name} (ID: ${b.id})`);
    console.log(`  Plan: ${b.plan.toUpperCase()}`);
    console.log(`  Products: ${productStatus}`);
    console.log(`  Users: ${userStatus}`);

    // Check if over limit
    if (planLimits.maxProducts !== -1 && b.product_count > planLimits.maxProducts) {
        console.log(`  ⚠️  WARNING: Over product limit!`);
    }
    if (planLimits.maxUsers !== -1 && b.user_count > planLimits.maxUsers) {
        console.log(`  ⚠️  WARNING: Over user limit!`);
    }
});

console.log('\n=== PLAN UPGRADE SIMULATION ===\n');

// Test upgrading tiendita1 from free to basic
const tiendita1 = businesses.find(b => b.name === 'tiendita1');
if (tiendita1) {
    console.log(`Simulating upgrade for ${tiendita1.name}:`);
    console.log(`  Current plan: ${tiendita1.plan}`);
    console.log(`  Current products: ${tiendita1.product_count}`);

    if (tiendita1.plan === 'free' && tiendita1.product_count > 20) {
        console.log(`  ⚠️  This account has ${tiendita1.product_count} products but is on FREE plan (limit: 20)`);
        console.log(`  💡 Should upgrade to BASIC (limit: 300) or PRO (unlimited)`);
    }
}

db.close();
console.log('\n=== TEST COMPLETE ===');
