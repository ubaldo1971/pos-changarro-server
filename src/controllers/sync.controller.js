const db = require('../db/database');

exports.pushChanges = async (req, res) => {
    const { changes } = req.body;

    if (!changes || !Array.isArray(changes)) {
        return res.status(400).json({ error: 'Invalid changes format' });
    }

    console.log(`Received ${changes.length} changes to sync`);

    const results = {
        success: 0,
        failed: 0,
        errors: []
    };

    // Process sequentially to maintain order
    for (const op of changes) {
        try {
            const { table_name, operation, data } = op;

            // Parse data if it's a string
            const record = typeof data === 'string' ? JSON.parse(data) : data;

            if (operation === 'CREATE') {
                const keys = Object.keys(record).filter(k => k !== 'id'); // Exclude local ID
                const values = keys.map(k => record[k]);
                const placeholders = keys.map(() => '?').join(',');

                await db.run(
                    `INSERT INTO ${table_name} (${keys.join(',')}) VALUES (${placeholders})`,
                    values
                );
            } else if (operation === 'UPDATE') {
                const id = record.id;
                const keys = Object.keys(record).filter(k => k !== 'id');
                const sets = keys.map(k => `${k} = ?`).join(',');
                const values = keys.map(k => record[k]);

                await db.run(
                    `UPDATE ${table_name} SET ${sets} WHERE id = ?`,
                    [...values, id]
                );
            } else if (operation === 'DELETE') {
                await db.run(`DELETE FROM ${table_name} WHERE id = ?`, [record.id]);
            }

            results.success++;
        } catch (error) {
            console.error('Sync error:', error);
            results.failed++;
            results.errors.push({ operation: op, error: error.message });
        }
    }

    res.json({ message: 'Sync processed', results });
};

exports.pullChanges = async (req, res) => {
    try {
        const products = await db.query('SELECT * FROM products');
        const categories = await db.query('SELECT * FROM categories');
        const users = await db.query('SELECT * FROM users');

        res.json({
            products,
            categories,
            users,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Pull error:', error);
        res.status(500).json({ error: 'Failed to pull data' });
    }
};

/**
 * Full product sync - replace all products for a business
 * This ensures the server has the complete list of products from the client
 */
exports.fullProductSync = async (req, res) => {
    const { businessId, products } = req.body;

    if (!businessId) {
        return res.status(400).json({ error: 'Business ID required' });
    }

    if (!products || !Array.isArray(products)) {
        return res.status(400).json({ error: 'Products array required' });
    }

    console.log(`Full product sync for business ${businessId}: ${products.length} products`);

    try {
        // Begin transaction-like behavior
        // First, delete all existing products for this business
        await db.run('DELETE FROM products WHERE business_id = ?', [businessId]);
        console.log(`Deleted existing products for business ${businessId}`);

        // Insert all products from client
        let inserted = 0;
        for (const product of products) {
            try {
                await db.run(`
                    INSERT INTO products (
                        business_id, name, barcode, price, cost, stock, 
                        min_stock, category_id, image, active, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    businessId,
                    product.name,
                    product.barcode || null,
                    product.price || 0,
                    product.cost || 0,
                    product.stock || 0,
                    product.min_stock || 5,
                    product.category_id || null,
                    product.image || null,
                    product.active !== undefined ? product.active : 1,
                    product.created_at || new Date().toISOString(),
                    product.updated_at || new Date().toISOString()
                ]);
                inserted++;
            } catch (insertError) {
                console.error(`Error inserting product ${product.name}:`, insertError.message);
            }
        }

        console.log(`Inserted ${inserted} products for business ${businessId}`);

        res.json({
            success: true,
            message: `Synced ${inserted} products`,
            count: inserted
        });

    } catch (error) {
        console.error('Full product sync error:', error);
        res.status(500).json({ error: 'Full sync failed', details: error.message });
    }
};
