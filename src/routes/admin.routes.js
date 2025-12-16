const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth.middleware');
const db = require('../db/database');

// Super admin emails (optional - for platform-level access)
const SUPER_ADMINS = ['admin@poschangarro.com', 'ubaldo71@gmail.com'];

/**
 * Middleware to check if user is owner or super admin
 * Owners can see their own business data
 * Super admins can see all data
 */
const requireOwnerOrAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    // Allow owners to access admin panel for their business
    if (req.user.role === 'owner' || SUPER_ADMINS.includes(req.user.email)) {
        req.isSuperAdmin = SUPER_ADMINS.includes(req.user.email);
        return next();
    }

    return res.status(403).json({
        error: 'Owner or admin access required',
        code: 'NOT_OWNER'
    });
};

/**
 * GET /api/admin/dashboard
 * Get admin dashboard stats
 */
router.get('/dashboard', verifyToken, requireOwnerOrAdmin, async (req, res) => {
    try {
        // Get total businesses
        const totalBusinesses = await db.query('SELECT COUNT(*) as count FROM businesses');

        // Get businesses by plan
        const businessesByPlan = await db.query(
            `SELECT plan, COUNT(*) as count FROM businesses GROUP BY plan`
        );

        // Get total users
        const totalUsers = await db.query('SELECT COUNT(*) as count FROM users WHERE active = 1');

        // Get total sales
        const totalSales = await db.query('SELECT COUNT(*) as count, SUM(total) as revenue FROM sales');

        // Get recent registrations (last 30 days)
        const recentRegistrations = await db.query(
            `SELECT COUNT(*) as count FROM businesses 
             WHERE created_at >= datetime('now', '-30 days')`
        );

        // Get pending subscriptions
        const pendingSubscriptions = await db.query(
            `SELECT COUNT(*) as count FROM pending_subscriptions WHERE status = 'pending'`
        );

        res.json({
            stats: {
                totalBusinesses: totalBusinesses[0]?.count || 0,
                totalUsers: totalUsers[0]?.count || 0,
                totalSales: totalSales[0]?.count || 0,
                totalRevenue: totalSales[0]?.revenue || 0,
                recentRegistrations: recentRegistrations[0]?.count || 0,
                pendingSubscriptions: pendingSubscriptions[0]?.count || 0
            },
            businessesByPlan: businessesByPlan.reduce((acc, row) => {
                acc[row.plan || 'free'] = row.count;
                return acc;
            }, { free: 0, basic: 0, pro: 0 })
        });

    } catch (error) {
        console.error('Error getting admin dashboard:', error);
        res.status(500).json({ error: 'Failed to get dashboard stats' });
    }
});

/**
 * GET /api/admin/businesses
 * Get all businesses with details
 */
