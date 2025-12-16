const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { verifyToken, requireRole } = require('../middleware/auth.middleware');
const { checkUserLimit } = require('../middleware/plan.middleware');
const db = require('../db/database');

/**
 * POST /api/users
 * Create a new user (requires admin/owner role)
 */
router.post('/', verifyToken, requireRole(['owner', 'admin']), checkUserLimit, async (req, res) => {
    try {
        const { name, email, password, role, pin, phone, avatar, avatar_type } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({
                error: 'Name, email, password and role are required'
            });
        }

        // Validate role
        const validRoles = ['owner', 'admin', 'cashier'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({
                error: 'Invalid role. Must be: owner, admin, or cashier'
            });
        }

        // Check if email already exists
        const existingUser = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({
                error: 'Email already registered',
                code: 'EMAIL_EXISTS'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const result = await db.run(
            `INSERT INTO users (business_id, name, email, password, role, pin, phone, avatar, avatar_type, active) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [req.user.business_id, name, email, hashedPassword, role, pin || null, phone || null, avatar || null, avatar_type || 'initials']
        );

        res.status(201).json({
            success: true,
            user: {
                id: result.lastID,
                name,
                email,
                role,
                business_id: req.user.business_id
            }
        });

    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

/**
 * GET /api/users/:id
 * Get user details
 */
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        const users = await db.query(
            `SELECT id, business_id, name, email, role, pin, phone, avatar, avatar_type, 
                    active, last_login, created_at
             FROM users 
             WHERE id = ? AND business_id = ?`,
            [id, req.user.business_id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: users[0] });

    } catch (error) {
        console.error('Error getting user:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

/**
 * PUT /api/users/:id
 * Update user details
 */
router.put('/:id', verifyToken, requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, role, pin, phone, avatar, avatar_type, active } = req.body;

        // Check if user exists and belongs to same business
        const users = await db.query(
            'SELECT id, role FROM users WHERE id = ? AND business_id = ?',
            [id, req.user.business_id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Can't demote yourself from owner
        if (parseInt(id) === req.user.id && users[0].role === 'owner' && role !== 'owner') {
            return res.status(400).json({
                error: 'Cannot change your own owner role',
                code: 'CANNOT_DEMOTE_SELF'
            });
        }

        // If changing email, check it's not taken
        if (email) {
            const existingEmail = await db.query(
                'SELECT id FROM users WHERE email = ? AND id != ?',
                [email, id]
            );
            if (existingEmail.length > 0) {
                return res.status(400).json({
                    error: 'Email already in use',
                    code: 'EMAIL_EXISTS'
                });
            }
        }

        // Update user
        await db.run(
            `UPDATE users SET 
                name = COALESCE(?, name),
                email = COALESCE(?, email),
                role = COALESCE(?, role),
                pin = COALESCE(?, pin),
                phone = COALESCE(?, phone),
                avatar = COALESCE(?, avatar),
                avatar_type = COALESCE(?, avatar_type),
                active = COALESCE(?, active)
             WHERE id = ?`,
            [name, email, role, pin, phone, avatar, avatar_type, active, id]
        );

        res.json({ success: true });

    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * DELETE /api/users/:id
 * Deactivate user (soft delete)
 */
router.delete('/:id', verifyToken, requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;

        // Can't delete yourself
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({
                error: 'Cannot delete yourself',
                code: 'CANNOT_DELETE_SELF'
            });
        }

        // Check if user exists and belongs to same business
        const users = await db.query(
            'SELECT id FROM users WHERE id = ? AND business_id = ?',
            [id, req.user.business_id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Soft delete (deactivate)
        await db.run('UPDATE users SET active = 0 WHERE id = ?', [id]);

        res.json({ success: true });

    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

/**
 * PUT /api/users/:id/password
 * Update user password
 */
router.put('/:id/password', verifyToken, requireRole(['owner', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body;

        if (!password || password.length < 4) {
            return res.status(400).json({
                error: 'Password must be at least 4 characters'
            });
        }

        // Check if user exists and belongs to same business
        const users = await db.query(
            'SELECT id FROM users WHERE id = ? AND business_id = ?',
            [id, req.user.business_id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update password
        await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);

        res.json({ success: true });

    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ error: 'Failed to update password' });
    }
});

module.exports = router;
