/**
 * Script to add test products and create a sale for business_id 3
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

console.log('🔧 Adding test products for business_id 3...');

// First, let's see what columns exist in sales
const tableInfo = db.prepare("PRAGMA table_info(sales)").all();
console.log('\n📊 Sales table columns:');
tableInfo.forEach(col => console.log(`  - ${col.name} (${col.type})`));

// Get the products for business 3
const businessProducts = db.prepare('SELECT id, name, price FROM products WHERE business_id = 3 LIMIT 5').all();
console.log('\n📋 Products in business 3:');
businessProducts.forEach(p => console.log(`  - ${p.name} ($${p.price})`));

if (businessProducts.length === 0) {
    console.log('❌ No products found. Adding them first...');

    const products = [
        { name: 'Coca Cola 600ml', price: 18, cost: 12, stock: 100, barcode: '7501055301324' },
        { name: 'Sabritas 45g', price: 15, cost: 10, stock: 50, barcode: '7501123456789' },
        { name: 'Pan Blanco Bimbo', price: 35, cost: 25, stock: 20, barcode: '7501987654321' },
        { name: 'Leche Lala 1L', price: 25, cost: 18, stock: 30, barcode: '7501112223334' },
        { name: 'Agua Bonafont 1L', price: 12, cost: 8, stock: 80, barcode: '7501445556667' },
    ];

    const insertProduct = db.prepare(`
        INSERT OR IGNORE INTO products (business_id, name, price, cost, stock, barcode, min_stock, active)
        VALUES (?, ?, ?, ?, ?, ?, 10, 1)
    `);

    for (const p of products) {
        insertProduct.run(3, p.name, p.price, p.cost, p.stock, p.barcode);
        console.log(`  ✅ Added: ${p.name}`);
    }
}

// Create a test sale using correct column names
console.log('\n🧾 Creating test sale...');

try {
    // Build dynamic insert based on existing columns
    const hasColumn = (name) => tableInfo.some(c => c.name === name);

    let sql = 'INSERT INTO sales (business_id, user_id, total, payment_method';
    let values = [3, 3, 51, 'cash'];

    if (hasColumn('status')) {
        sql += ', status';
        values.push('completed');
    }
    if (hasColumn('cancelled')) {
        sql += ', cancelled';
        values.push(0);
    }
    if (hasColumn('created_at')) {
        sql += ', created_at';
        values.push(new Date().toISOString());
    }

    sql += ') VALUES (' + values.map(() => '?').join(', ') + ')';

    console.log('SQL:', sql);

    const insertSale = db.prepare(sql);
    const saleResult = insertSale.run(...values);
    const saleId = saleResult.lastInsertRowid;

    console.log(`  ✅ Sale #${saleId} created with total $51`);

    // Add sale items
    const itemsTableInfo = db.prepare("PRAGMA table_info(sale_items)").all();
    console.log('\n📊 Sale_items table columns:');
    itemsTableInfo.forEach(col => console.log(`  - ${col.name}`));

    const hasItemCol = (name) => itemsTableInfo.some(c => c.name === name);

    // Get products for this business
    const prods = db.prepare('SELECT id, name, price FROM products WHERE business_id = 3 LIMIT 2').all();

    if (prods.length >= 2) {
        let itemSql = 'INSERT INTO sale_items (sale_id, product_id';

        if (hasItemCol('product_name')) itemSql += ', product_name';
        if (hasItemCol('name')) itemSql += ', name';

        itemSql += ', quantity, price, subtotal) VALUES (?, ?';

        if (hasItemCol('product_name')) itemSql += ', ?';
        if (hasItemCol('name')) itemSql += ', ?';

        itemSql += ', ?, ?, ?)';

        const insertItem = db.prepare(itemSql);

        for (const prod of prods) {
            const qty = 1;
            const subtotal = prod.price * qty;

            if (hasItemCol('product_name') || hasItemCol('name')) {
                insertItem.run(saleId, prod.id, prod.name, qty, prod.price, subtotal);
            } else {
                insertItem.run(saleId, prod.id, qty, prod.price, subtotal);
            }
            console.log(`  ✅ Added item: ${prod.name}`);
        }
    }

    console.log(`\n✨ Done! Sale #${saleId} ready to test in Tickets module`);

} catch (err) {
    console.log('❌ Error creating sale:', err.message);
    console.error(err);
}

// Show current sales
try {
    const sales = db.prepare('SELECT id, total, payment_method, cancelled FROM sales WHERE business_id = 3 ORDER BY id DESC LIMIT 5').all();
    console.log('\n📊 Recent sales for business 3:');
    sales.forEach(s => {
        const status = s.cancelled ? '❌ Cancelled' : '✅ Active';
        console.log(`  - Sale #${s.id}: $${s.total} (${s.payment_method}) - ${status}`);
    });
} catch (e) {
    console.log('Could not list sales:', e.message);
}

db.close();
console.log('\n🔒 Database closed');
