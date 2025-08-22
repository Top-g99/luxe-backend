const { supabase } = require('../config/supabase');

/**
 * Middleware to verify Supabase JWT token
 * Extracts user information and attaches it to req.user
 */
const authMiddleware = async(req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Authorization header missing or invalid',
                message: 'Please provide a valid Bearer token'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify the JWT token with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({
                error: 'Invalid or expired token',
                message: 'Please log in again'
            });
        }

        // Attach user information to request object
        req.user = {
            id: user.id,
            email: user.email,
            role: user.user_metadata ? .role || 'guest' // Default to guest if role not set
        };

        // Also attach the token for potential use in other middleware/routes
        req.token = token;

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            error: 'Authentication error',
            message: 'Internal server error during authentication'
        });
    }
};

/**
 * Optional auth middleware - doesn't fail if no token provided
 * Useful for routes that can work with or without authentication
 */
const optionalAuth = async(req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No token provided, continue without user info
            req.user = null;
            return next();
        }

        const token = authHeader.substring(7);

        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            // Invalid token, continue without user info
            req.user = null;
            return next();
        }

        req.user = {
            id: user.id,
            email: user.email,
            role: user.user_metadata ? .role || 'guest'
        };

        req.token = token;
        next();
    } catch (error) {
        console.error('Optional auth middleware error:', error);
        // Continue without user info on error
        req.user = null;
        next();
    }
};

/**
 * Role-based authorization middleware
 * @param {string[]} allowedRoles - Array of roles that can access the route
 */
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Please log in to access this resource'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                message: `This resource requires one of the following roles: ${allowedRoles.join(', ')}`
            });
        }

        next();
    };
};

module.exports = {
    authMiddleware,
    optionalAuth,
    requireRole
};