router.get('/businesses', verifyToken, requireOwnerOrAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, plan, search } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT b.*, 
                   u.name as owner_name, 
                   u.email as owner_email,
                   (SELECT COUNT(*) FROM products WHERE business_id = b.id AND active = 1) as product_count,
                   (SELECT COUNT(*) FROM users WHERE business_id = b.id AND active = 1) as user_count,
                   (SELECT COUNT(*) FROM sales WHERE business_id = b.id) as sale_count,
                   (SELECT SUM(total) FROM sales WHERE business_id = b.id) as total_revenue
            FROM businesses b
            LEFT JOIN users u ON b.owner_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (plan) {
            query += ` AND b.plan = ?`;
            params.push(plan);
        }

        if (search) {
            query += ` AND (b.name LIKE ? OR u.email LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY b.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const businesses = await db.query(query, params);

        // Get total count
        let countQuery = `SELECT COUNT(*) as count FROM businesses b LEFT JOIN users u ON b.owner_id = u.id WHERE 1=1`;
        const countParams = [];

        if (plan) {
            countQuery += ` AND b.plan = ?`;
            countParams.push(plan);
        }
        if (search) {
            countQuery += ` AND (b.name LIKE ? OR u.email LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`);
        }

        const countResult = await db.query(countQuery, countParams);

        res.json({
            businesses,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0]?.count || 0,
                totalPages: Math.ceil((countResult[0]?.count || 0) / limit)
            }
        });

    } catch (error) {
        console.error('Error getting businesses:', error);
        res.status(500).json({ error: 'Failed to get businesses' });
    }
});

/**
 * PUT /api/admin/businesses/:id/plan
 * Update business plan (admin override)
 */
router.put('/businesses/:id/plan', verifyToken, requireOwnerOrAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { plan } = req.body;

        if (!['free', 'basic', 'pro'].includes(plan)) {
            return res.status(400).json({ error: 'Invalid plan' });
        }

        const { PLAN_LIMITS } = require('../middleware/plan.middleware');

        await db.run(
            `UPDATE businesses SET plan = ?, plan_limits = ? WHERE id = ?`,
            [plan, JSON.stringify(PLAN_LIMITS[plan]), id]
        );

        res.json({ success: true, message: `Plan updated to ${plan}` });

    } catch (error) {
        console.error('Error updating plan:', error);
        res.status(500).json({ error: 'Failed to update plan' });
    }
});

/**
 * GET /api/admin/users
 * Get all users
 */
router.get('/users', verifyToken, requireOwnerOrAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT u.id, u.name, u.email, u.role, u.phone, u.active, u.last_login, u.created_at,
                   b.name as business_name, b.plan as business_plan
            FROM users u
            LEFT JOIN businesses b ON u.business_id = b.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (u.name LIKE ? OR u.email LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const users = await db.query(query, params);

        res.json({ users });

    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

/**
 * GET /api/admin/subscriptions
 * Get all subscriptions/payments
 */
router.get('/subscriptions', verifyToken, requireOwnerOrAdmin, async (req, res) => {
    try {
        const subscriptions = await db.query(`
            SELECT ps.*, b.name as business_name, u.email as user_email
            FROM pending_subscriptions ps
            LEFT JOIN businesses b ON ps.business_id = b.id
            LEFT JOIN users u ON ps.user_id = u.id
            ORDER BY ps.created_at DESC
            LIMIT 100
        `);

        res.json({ subscriptions });

    } catch (error) {
        console.error('Error getting subscriptions:', error);
        res.status(500).json({ error: 'Failed to get subscriptions' });
    }
});

// ============================================================================
// PUBLIC ADMIN ROUTES (use admin-secret header instead of JWT)
// These are for the admin dashboard that uses a password login
// ============================================================================

const ADMIN_SECRET = 'changarro2024';

const verifyAdminSecret = (req, res, next) => {
    const secret = req.headers['x-admin-secret'];
    if (secret === ADMIN_SECRET) {
        return next();
    }
    return res.status(401).json({ error: 'Invalid admin secret' });
};

/**
 * GET /api/admin/public/dashboard
 * Get admin dashboard stats (public with admin secret)
 */
router.get('/public/dashboard', verifyAdminSecret, async (req, res) => {
    try {
        const totalBusinesses = await db.query('SELECT COUNT(*) as count FROM businesses');
        const businessesByPlan = await db.query(
            `SELECT plan, COUNT(*) as count FROM businesses GROUP BY plan`
        );
        const totalUsers = await db.query('SELECT COUNT(*) as count FROM users WHERE active = 1');
        const totalSales = await db.query('SELECT COUNT(*) as count, SUM(total) as revenue FROM sales');
        const recentRegistrations = await db.query(
            `SELECT COUNT(*) as count FROM businesses 
             WHERE created_at >= datetime('now', '-30 days')`
        );
        const pendingSubscriptions = await db.query(
            `SELECT COUNT(*) as count FROM pending_subscriptions WHERE status = 'pending'`
        );

        res.json({
            stats: {
                totalBusinesses: totalBusinesses[0]?.count || 0,
                totalUsers: totalUsers[0]?.count || 0,
                totalSales: totalSales[0]?.count || 0,
                totalRevenue: totalSales[0]?.revenue || 0,
                recentRegistrations: recentRegistrations[0]?.count || 0,
                pendingSubscriptions: pendingSubscriptions[0]?.count || 0,
                businessesByPlan: businessesByPlan.reduce((acc, row) => {
                    acc[row.plan || 'free'] = row.count;
                    return acc;
                }, { free: 0, basic: 0, pro: 0 })
            }
        });

    } catch (error) {
        console.error('Error getting admin dashboard:', error);
        res.status(500).json({ error: 'Failed to get dashboard stats' });
    }
});

/**
 * GET /api/admin/public/businesses
 * Get all businesses (public with admin secret)
 */
router.get('/public/businesses', verifyAdminSecret, async (req, res) => {
    try {
        const { page = 1, limit = 50, plan, search } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT b.*, 
                   u.name as owner_name, 
                   u.email as owner_email,
                   (SELECT COUNT(*) FROM products WHERE business_id = b.id AND active = 1) as product_count,
                   (SELECT COUNT(*) FROM users WHERE business_id = b.id AND active = 1) as user_count,
                   (SELECT COUNT(*) FROM sales WHERE business_id = b.id) as sale_count,
                   (SELECT SUM(total) FROM sales WHERE business_id = b.id) as total_revenue
            FROM businesses b
            LEFT JOIN users u ON b.owner_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (plan) {
            query += ` AND b.plan = ?`;
            params.push(plan);
        }

        if (search) {
            query += ` AND (b.name LIKE ? OR u.email LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY b.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const businesses = await db.query(query, params);

        res.json({ businesses });

    } catch (error) {
        console.error('Error getting businesses:', error);
        res.status(500).json({ error: 'Failed to get businesses' });
    }
});

