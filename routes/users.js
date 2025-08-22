const express = require('express');
const { z } = require('zod');
const { db } = require('../config/supabase');
const { updateProfileSchema, paginationSchema } = require('../validation/schemas');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/users/profile
 * Get current user's profile
 */
router.get('/profile', authMiddleware, async(req, res, next) => {
    try {
        const { data: profile, error } = await db.supabase
            .from('profiles')
            .select('*')
            .eq('user_id', req.user.id)
            .single();

        if (error) throw error;

        res.json({
            success: true,
            data: profile
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/users/profile
 * Update current user's profile
 */
router.put('/profile', authMiddleware, async(req, res, next) => {
    try {
        const validatedData = updateProfileSchema.parse(req.body);

        const { data, error } = await db.supabase
            .from('profiles')
            .upsert({
                user_id: req.user.id,
                ...validatedData
            })
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            data,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Invalid profile data',
                details: error.errors
            });
        }
        next(error);
    }
});

/**
 * GET /api/users/bookings
 * Get current user's bookings
 */
router.get('/bookings', authMiddleware, async(req, res, next) => {
    try {
        const validatedQuery = paginationSchema.parse(req.query);
        const { page, limit } = validatedQuery;

        const { data: bookings, error, count } = await db.supabase
            .from('bookings')
            .select(`
                *,
                properties (
                    id,
                    title,
                    location,
                    image_urls,
                    profiles!properties_host_id_fkey (
                        first_name,
                        last_name
                    )
                )
            `)
            .eq('guest_id', req.user.id)
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (error) throw error;

        const totalPages = Math.ceil((count || 0) / limit);

        res.json({
            success: true,
            data: bookings,
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Invalid query parameters',
                details: error.errors
            });
        }
        next(error);
    }
});

/**
 * GET /api/users/host-properties
 * Get properties owned by current user (host only)
 */
router.get('/host-properties', authMiddleware, requireRole(['host', 'admin']), async(req, res, next) => {
    try {
        const validatedQuery = paginationSchema.parse(req.query);
        const { page, limit } = validatedQuery;

        const { data: properties, error, count } = await db.supabase
            .from('properties')
            .select(`
                *,
                bookings (
                    id,
                    status,
                    check_in_date,
                    check_out_date,
                    total_price
                )
            `)
            .eq('host_id', req.user.id)
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (error) throw error;

        const totalPages = Math.ceil((count || 0) / limit);

        res.json({
            success: true,
            data: properties,
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Invalid query parameters',
                details: error.errors
            });
        }
        next(error);
    }
});

/**
 * GET /api/users/loyalty
 * Get current user's loyalty information
 */
router.get('/loyalty', authMiddleware, async(req, res, next) => {
    try {
        const { data: transactions, error } = await db.supabase
            .from('loyalty_transactions')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        // Calculate total jewels
        const totalJewels = transactions.reduce((sum, t) => sum + (t.jewels_earned || 0) - (t.jewels_redeemed || 0), 0);

        res.json({
            success: true,
            data: {
                totalJewels,
                recentTransactions: transactions,
                loyaltyTier: totalJewels >= 1000 ? 'PLATINUM' : totalJewels >= 500 ? 'GOLD' : totalJewels >= 100 ? 'SILVER' : 'BRONZE'
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/users/reviews
 * Get reviews written by current user
 */
router.get('/reviews', authMiddleware, async(req, res, next) => {
    try {
        const validatedQuery = paginationSchema.parse(req.query);
        const { page, limit } = validatedQuery;

        const { data: reviews, error, count } = await db.supabase
            .from('reviews')
            .select(`
                *,
                bookings!reviews_booking_id_fkey (
                    properties (
                        id,
                        title,
                        location
                    )
                )
            `)
            .eq('bookings.guest_id', req.user.id)
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (error) throw error;

        const totalPages = Math.ceil((count || 0) / limit);

        res.json({
            success: true,
            data: reviews,
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Invalid query parameters',
                details: error.errors
            });
        }
        next(error);
    }
});

/**
 * GET /api/users/admin/all
 * Get all users (admin only)
 */
router.get('/admin/all', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        const validatedQuery = paginationSchema.parse(req.query);
        const { page, limit } = validatedQuery;

        const { data: users, error, count } = await db.supabase
            .from('users')
            .select(`
                id,
                email,
                role,
                created_at,
                profiles (
                    first_name,
                    last_name,
                    phone
                )
            `)
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (error) throw error;

        const totalPages = Math.ceil((count || 0) / limit);

        res.json({
            success: true,
            data: users,
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Invalid query parameters',
                details: error.errors
            });
        }
        next(error);
    }
});

/**
 * PUT /api/users/admin/:id/role
 * Update user role (admin only)
 */
router.put('/admin/:id/role', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        if (!['guest', 'host', 'admin'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Invalid role. Must be guest, host, or admin'
            });
        }

        const { data, error } = await db.supabase
            .from('users')
            .update({ role })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            data,
            message: `User role updated to ${role}`
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/users/admin/:id
 * Delete user (admin only)
 */
router.delete('/admin/:id', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        const { id } = req.params;

        const { error } = await db.supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;