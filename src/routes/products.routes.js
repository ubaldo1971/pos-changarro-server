const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const db = require('../db/database');

/**
 * GET /api/products
 * Get all products for the current business
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const businessId = req.user.business_id;

        const products = await db.query(
            `SELECT p.*, c.name as category_name 
             FROM products p 
             LEFT JOIN categories c ON p.category_id = c.id 
             WHERE p.business_id = ? AND p.active = 1 
             ORDER BY p.name`,
            [businessId]
        );

        res.json({ products });
    } catch (error) {
        console.error('Error getting products:', error);
        res.status(500).json({ error: 'Failed to get products' });
    }
});

/**
 * POST /api/products
 * Create a new product
 */
router.post('/', verifyToken, async (req, res) => {
    try {
        const {
            name,
            price,
            cost,
            barcode,
            stock,
            min_stock,
            category_id,
            type,
            provider,
            image
        } = req.body;

        if (!name || price === undefined) {
            return res.status(400).json({ error: 'Name and price are required' });
        }

        const businessId = req.user.business_id;

        const result = await db.run(
            `INSERT INTO products (business_id, name, price, cost, barcode, stock, min_stock, category_id, type, provider, image, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [
                businessId,
                name,
                price,
                cost || 0,
                barcode || null,
                stock || 0,
                min_stock || 5,
                category_id || null,
                type || 'unit',
                provider || null,
                image || null
            ]
        );

        const productId = result.lastID;

        console.log(`[PRODUCTS] Created product #${productId}: ${name} for business ${businessId}`);

        res.status(201).json({
            success: true,
            product: {
                id: productId,
                business_id: businessId,
                name,
                price,
                stock: stock || 0
            }
        });

    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

/**
 * PUT /api/products/:id
 * Update a product
 */
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const {
            name,
            price,
            cost,
            barcode,
            stock,
            min_stock,
            category_id,
            type,
            provider,
            image
        } = req.body;

        const businessId = req.user.business_id;

        // Verify product belongs to this business
        const existing = await db.query(
            'SELECT id FROM products WHERE id = ? AND business_id = ?',
            [productId, businessId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        await db.run(
            `UPDATE products SET 
                name = COALESCE(?, name),
                price = COALESCE(?, price),
                cost = COALESCE(?, cost),
                barcode = ?,
                stock = COALESCE(?, stock),
                min_stock = COALESCE(?, min_stock),
                category_id = ?,
                type = COALESCE(?, type),
                provider = ?,
                image = ?,
                updated_at = datetime('now')
             WHERE id = ? AND business_id = ?`,
            [
                name,
                price,
                cost,
                barcode,
                stock,
                min_stock,
                category_id,
                type,
                provider,
                image,
                productId,
                businessId
            ]
        );

        console.log(`[PRODUCTS] Updated product #${productId} for business ${businessId}`);

        res.json({
            success: true,
            message: 'Product updated successfully'
        });

    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

/**
 * DELETE /api/products/:id
 * Delete (deactivate) a product
 */
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const businessId = req.user.business_id;

        // Verify product belongs to this business
        const existing = await db.query(
            'SELECT id FROM products WHERE id = ? AND business_id = ?',
            [productId, businessId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Soft delete
        await db.run(
            'UPDATE products SET active = 0, updated_at = datetime(\'now\') WHERE id = ?',
            [productId]
        );

        console.log(`[PRODUCTS] Deleted product #${productId} for business ${businessId}`);

        res.json({
            success: true,
            message: 'Product deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

/**
 * PUT /api/products/:id/stock
 * Update product stock
 */
router.put('/:id/stock', verifyToken, async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const { quantity, type, reason } = req.body;
        const businessId = req.user.business_id;
        const userId = req.user.id;

        // Verify product belongs to this business
        const existing = await db.query(
            'SELECT id, stock FROM products WHERE id = ? AND business_id = ?',
            [productId, businessId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const currentStock = existing[0].stock || 0;
        let newStock;

        if (type === 'in') {
            newStock = currentStock + quantity;
        } else if (type === 'out') {
            newStock = currentStock - quantity;
        } else {
            newStock = quantity; // adjustment
        }

        // Update stock
        await db.run(
            'UPDATE products SET stock = ?, updated_at = datetime(\'now\') WHERE id = ?',
            [newStock, productId]
        );

        // Record stock movement
        await db.run(
            `INSERT INTO stock_movements (product_id, type, quantity, reason, user_id, date)
             VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            [productId, type, quantity, reason || '', userId]
        );

        res.json({
            success: true,
            newStock
        });

    } catch (error) {
        console.error('Error updating stock:', error);
        res.status(500).json({ error: 'Failed to update stock' });
    }
});

module.exports = router;
