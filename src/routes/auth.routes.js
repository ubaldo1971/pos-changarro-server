const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db/database');
const { generateTokens, verifyRefreshToken, verifyToken } = require('../middleware/auth.middleware');

const router = express.Router();
const SALT_ROUNDS = 10;

// Valid roles for the system
const VALID_ROLES = ['owner', 'admin', 'manager', 'cashier', 'accountant'];

// Plan limits configuration
const PLAN_LIMITS = {
    free: {
        maxProducts: 20,
        maxUsers: 1,
        canImportCSV: false,
        canExportReports: false,
        features: ['basic_pos', 'basic_inventory', 'basic_reports']
    },
    basic: {
        maxProducts: 300,
        maxUsers: 5,
        canImportCSV: true,
        canExportReports: true,
        features: ['basic_pos', 'full_inventory', 'full_reports', 'multi_device']
    },
    pro: {
        maxProducts: -1, // unlimited
        maxUsers: -1, // unlimited
        canImportCSV: true,
        canExportReports: true,
        features: ['basic_pos', 'full_inventory', 'advanced_reports', 'multi_device', 'api_access', 'priority_support']
    }
};

/**
 * POST /api/auth/register
 * Register a new business with owner user
 */
router.post('/register', async (req, res) => {
    try {
        const {
            businessName,
            businessSlug,
            ownerName,
            email,
            password,
            phone,
            pin
        } = req.body;

        // Validation
        if (!businessName || !ownerName || !email || !password) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['businessName', 'ownerName', 'email', 'password']
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if email already exists
        const existingUser = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(409).json({
                error: 'Email already registered',
                code: 'EMAIL_EXISTS'
            });
        }

        // Generate slug if not provided
        const slug = businessSlug || businessName.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

        // Check if slug exists
        const existingBusiness = await db.query('SELECT id FROM businesses WHERE slug = ?', [slug]);
        if (existingBusiness.length > 0) {
            return res.status(409).json({
                error: 'Business name already taken',
                code: 'SLUG_EXISTS'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // Create business
        const businessResult = await db.run(
            `INSERT INTO businesses (name, slug, plan, plan_limits) VALUES (?, ?, ?, ?)`,
            [businessName, slug, 'free', JSON.stringify(PLAN_LIMITS.free)]
        );
        const businessId = businessResult.id;

        // Create owner user
        const userResult = await db.run(
            `INSERT INTO users (business_id, name, email, password, role, pin, phone, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [businessId, ownerName, email, hashedPassword, 'owner', pin || '1234', phone || null, 1]
        );
        const userId = userResult.id;

        // Update business with owner_id
        await db.run('UPDATE businesses SET owner_id = ? WHERE id = ?', [userId, businessId]);

        // Generate tokens
        const user = {
            id: userId,
            business_id: businessId,
            role: 'owner'
        };
        const tokens = generateTokens(user);

        // Store refresh token
        const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        await db.run(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
            [userId, tokens.refreshToken, refreshExpiry.toISOString()]
        );


        // Create Default Cashier (Cajero 1)
        try {
            const hashedCashierPassword = await bcrypt.hash('cajero123', SALT_ROUNDS);
            await db.run(
                `INSERT INTO users (business_id, name, email, password, role, pin, phone, active) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [businessId, 'Cajero 1', `cajero1@${slug}.com`, hashedCashierPassword, 'cashier', '5678', null, 1]
            );
        } catch (e) {
            console.error('Error creating default cashier:', e);
            // Continue anyway
        }

        // Create 2 Test Products
        try {
            const testProducts = [
                { name: 'Producto Prueba 1', price: 10.00, cost: 5.00, stock: 100 },
                { name: 'Producto Prueba 2', price: 20.00, cost: 10.00, stock: 50 }
            ];

            for (const p of testProducts) {
                await db.run(
                    `INSERT INTO products (business_id, name, price, cost, stock, created_at) 
                     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
                    [businessId, p.name, p.price, p.cost, p.stock]
                );
            }
        } catch (e) {
            console.error('Error creating test products:', e);
        }

        res.status(201).json({
            message: 'Registration successful',
            user: {
                id: userId,
                name: ownerName,
                email,
                role: 'owner',
                business_id: businessId,
                business_name: businessName,
                plan: 'free'
            },
            tokens
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed', details: error.message });
    }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // Find user by email
        const users = await db.query(
            `SELECT u.*, b.name as business_name, b.slug as business_slug, b.plan, b.plan_limits 
             FROM users u 
             LEFT JOIN businesses b ON u.business_id = b.id 
             WHERE u.email = ? AND u.active = 1`,
            [email]
        );

        // Check if user exists
        if (users.length === 0) {
            console.log(`[LOGIN FAILED] User not found for email: ${email}`);
            return res.status(401).json({
                error: 'Invalid email or password',
                code: 'INVALID_CREDENTIALS'
            });
        }

        const user = users[0];
        console.log(`[LOGIN DEBUG] Found user: ${user.email} (ID: ${user.id}), Active: ${user.active}`);

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        console.log(`[LOGIN DEBUG] Password match for ${user.email}: ${validPassword}`);

        if (!validPassword) {
            return res.status(401).json({
                error: 'Invalid email or password',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Update last login
        await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

        // Generate tokens
        const tokens = generateTokens(user);

        // Store refresh token
        const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await db.run(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
            [user.id, tokens.refreshToken, refreshExpiry.toISOString()]
        );

        // Remove sensitive data
        delete user.password;
        delete user.pin;

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                avatar_type: user.avatar_type,
                business_id: user.business_id,
                business_name: user.business_name,
                business_slug: user.business_slug,
                plan: user.plan,
                plan_limits: user.plan_limits ? JSON.parse(user.plan_limits) : PLAN_LIMITS.free
            },
            tokens
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /api/auth/pin-login
 * Quick login using PIN (can search across all businesses if businessId is 0 or not provided)
 */
router.post('/pin-login', async (req, res) => {
    try {
        const { businessId, pin, deviceToken } = req.body;

        if (!pin) {
            return res.status(400).json({ error: 'PIN required' });
        }

        let users;

        // If businessId is 0 or not provided, search across all businesses
        if (!businessId || businessId === 0) {
            users = await db.query(
                `SELECT u.*, b.name as business_name, b.plan, b.plan_limits, b.suspended
                 FROM users u 
                 LEFT JOIN businesses b ON u.business_id = b.id 
                 WHERE u.pin = ? AND u.active = 1
                 ORDER BY u.last_login DESC
                 LIMIT 1`,
                [pin]
            );
        } else {
            // Find user by PIN within specific business
            users = await db.query(
                `SELECT u.*, b.name as business_name, b.plan, b.plan_limits, b.suspended
                 FROM users u 
                 LEFT JOIN businesses b ON u.business_id = b.id 
                 WHERE u.business_id = ? AND u.pin = ? AND u.active = 1`,
                [businessId, pin]
            );
        }

        if (users.length === 0) {
            return res.status(401).json({
                error: 'Invalid PIN',
                code: 'INVALID_PIN'
            });
        }

        const user = users[0];

        // Check if business is suspended
        if (user.suspended) {
            return res.status(403).json({
                error: 'Tu tienda ha sido suspendida. Contacta al administrador.',
                code: 'BUSINESS_SUSPENDED'
            });
        }

        // Update last login
        await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

        // Generate tokens
        const tokens = generateTokens(user);

        // Remove sensitive data
        delete user.password;
        delete user.pin;

        res.json({
            message: 'PIN login successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                avatar_type: user.avatar_type,
                business_id: user.business_id,
                business_name: user.business_name,
                plan: user.plan
            },
            tokens
        });

    } catch (error) {
        console.error('PIN login error:', error);
        res.status(500).json({ error: 'PIN login failed' });
    }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token required' });
        }

        // Verify refresh token
        const decoded = verifyRefreshToken(refreshToken);
        if (!decoded) {
            return res.status(401).json({
                error: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }

        // Check if token exists in database and not expired
        const storedTokens = await db.query(
            'SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > datetime("now")',
            [refreshToken]
        );

        if (storedTokens.length === 0) {
            return res.status(401).json({
                error: 'Refresh token expired or revoked',
                code: 'REFRESH_TOKEN_EXPIRED'
            });
        }

        // Get user
        const users = await db.query(
            `SELECT u.*, b.name as business_name, b.plan 
             FROM users u 
             LEFT JOIN businesses b ON u.business_id = b.id 
             WHERE u.id = ? AND u.active = 1`,
            [decoded.userId]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        const user = users[0];

        // Delete old refresh token
        await db.run('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);

        // Generate new tokens
        const tokens = generateTokens(user);

        // Store new refresh token
        const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await db.run(
            'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
            [user.id, tokens.refreshToken, refreshExpiry.toISOString()]
        );

        res.json({ tokens });

    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', verifyToken, async (req, res) => {
    try {
        const user = req.user;

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                avatar_type: user.avatar_type,
                phone: user.phone,
                business_id: user.business_id,
                business_name: user.business_name,
                plan: user.plan,
                plan_limits: user.plan_limits ? JSON.parse(user.plan_limits) : PLAN_LIMITS.free
            }
        });

    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});

/**
 * POST /api/auth/logout
 * Invalidate refresh token
 */
router.post('/logout', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (refreshToken) {
            await db.run('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
        }

        res.json({ message: 'Logged out successfully' });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

/**
 * GET /api/auth/plan-limits
 * Get plan limits configuration
 */
router.get('/plan-limits', (req, res) => {
    res.json({ plans: PLAN_LIMITS });
});



module.exports = router;


