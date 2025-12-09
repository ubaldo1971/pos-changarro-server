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
