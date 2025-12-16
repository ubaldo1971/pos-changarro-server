const db = require('../db/database');

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
 * Get plan limits for a business
 */
async function getPlanLimits(businessId) {
    const businesses = await db.query(
        'SELECT plan, plan_limits FROM businesses WHERE id = ?',
        [businessId]
    );

    if (businesses.length === 0) {
        return PLAN_LIMITS.free;
    }

    const business = businesses[0];

    if (business.plan_limits) {
        try {
            return JSON.parse(business.plan_limits);
        } catch (e) {
            return PLAN_LIMITS[business.plan] || PLAN_LIMITS.free;
        }
    }

    return PLAN_LIMITS[business.plan] || PLAN_LIMITS.free;
}

/**
 * Get current usage for a business
 */
async function getCurrentUsage(businessId) {
    const productCount = await db.query(
        'SELECT COUNT(*) as count FROM products WHERE business_id = ? AND active = 1',
        [businessId]
    );

    const userCount = await db.query(
        'SELECT COUNT(*) as count FROM users WHERE business_id = ? AND active = 1',
        [businessId]
    );

    return {
        products: productCount[0]?.count || 0,
        users: userCount[0]?.count || 0
    };
}

/**
 * Middleware to check product limit
 */
const checkProductLimit = async (req, res, next) => {
    try {
        const businessId = req.businessId || req.body.business_id;

        if (!businessId) {
            return next();
        }

        const limits = await getPlanLimits(businessId);
        const usage = await getCurrentUsage(businessId);

        // -1 means unlimited
        if (limits.maxProducts !== -1 && usage.products >= limits.maxProducts) {
            return res.status(403).json({
                error: 'Product limit reached',
                code: 'PRODUCT_LIMIT_REACHED',
                limit: limits.maxProducts,
                current: usage.products,
                plan: limits.plan || 'free',
                upgrade: true
            });
        }

        // Attach limits and usage to request for use in routes
        req.planLimits = limits;
        req.planUsage = usage;

        next();
    } catch (error) {
        console.error('Plan check error:', error);
        next();
    }
};

/**
 * Middleware to check user limit
 */
const checkUserLimit = async (req, res, next) => {
    try {
        const businessId = req.businessId || req.body.business_id;

        if (!businessId) {
            return next();
        }

        const limits = await getPlanLimits(businessId);
        const usage = await getCurrentUsage(businessId);

        if (limits.maxUsers !== -1 && usage.users >= limits.maxUsers) {
            return res.status(403).json({
                error: 'User limit reached',
                code: 'USER_LIMIT_REACHED',
                limit: limits.maxUsers,
                current: usage.users,
                plan: limits.plan || 'free',
                upgrade: true
            });
        }

        req.planLimits = limits;
        req.planUsage = usage;

        next();
    } catch (error) {
        console.error('Plan check error:', error);
        next();
    }
};

/**
 * Middleware to check CSV import permission
 */
const checkCSVImport = async (req, res, next) => {
    try {
        const businessId = req.businessId || req.body.business_id;

        if (!businessId) {
            return next();
        }

        const limits = await getPlanLimits(businessId);

        if (!limits.canImportCSV) {
            return res.status(403).json({
                error: 'CSV import not available in your plan',
                code: 'FEATURE_NOT_AVAILABLE',
                feature: 'csv_import',
                plan: limits.plan || 'free',
                upgrade: true
            });
        }

        req.planLimits = limits;
        next();
    } catch (error) {
        console.error('Plan check error:', error);
        next();
    }
};

/**
 * Middleware to check if feature is available
 */
const checkFeature = (featureName) => {
    return async (req, res, next) => {
        try {
            const businessId = req.businessId || req.body.business_id;

            if (!businessId) {
                return next();
            }

            const limits = await getPlanLimits(businessId);

            if (!limits.features || !limits.features.includes(featureName)) {
                return res.status(403).json({
                    error: `Feature '${featureName}' not available in your plan`,
                    code: 'FEATURE_NOT_AVAILABLE',
                    feature: featureName,
                    plan: limits.plan || 'free',
                    upgrade: true
                });
            }

            req.planLimits = limits;
            next();
        } catch (error) {
            console.error('Plan check error:', error);
            next();
        }
    };
};

module.exports = {
    PLAN_LIMITS,
    getPlanLimits,
    getCurrentUsage,
    checkProductLimit,
    checkUserLimit,
    checkCSVImport,
    checkFeature
};