/**
 * PUT /api/admin/public/businesses/:id/plan
 * Update business plan (public with admin secret)
 */
router.put('/public/businesses/:id/plan', verifyAdminSecret, async (req, res) => {
    try {
        const { id } = req.params;
        const { plan } = req.body;

        if (!['free', 'basic', 'pro'].includes(plan)) {
            return res.status(400).json({ error: 'Invalid plan' });
        }

        const { PLAN_LIMITS } = require('../middleware/plan.middleware');

        await db.run(
            `UPDATE businesses SET plan = ?, plan_limits = ? WHERE id = ?`,
            [plan, JSON.stringify(PLAN_LIMITS[plan]), id]
        );

        res.json({ success: true, message: `Plan updated to ${plan}` });

    } catch (error) {
        console.error('Error updating plan:', error);
        res.status(500).json({ error: 'Failed to update plan' });
    }
});

/**
 * PUT /api/admin/public/businesses/:id/suspend
 * Suspend or activate a business
 */
router.put('/public/businesses/:id/suspend', verifyAdminSecret, async (req, res) => {
    try {
        const { id } = req.params;
        const { suspended } = req.body;

        // First check if suspended column exists, if not add it
        try {
            await db.run(`ALTER TABLE businesses ADD COLUMN suspended INTEGER DEFAULT 0`);
        } catch (e) {
            // Column already exists, ignore
        }

        await db.run(
            `UPDATE businesses SET suspended = ? WHERE id = ?`,
            [suspended ? 1 : 0, id]
        );

        res.json({
            success: true,
            message: suspended ? 'Tienda suspendida' : 'Tienda activada'
        });

    } catch (error) {
        console.error('Error suspending business:', error);
        res.status(500).json({ error: 'Failed to suspend business' });
    }
});

/**
 * DELETE /api/admin/public/businesses/:id
 * Delete a business and all its data completely
 */
