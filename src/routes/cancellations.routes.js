const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth.middleware');
const db = require('../db/database');

// SAT Cancellation Reasons
const SAT_REASONS = {
    '01': 'Comprobante emitido con errores con relación',
    '02': 'Comprobante emitido con errores sin relación',
    '03': 'No se llevó a cabo la operación',
    '04': 'Operación nominativa relacionada en una factura global'
};

// Cancellation time limits (in days)
const CANCELLATION_LIMITS = {
    'persona_moral': 90,  // 3 months for businesses
    'persona_fisica': 120  // 4 months for individuals
};

/**
 * GET /api/cancellations
 * Get list of cancelable sales
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const { status, startDate, endDate, limit = 50 } = req.query;
        const businessId = req.user.business_id;

        let query = `
            SELECT s.*, 
                   u.name as cashier_name,
                   c.id as cancellation_id,
                   c.cancellation_reason_code,
                   c.cancellation_reason_text,
                   c.cancelled_at,
                   c.refund_status,
                   JULIANDAY('now') - JULIANDAY(s.created_at) as days_since_sale
            FROM sales s
            LEFT JOIN users u ON s.user_id = u.id
            LEFT JOIN cancellations c ON s.id = c.sale_id
            WHERE s.business_id = ?
        `;

        const params = [businessId];

        if (status === 'cancelled') {
            query += ' AND s.cancelled = 1';
        } else if (status === 'active') {
            query += ' AND s.cancelled = 0';
        }

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

        // Add cancellation eligibility
        const salesWithEligibility = sales.map(sale => ({
            ...sale,
            can_cancel: sale.cancelled === 0 && sale.days_since_sale <= 90,
            days_remaining: Math.max(0, 90 - Math.floor(sale.days_since_sale))
        }));

        res.json({ sales: salesWithEligibility });

    } catch (error) {
        console.error('Error getting cancellations:', error);
        res.status(500).json({ error: 'Failed to get cancellations' });
    }
});

/**
 * POST /api/cancellations
 * Create a new cancellation
 */
