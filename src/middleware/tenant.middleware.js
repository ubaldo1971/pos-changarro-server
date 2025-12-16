const db = require('../db/database');

/**
 * Middleware to ensure tenant isolation
 * All queries are scoped to the current user's business
 */
const requireTenant = async (req, res, next) => {
    try {
        const businessId = req.businessId || req.user?.business_id;

        if (!businessId) {
            return res.status(400).json({
                error: 'Business ID required',
                code: 'NO_BUSINESS_ID'
            });
        }

        // Verify user has access to this business
        if (req.user) {
            const hasAccess = await userHasAccessToBusiness(req.user.id, businessId);
            if (!hasAccess) {
                return res.status(403).json({
                    error: 'Access denied to this business',
                    code: 'BUSINESS_ACCESS_DENIED'
                });
            }
        }

        req.businessId = businessId;
        next();
    } catch (error) {
        console.error('Tenant middleware error:', error);
        res.status(500).json({ error: 'Tenant verification failed' });
    }
};

/**
 * Check if a user has access to a specific business
 */
const userHasAccessToBusiness = async (userId, businessId) => {
    // Check if user belongs to this business directly
    const users = await db.query(
        'SELECT id FROM users WHERE id = ? AND business_id = ? AND active = 1',
        [userId, businessId]
    );

    if (users.length > 0) {
        return true;
    }

    // Check if user has been granted access through business_users table
    const accessGrants = await db.query(
        'SELECT id FROM business_users WHERE user_id = ? AND business_id = ? AND active = 1',
        [userId, businessId]
    );

    return accessGrants.length > 0;
};

/**
 * Get all businesses a user has access to
 */
const getUserBusinesses = async (userId) => {
    // Get primary business (where user was created)
    const primaryBusiness = await db.query(
        `SELECT b.id, b.name, b.slug, b.logo, b.plan, 'primary' as access_type
         FROM businesses b 
         JOIN users u ON u.business_id = b.id 
         WHERE u.id = ?`,
        [userId]
    );

    // Get additional businesses (granted access)
    const grantedBusinesses = await db.query(
        `SELECT b.id, b.name, b.slug, b.logo, b.plan, bu.role as access_type
         FROM businesses b 
         JOIN business_users bu ON bu.business_id = b.id 
         WHERE bu.user_id = ? AND bu.active = 1`,
        [userId]
    );

    return [...primaryBusiness, ...grantedBusinesses];
};

/**
 * Middleware to allow switching between businesses
 */
const allowBusinessSwitch = async (req, res, next) => {
    try {
        // Check for business_id in header or query
        const requestedBusinessId = req.headers['x-business-id'] || req.query.business_id;

        if (requestedBusinessId && req.user) {
            const hasAccess = await userHasAccessToBusiness(req.user.id, requestedBusinessId);
            if (hasAccess) {
                req.businessId = parseInt(requestedBusinessId);
            }
        }

        next();
    } catch (error) {
        console.error('Business switch error:', error);
        next();
    }
};

/**
 * Grant user access to a business
 */
const grantBusinessAccess = async (userId, businessId, role = 'member') => {
    // Check if access already exists
    const existing = await db.query(
        'SELECT id, active FROM business_users WHERE user_id = ? AND business_id = ?',
        [userId, businessId]
    );

    if (existing.length > 0) {
        if (existing[0].active) {
            return { success: false, error: 'User already has access' };
        }
        // Reactivate access
        await db.run(
            'UPDATE business_users SET active = 1, role = ? WHERE id = ?',
            [role, existing[0].id]
        );
        return { success: true, reactivated: true };
    }

    // Grant new access
    await db.run(
        'INSERT INTO business_users (user_id, business_id, role) VALUES (?, ?, ?)',
        [userId, businessId, role]
    );

    return { success: true };
};

/**
 * Revoke user access to a business
 */
const revokeBusinessAccess = async (userId, businessId) => {
    await db.run(
        'UPDATE business_users SET active = 0 WHERE user_id = ? AND business_id = ?',
        [userId, businessId]
    );
    return { success: true };
};

module.exports = {
    requireTenant,
    userHasAccessToBusiness,
    getUserBusinesses,
    allowBusinessSwitch,
    grantBusinessAccess,
    revokeBusinessAccess
};
