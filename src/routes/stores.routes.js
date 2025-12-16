const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth.middleware');
const { getUserBusinesses, grantBusinessAccess, revokeBusinessAccess } = require('../middleware/tenant.middleware');
const db = require('../db/database');

/**
 * GET /api/stores
 * Get all stores the current user has access to
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const businesses = await getUserBusinesses(req.user.id);

        res.json({
            stores: businesses,
            current: req.user.business_id
        });

    } catch (error) {
        console.error('Error getting stores:', error);
        res.status(500).json({ error: 'Failed to get stores' });
    }
});

/**
 * POST /api/stores/switch
 * Switch to a different store
 */
router.post('/switch', verifyToken, async (req, res) => {
    try {
        const { businessId } = req.body;

        if (!businessId) {
            return res.status(400).json({ error: 'Business ID required' });
        }

        // Verify user has access to this business
        const businesses = await getUserBusinesses(req.user.id);
        const hasAccess = businesses.some(b => b.id === parseInt(businessId));

        if (!hasAccess) {
            return res.status(403).json({
                error: 'Access denied to this store',
                code: 'ACCESS_DENIED'
            });
        }

        // Get business details
        const business = businesses.find(b => b.id === parseInt(businessId));

        res.json({
            success: true,
            business: {
                id: business.id,
                name: business.name,
                slug: business.slug,
                plan: business.plan,
                logo: business.logo
            }
        });

    } catch (error) {
        console.error('Error switching store:', error);
        res.status(500).json({ error: 'Failed to switch store' });
    }
});

/**
 * GET /api/stores/:id
 * Get store details
 */
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Verify user has access
        const businesses = await getUserBusinesses(req.user.id);
        const business = businesses.find(b => b.id === parseInt(id));

        if (!business) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get full details
        const details = await db.query(
            `SELECT b.*, 
                    (SELECT COUNT(*) FROM products WHERE business_id = b.id AND active = 1) as product_count,
                    (SELECT COUNT(*) FROM users WHERE business_id = b.id AND active = 1) as user_count,
                    (SELECT COUNT(*) FROM sales WHERE business_id = b.id) as sale_count
             FROM businesses b WHERE b.id = ?`,
            [id]
        );

        if (details.length === 0) {
            return res.status(404).json({ error: 'Store not found' });
        }

        res.json({ store: details[0] });

    } catch (error) {
        console.error('Error getting store:', error);
        res.status(500).json({ error: 'Failed to get store' });
    }
});

/**
 * PUT /api/stores/:id
 * Update store settings
 */
router.put('/:id', verifyToken, requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, address, phone, logo, currency, tax_rate, settings } = req.body;

        // Verify ownership
        if (req.user.business_id !== parseInt(id)) {
            return res.status(403).json({ error: 'Can only update your own store' });
        }

        await db.run(
            `UPDATE businesses SET 
                name = COALESCE(?, name),
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                logo = COALESCE(?, logo),
                currency = COALESCE(?, currency),
                tax_rate = COALESCE(?, tax_rate),
                settings = COALESCE(?, settings)
             WHERE id = ?`,
            [name, address, phone, logo, currency, tax_rate,
                settings ? JSON.stringify(settings) : null, id]
        );

        res.json({ success: true });

    } catch (error) {
        console.error('Error updating store:', error);
        res.status(500).json({ error: 'Failed to update store' });
    }
});

/**
 * POST /api/stores/:id/invite
 * Invite a user to the store
 */
router.post('/:id/invite', verifyToken, requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { email, role } = req.body;

        if (!email || !role) {
            return res.status(400).json({ error: 'Email and role required' });
        }

        // Find user by email
        const users = await db.query('SELECT id FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND',
                message: 'El usuario debe registrarse primero'
            });
        }

        // Grant access
        const result = await grantBusinessAccess(users[0].id, parseInt(id), role);

        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        // Update invited_by
        await db.run(
            'UPDATE business_users SET invited_by = ? WHERE user_id = ? AND business_id = ?',
            [req.user.id, users[0].id, id]
        );

        res.json({
            success: true,
            message: 'Usuario invitado exitosamente'
        });

    } catch (error) {
        console.error('Error inviting user:', error);
        res.status(500).json({ error: 'Failed to invite user' });
    }
});

/**
 * DELETE /api/stores/:id/users/:userId
 * Remove a user from the store
 */
router.delete('/:id/users/:userId', verifyToken, requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { id, userId } = req.params;

        // Can't remove yourself
        if (parseInt(userId) === req.user.id) {
            return res.status(400).json({ error: 'Cannot remove yourself' });
        }

        await revokeBusinessAccess(parseInt(userId), parseInt(id));

        res.json({ success: true });

    } catch (error) {
        console.error('Error removing user:', error);
        res.status(500).json({ error: 'Failed to remove user' });
    }
});

/**
 * GET /api/stores/:id/users
 * Get all users with access to the store
 */
router.get('/:id/users', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Get primary users (created in this business)
        const primaryUsers = await db.query(
            `SELECT id, name, email, role, avatar, avatar_type, phone, last_login, 'primary' as access_type
             FROM users WHERE business_id = ? AND active = 1`,
            [id]
        );

        // Get invited users
        const invitedUsers = await db.query(
            `SELECT u.id, u.name, u.email, bu.role, u.avatar, u.avatar_type, u.phone, u.last_login, 'invited' as access_type
             FROM users u
             JOIN business_users bu ON bu.user_id = u.id
             WHERE bu.business_id = ? AND bu.active = 1`,
            [id]
        );

        res.json({
            users: [...primaryUsers, ...invitedUsers]
        });

    } catch (error) {
        console.error('Error getting store users:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

module.exports = router;
