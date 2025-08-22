const { supabase } = require('../config/supabase');

/**
 * Enhanced authentication middleware that verifies Supabase JWT tokens
 * Provides detailed error handling and user context
 */
const requireAuth = async(req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // Check if authorization header exists
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                error: 'AuthenticationError',
                message: 'Authorization header is required',
                code: 'MISSING_AUTH_HEADER'
            });
        }

        // Check if header has correct format
        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'AuthenticationError',
                message: 'Authorization header must start with Bearer',
                code: 'INVALID_AUTH_FORMAT'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify the JWT token with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error) {
            console.error('Token verification error:', error);

            // Handle specific Supabase auth errors
            if (error.message.includes('JWT expired')) {
                return res.status(401).json({
                    success: false,
                    error: 'AuthenticationError',
                    message: 'Token has expired',
                    code: 'TOKEN_EXPIRED'
                });
            }

            if (error.message.includes('Invalid JWT')) {
                return res.status(401).json({
                    success: false,
                    error: 'AuthenticationError',
                    message: 'Invalid token',
                    code: 'INVALID_TOKEN'
                });
            }

            return res.status(401).json({
                success: false,
                error: 'AuthenticationError',
                message: 'Token verification failed',
                code: 'TOKEN_VERIFICATION_FAILED'
            });
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'AuthenticationError',
                message: 'No user found for this token',
                code: 'NO_USER_FOUND'
            });
        }

        // Check if user is confirmed (email verified)
        if (!user.email_confirmed_at) {
            return res.status(403).json({
                success: false,
                error: 'AuthorizationError',
                message: 'Email not verified. Please verify your email address.',
                code: 'EMAIL_NOT_VERIFIED'
            });
        }

        // Attach user information to request object
        req.user = {
            id: user.id,
            email: user.email,
            role: user.user_metadata ? .role || 'guest',
            emailVerified: !!user.email_confirmed_at,
            createdAt: user.created_at,
            lastSignInAt: user.last_sign_in_at
        };

        // Also attach the token for potential use in other middleware/routes
        req.token = token;

        // Log successful authentication (optional, for debugging)
        console.log(`User authenticated: ${user.email} (${user.id})`);

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            error: 'AuthenticationError',
            message: 'Internal server error during authentication',
            code: 'INTERNAL_AUTH_ERROR'
        });
    }
};

/**
 * Optional authentication middleware - doesn't fail if no token provided
 * Useful for routes that can work with or without authentication
 */
const optionalAuth = async(req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No token provided, continue without user info
            req.user = null;
            req.token = null;
            return next();
        }

        const token = authHeader.substring(7);

        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            // Invalid token, continue without user info
            req.user = null;
            req.token = null;
            return next();
        }

        // Attach user information if token is valid
        req.user = {
            id: user.id,
            email: user.email,
            role: user.user_metadata ? .role || 'guest',
            emailVerified: !!user.email_confirmed_at,
            createdAt: user.created_at,
            lastSignInAt: user.last_sign_in_at
        };

        req.token = token;
        next();
    } catch (error) {
        console.error('Optional auth middleware error:', error);
        // Continue without user info on error
        req.user = null;
        req.token = null;
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
                success: false,
                error: 'AuthenticationError',
                message: 'Authentication required',
                code: 'AUTHENTICATION_REQUIRED'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'AuthorizationError',
                message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
                code: 'INSUFFICIENT_PERMISSIONS',
                requiredRoles: allowedRoles,
                userRole: req.user.role
            });
        }

        next();
    };
};

/**
 * Check if user owns the resource or has admin role
 * @param {Function} getResourceUserId - Function to get the user ID from the resource
 */
const requireOwnership = (getResourceUserId) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'AuthenticationError',
                message: 'Authentication required',
                code: 'AUTHENTICATION_REQUIRED'
            });
        }

        const resourceUserId = getResourceUserId(req);

        // Allow if user owns the resource or is admin
        if (req.user.id === resourceUserId || req.user.role === 'admin') {
            return next();
        }

        return res.status(403).json({
            success: false,
            error: 'AuthorizationError',
            message: 'Access denied. You can only access your own resources.',
            code: 'RESOURCE_OWNERSHIP_REQUIRED'
        });
    };
};

module.exports = {
    requireAuth,
    optionalAuth,
    requireRole,
    requireOwnership
};