router.delete('/public/businesses/:id', verifyAdminSecret, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[ADMIN] Deleting business ID: ${id}`);

        // Delete in order to respect foreign keys
        const steps = [
            { name: 'refund_transactions', query: `DELETE FROM refund_transactions WHERE cancellation_id IN (SELECT id FROM cancellations WHERE business_id = ?)` },
            { name: 'inventory_returns', query: `DELETE FROM inventory_returns WHERE cancellation_id IN (SELECT id FROM cancellations WHERE business_id = ?)` },
            { name: 'cancellations', query: `DELETE FROM cancellations WHERE business_id = ?` },
            { name: 'sale_items', query: `DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE business_id = ?)` },
            { name: 'sales', query: `DELETE FROM sales WHERE business_id = ?` },
            { name: 'stock_movements', query: `DELETE FROM stock_movements WHERE product_id IN (SELECT id FROM products WHERE business_id = ?)` },
            { name: 'products', query: `DELETE FROM products WHERE business_id = ?` },
            { name: 'categories', query: `DELETE FROM categories WHERE business_id = ?` },
            { name: 'cash_sessions', query: `DELETE FROM cash_sessions WHERE business_id = ?` },
            { name: 'pending_subscriptions', query: `DELETE FROM pending_subscriptions WHERE business_id = ?` },
            { name: 'device_sessions', query: `DELETE FROM device_sessions WHERE business_id = ?` },
            { name: 'business_users', query: `DELETE FROM business_users WHERE business_id = ?` },
            { name: 'refresh_tokens', query: `DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE business_id = ?)` },
            { name: 'users', query: `DELETE FROM users WHERE business_id = ?` },
            { name: 'businesses', query: `DELETE FROM businesses WHERE id = ?` }
        ];

        for (const step of steps) {
            try {
                const result = await db.run(step.query, [id]);
                console.log(`[ADMIN] Deleted from ${step.name}: ${result.changes} rows`);
            } catch (stepError) {
                // Some tables might not exist, that's ok
                console.log(`[ADMIN] Skipping ${step.name}: ${stepError.message}`);
            }
        }

        console.log(`[ADMIN] Business ${id} deleted successfully`);
        res.json({ success: true, message: 'Tienda eliminada completamente' });

    } catch (error) {
        console.error('Error deleting business:', error);
        res.status(500).json({ error: 'Failed to delete business: ' + error.message });
    }
});

/**
 * GET /api/admin/public/businesses/:id
 * Get detailed business info for editing
 */
router.get('/public/businesses/:id', verifyAdminSecret, async (req, res) => {
    try {
        const { id } = req.params;

        const business = await db.query(`
            SELECT b.*, 
                   u.name as owner_name, 
                   u.email as owner_email,
                   (SELECT COUNT(*) FROM products WHERE business_id = b.id) as total_products,
                   (SELECT COUNT(*) FROM products WHERE business_id = b.id AND active = 1) as active_products,
                   (SELECT COUNT(*) FROM users WHERE business_id = b.id) as total_users,
                   (SELECT COUNT(*) FROM users WHERE business_id = b.id AND active = 1) as active_users,
                   (SELECT COUNT(*) FROM sales WHERE business_id = b.id) as total_sales,
                   (SELECT SUM(total) FROM sales WHERE business_id = b.id) as total_revenue,
                   (SELECT COUNT(*) FROM categories WHERE business_id = b.id) as total_categories
            FROM businesses b
            LEFT JOIN users u ON b.owner_id = u.id
            WHERE b.id = ?
        `, [id]);

        if (!business.length) {
            return res.status(404).json({ error: 'Business not found' });
        }

        // Get users list
        const users = await db.query(`
            SELECT id, name, email, role, pin, active, created_at, last_login
            FROM users WHERE business_id = ?
            ORDER BY role, name
        `, [id]);

        // Get categories list
        const categories = await db.query(`
            SELECT id, name, color, icon, active,
                   (SELECT COUNT(*) FROM products WHERE category_id = categories.id) as product_count
            FROM categories WHERE business_id = ?
            ORDER BY name
        `, [id]);

        res.json({
            business: business[0],
            users,
            categories
        });

    } catch (error) {
        console.error('Error getting business details:', error);
        res.status(500).json({ error: 'Failed to get business details' });
    }
});

/**
 * PUT /api/admin/public/businesses/:id
 * Update business details
 */
router.put('/public/businesses/:id', verifyAdminSecret, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, address, phone, plan_limits } = req.body;

        let updateQuery = 'UPDATE businesses SET ';
        const updates = [];
        const params = [];

        if (name) {
            updates.push('name = ?');
            params.push(name);
        }
        if (address !== undefined) {
            updates.push('address = ?');
            params.push(address);
        }
        if (phone !== undefined) {
            updates.push('phone = ?');
            params.push(phone);
        }
        if (plan_limits) {
            updates.push('plan_limits = ?');
            params.push(JSON.stringify(plan_limits));
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updateQuery += updates.join(', ') + ' WHERE id = ?';
        params.push(id);

        await db.run(updateQuery, params);

        res.json({ success: true, message: 'Tienda actualizada' });

    } catch (error) {
        console.error('Error updating business:', error);
        res.status(500).json({ error: 'Failed to update business' });
    }
});

/**
 * PUT /api/admin/public/businesses/:id/users/:userId
 * Update user in a business
 */
router.put('/public/businesses/:id/users/:userId', verifyAdminSecret, async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, email, role, pin, active } = req.body;

        let updateQuery = 'UPDATE users SET ';
        const updates = [];
        const params = [];

        if (name) {
            updates.push('name = ?');
            params.push(name);
        }
        if (email) {
            updates.push('email = ?');
            params.push(email);
        }
        if (role) {
            updates.push('role = ?');
            params.push(role);
        }
        if (pin) {
            updates.push('pin = ?');
            params.push(pin);
        }
        if (active !== undefined) {
            updates.push('active = ?');
            params.push(active ? 1 : 0);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updateQuery += updates.join(', ') + ' WHERE id = ?';
        params.push(userId);

        await db.run(updateQuery, params);

        res.json({ success: true, message: 'Usuario actualizado' });

    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * DELETE /api/admin/public/businesses/:id/users/:userId
 * Delete a user from a business
 */
router.delete('/public/businesses/:id/users/:userId', verifyAdminSecret, async (req, res) => {
    try {
        const { userId } = req.params;

        // Delete refresh tokens first
        await db.run(`DELETE FROM refresh_tokens WHERE user_id = ?`, [userId]);

        // Delete device sessions
        await db.run(`DELETE FROM device_sessions WHERE user_id = ?`, [userId]);

        // Delete user
        await db.run(`DELETE FROM users WHERE id = ?`, [userId]);

        res.json({ success: true, message: 'Usuario eliminado' });

    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

/**
 * POST /api/admin/public/businesses/:id/users
 * Add a new user to a business
 */
router.post('/public/businesses/:id/users', verifyAdminSecret, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, role, pin } = req.body;

        if (!name || !role || !pin) {
            return res.status(400).json({ error: 'Name, role and PIN are required' });
        }

        const bcrypt = require('bcrypt');
        const password = await bcrypt.hash('password123', 10);

        const result = await db.run(`
            INSERT INTO users (business_id, name, email, password, role, pin, active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        `, [id, name, email || null, password, role, pin]);

        res.json({
            success: true,
            message: 'Usuario creado',
            userId: result.lastID
        });

    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

module.exports = router;