router.post('/', verifyToken, requireRole(['owner', 'admin', 'manager']), async (req, res) => {
    try {
        const {
            sale_id,
            reason_code,
            observations,
            requires_refund,
            refund_method
        } = req.body;

        if (!sale_id || !reason_code) {
            return res.status(400).json({
                error: 'Sale ID and reason code are required'
            });
        }

        // Validate reason code
        if (!SAT_REASONS[reason_code]) {
            return res.status(400).json({
                error: 'Invalid SAT reason code',
                valid_codes: Object.keys(SAT_REASONS)
            });
        }

        // Get sale details
        const sales = await db.query(
            'SELECT * FROM sales WHERE id = ? AND business_id = ?',
            [sale_id, req.user.business_id]
        );

        if (sales.length === 0) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        const sale = sales[0];

        // Check if already cancelled
        if (sale.cancelled === 1) {
            return res.status(400).json({
                error: 'Sale already cancelled',
                code: 'ALREADY_CANCELLED'
            });
        }

        // Check cancellation time limit (90 days)
        const saleDate = new Date(sale.created_at);
        const daysSinceSale = (Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceSale > 90) {
            return res.status(400).json({
                error: 'Cancellation period expired (90 days)',
                code: 'PERIOD_EXPIRED',
                days_since_sale: Math.floor(daysSinceSale)
            });
        }

        // Get sale items for inventory reintegration
        const saleItems = await db.query(
            'SELECT * FROM sale_items WHERE sale_id = ?',
            [sale_id]
        );

        // Start transaction
        db.db.exec('BEGIN TRANSACTION');

        try {
            // Create cancellation record
            const cancellationResult = await db.run(
                `INSERT INTO cancellations (
                    business_id, sale_id, cancelled_by,
                    cancellation_reason_code, cancellation_reason_text,
                    observations, requires_refund, refund_method, refund_amount,
                    refund_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.user.business_id,
                    sale_id,
                    req.user.id,
                    reason_code,
                    SAT_REASONS[reason_code],
                    observations || null,
                    requires_refund ? 1 : 0,
                    refund_method || null,
                    requires_refund ? sale.total : null,
                    requires_refund ? 'pending' : null
                ]
            );

            const cancellationId = cancellationResult.lastID;

            // Update sale as cancelled
            await db.run(
                `UPDATE sales SET 
                    cancelled = 1,
                    cancelled_at = CURRENT_TIMESTAMP,
                    cancellation_id = ?
                 WHERE id = ?`,
                [cancellationId, sale_id]
            );

            // Reintegrate products to inventory
            for (const item of saleItems) {
                await db.run(
                    'UPDATE products SET stock = stock + ? WHERE id = ?',
                    [item.quantity, item.product_id]
                );

                // Record stock movement
                await db.run(
                    `INSERT INTO stock_movements (product_id, user_id, type, quantity, reason)
                     VALUES (?, ?, 'return', ?, ?)`,
                    [
                        item.product_id,
                        req.user.id,
                        item.quantity,
                        `Cancelación de venta #${sale_id} - ${SAT_REASONS[reason_code]}`
                    ]
                );
            }

            // Create audit log
            await db.run(
                `INSERT INTO cancellation_audit (cancellation_id, action, performed_by, details)
                 VALUES (?, 'created', ?, ?)`,
                [
                    cancellationId,
                    req.user.id,
                    JSON.stringify({
                        reason_code,
                        requires_refund,
                        sale_total: sale.total,
                        items_count: saleItems.length
                    })
                ]
            );

            db.db.exec('COMMIT');

            res.status(201).json({
                success: true,
                cancellation: {
                    id: cancellationId,
                    sale_id,
                    reason_code,
                    reason_text: SAT_REASONS[reason_code],
                    requires_refund,
                    refund_amount: requires_refund ? sale.total : null,
                    products_reintegrated: saleItems.length
                }
            });

        } catch (error) {
            db.db.exec('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Error creating cancellation:', error);
        res.status(500).json({ error: 'Failed to create cancellation' });
    }
});

/**
 * GET /api/cancellations/:id
 * Get cancellation details
 */
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        const cancellations = await db.query(
            `SELECT c.*, s.total as sale_total, s.payment_method,
                    u.name as cancelled_by_name,
                    ru.name as refund_processed_by_name
             FROM cancellations c
             JOIN sales s ON c.sale_id = s.id
             JOIN users u ON c.cancelled_by = u.id
             LEFT JOIN users ru ON c.refund_processed_by = ru.id
             WHERE c.id = ? AND c.business_id = ?`,
            [id, req.user.business_id]
        );

        if (cancellations.length === 0) {
            return res.status(404).json({ error: 'Cancellation not found' });
        }

        // Get refund details if exists
        const refunds = await db.query(
            'SELECT * FROM refunds WHERE cancellation_id = ?',
            [id]
        );

        // Get audit log
        const audit = await db.query(
            `SELECT ca.*, u.name as performed_by_name
             FROM cancellation_audit ca
             JOIN users u ON ca.performed_by = u.id
             WHERE ca.cancellation_id = ?
             ORDER BY ca.created_at DESC`,
            [id]
        );

        res.json({
            cancellation: cancellations[0],
            refund: refunds[0] || null,
            audit
        });

    } catch (error) {
        console.error('Error getting cancellation:', error);
        res.status(500).json({ error: 'Failed to get cancellation' });
    }
});

/**
 * POST /api/cancellations/:id/refund
 * Process refund for a cancellation
 */
