const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const db = require('../db/database');

/**
 * POST /api/sales
 * Create a new sale (sync from client)
 */
router.post('/', verifyToken, async (req, res) => {
    try {
        const {
            total,
            payment_method,
            payment_reference,
            cash_received,
            cash_change,
            items,
            client_sale_id
        } = req.body;

        if (!total || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                error: 'Total and items are required'
            });
        }

        const businessId = req.user.business_id;
        const userId = req.user.id;

        // Check for duplicate sale using client_sale_id
        if (client_sale_id) {
            const existingSale = await db.query(
                'SELECT id FROM sales WHERE business_id = ? AND client_sale_id = ?',
                [businessId, client_sale_id]
            );

            if (existingSale.length > 0) {
                console.log(`[SALES] Duplicate detected: client_sale_id ${client_sale_id} already exists as sale #${existingSale[0].id}`);
                return res.status(200).json({
                    success: true,
                    duplicate: true,
                    sale: {
                        id: existingSale[0].id,
                        total,
                        payment_method,
                        items_count: items.length
                    }
                });
            }
        }

        // Start transaction
        db.getDb().exec('BEGIN TRANSACTION');

        try {
            // Create sale record with client_sale_id for deduplication
            const saleResult = await db.run(
                `INSERT INTO sales (business_id, user_id, total, payment_method, status, client_sale_id, created_at)
                 VALUES (?, ?, ?, ?, 'completed', ?, datetime('now'))`,
                [businessId, userId, total, payment_method || 'cash', client_sale_id || null]
            );

            const saleId = saleResult.id;

            // Create sale items
            for (const item of items) {
                await db.run(
                    `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, price, subtotal)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        saleId,
                        item.product_id,
                        item.product_name || '',
                        item.quantity,
                        item.unit_price || item.price,
                        item.subtotal
                    ]
                );

                // Update product stock
                await db.run(
                    'UPDATE products SET stock = stock - ? WHERE id = ? AND business_id = ?',
                    [item.quantity, item.product_id, businessId]
                );
            }

            db.getDb().exec('COMMIT');

            console.log(`[SALES] Created sale #${saleId} for business ${businessId}, total: $${total}`);

            res.status(201).json({
                success: true,
                sale: {
                    id: saleId,
                    total,
                    payment_method,
                    items_count: items.length
                }
            });

        } catch (error) {
            db.getDb().exec('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Error creating sale:', error);
        res.status(500).json({ error: 'Failed to create sale' });
    }
});

/**
 * GET /api/sales
 * Get sales for the current business
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const { startDate, endDate, limit = 50 } = req.query;
        const businessId = req.user.business_id;

        let query = `
            SELECT s.*, u.name as cashier_name
            FROM sales s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.business_id = ?
        `;
        const params = [businessId];

        if (startDate) {
            query += ' AND DATE(s.created_at) >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += ' AND DATE(s.created_at) <= ?';
            params.push(endDate);
        }

        query += ' ORDER BY s.created_at DESC LIMIT ?';
        params.push(parseInt(limit));

        const sales = await db.query(query, params);

        res.json({ sales });

    } catch (error) {
        console.error('Error getting sales:', error);
        res.status(500).json({ error: 'Failed to get sales' });
    }
});

module.exports = router;
