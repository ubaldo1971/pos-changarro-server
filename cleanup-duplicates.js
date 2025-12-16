const db = require('better-sqlite3')('database.sqlite');

// Find and delete duplicates - keep only the first occurrence of each product name per business
console.log('Before cleanup:');
const before = db.prepare('SELECT business_id, COUNT(*) as count FROM products GROUP BY business_id').all();
console.log(before);

// Get unique products (minimum id for each name+business combination)
const uniqueProducts = db.prepare(`
    SELECT MIN(id) as keep_id, name, business_id 
    FROM products 
    GROUP BY name, business_id
`).all();

console.log(`Found ${uniqueProducts.length} unique products`);

// Get ids to keep
const idsToKeep = uniqueProducts.map(p => p.keep_id);

// Delete all except unique
const deleteStmt = db.prepare('DELETE FROM products WHERE id NOT IN (' + idsToKeep.join(',') + ')');
const result = deleteStmt.run();
console.log(`Deleted ${result.changes} duplicate products`);

console.log('After cleanup:');
const after = db.prepare('SELECT business_id, COUNT(*) as count FROM products GROUP BY business_id').all();
console.log(after);

db.close();