router.post('/:id/refund', verifyToken, requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { method, reference, bank_account, notes } = req.body;

        if (!method) {
            return res.status(400).json({ error: 'Refund method is required' });
        }

        // Validate method
        const validMethods = ['cash', 'transfer', 'credit'];
        if (!validMethods.includes(method)) {
            return res.status(400).json({
                error: 'Invalid refund method',
                valid_methods: validMethods
            });
        }

        // Get cancellation
        const cancellations = await db.query(
            'SELECT * FROM cancellations WHERE id = ? AND business_id = ?',
            [id, req.user.business_id]
        );

        if (cancellations.length === 0) {
            return res.status(404).json({ error: 'Cancellation not found' });
        }

        const cancellation = cancellations[0];

        if (!cancellation.requires_refund) {
            return res.status(400).json({
                error: 'This cancellation does not require a refund'
            });
        }

        if (cancellation.refund_status === 'completed') {
            return res.status(400).json({
                error: 'Refund already processed',
                code: 'REFUND_ALREADY_PROCESSED'
            });
        }

        // Create refund record
        const refundResult = await db.run(
            `INSERT INTO refunds (cancellation_id, amount, method, reference, bank_account, notes, processed_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                cancellation.refund_amount,
                method,
                reference || null,
                bank_account || null,
                notes || null,
                req.user.id
            ]
        );

        // Update cancellation refund status
        await db.run(
            `UPDATE cancellations SET 
                refund_status = 'completed',
                refund_processed_at = CURRENT_TIMESTAMP,
                refund_processed_by = ?
             WHERE id = ?`,
            [req.user.id, id]
        );

        // Create audit log
        await db.run(
            `INSERT INTO cancellation_audit (cancellation_id, action, performed_by, details)
             VALUES (?, 'refund_processed', ?, ?)`,
            [
                id,
                req.user.id,
                JSON.stringify({ method, amount: cancellation.refund_amount })
            ]
        );

        res.json({
            success: true,
            refund: {
                id: refundResult.lastID,
                amount: cancellation.refund_amount,
                method,
                processed_at: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error processing refund:', error);
        res.status(500).json({ error: 'Failed to process refund' });
    }
});

/**
 * GET /api/cancellations/report
 * Get cancellations report (admin only)
 */
router.get('/report/summary', verifyToken, requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const businessId = req.user.business_id;

        let dateFilter = '';
        const params = [businessId];

        if (startDate && endDate) {
            dateFilter = 'AND DATE(c.cancelled_at) BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }

        // Get summary statistics
        const summary = await db.query(
            `SELECT 
                COUNT(*) as total_cancellations,
                SUM(CASE WHEN requires_refund = 1 THEN 1 ELSE 0 END) as refunds_required,
                SUM(CASE WHEN refund_status = 'completed' THEN 1 ELSE 0 END) as refunds_completed,
                SUM(CASE WHEN refund_status = 'pending' THEN 1 ELSE 0 END) as refunds_pending,
                SUM(refund_amount) as total_refund_amount,
                cancellation_reason_code,
                COUNT(*) as count_by_reason
             FROM cancellations c
             WHERE business_id = ? ${dateFilter}
             GROUP BY cancellation_reason_code`,
            params
        );

        res.json({ summary });

    } catch (error) {
        console.error('Error getting cancellations report:', error);
        res.status(500).json({ error: 'Failed to get report' });
    }
});

/**
 * GET /api/cancellations/sale/:saleId/items
 * Get items from a sale for ticket details
 */
router.get('/sale/:saleId/items', verifyToken, async (req, res) => {
    try {
        const { saleId } = req.params;

        // Verify sale belongs to user's business
        const sales = await db.query(
            'SELECT * FROM sales WHERE id = ? AND business_id = ?',
            [saleId, req.user.business_id]
        );

        if (sales.length === 0) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        // Get sale items with product details
        const items = await db.query(
            `SELECT si.*, p.name as product_name, p.barcode
             FROM sale_items si
             JOIN products p ON si.product_id = p.id
             WHERE si.sale_id = ?`,
            [saleId]
        );

        res.json({
            sale: sales[0],
            items
        });

    } catch (error) {
        console.error('Error getting sale items:', error);
        res.status(500).json({ error: 'Failed to get sale items' });
    }
});

module.exports = router;
