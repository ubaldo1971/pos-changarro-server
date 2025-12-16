const jwt = require('jsonwebtoken');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'pos-changarro-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Middleware to verify JWT token
 */
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'No token provided',
                code: 'NO_TOKEN'
            });
        }

        const token = authHeader.split(' ')[1];

        const decoded = jwt.verify(token, JWT_SECRET);

        // Get user from database to ensure they still exist and are active
        const users = await db.query(
            'SELECT u.*, b.name as business_name, b.plan, b.plan_limits, b.suspended FROM users u LEFT JOIN businesses b ON u.business_id = b.id WHERE u.id = ? AND u.active = 1',
            [decoded.userId]
        );

        if (users.length === 0) {
            return res.status(401).json({
                error: 'User not found or inactive',
                code: 'USER_NOT_FOUND'
            });
        }

        // Check if business is suspended
        if (users[0].suspended) {
            return res.status(403).json({
                error: 'Tu tienda ha sido suspendida. Contacta al administrador.',
                code: 'BUSINESS_SUSPENDED'
            });
        }

        // Attach user to request
        req.user = users[0];
        req.businessId = decoded.businessId;

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }

        console.error('Auth middleware error:', error);
        return res.status(500).json({ error: 'Authentication error' });
    }
};

/**
 * Middleware to check user role
 * @param {string[]} allowedRoles - Array of allowed roles
 */
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                code: 'FORBIDDEN',
                required: allowedRoles,
                current: req.user.role
            });
        }

        next();
    };
};

/**
 * Optional auth - doesn't fail if no token, just sets req.user if valid
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const users = await db.query(
            'SELECT u.*, b.name as business_name, b.plan FROM users u LEFT JOIN businesses b ON u.business_id = b.id WHERE u.id = ? AND u.active = 1',
            [decoded.userId]
        );

        if (users.length > 0) {
            req.user = users[0];
            req.businessId = decoded.businessId;
        }

        next();
    } catch (error) {
        // Token invalid or expired, just continue without user
        next();
    }
};

/**
 * Generate JWT tokens
 */
const generateTokens = (user) => {
    const accessToken = jwt.sign(
        {
            userId: user.id,
            businessId: user.business_id,
            role: user.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
        {
            userId: user.id,
            type: 'refresh'
        },
        JWT_SECRET,
        { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );

    return { accessToken, refreshToken };
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.type !== 'refresh') {
            throw new Error('Invalid token type');
        }
        return decoded;
    } catch (error) {
        return null;
    }
};

module.exports = {
    verifyToken,
    requireRole,
    optionalAuth,
    generateTokens,
    verifyRefreshToken,
    JWT_SECRET
};
