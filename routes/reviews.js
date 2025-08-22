const express = require('express');
const { z } = require('zod');
const { db } = require('../config/supabase');
const { createReviewSchema, paginationSchema } = require('../validation/schemas');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/reviews/property/:propertyId
 * Get all reviews for a specific property
 */
router.get('/property/:propertyId', async(req, res, next) => {
    try {
        const { propertyId } = req.params;
        const validatedQuery = paginationSchema.parse(req.query);
        const { page, limit } = validatedQuery;

        const { data: reviews, error, count } = await db.supabase
            .from('reviews')
            .select(`
                *,
                bookings!reviews_booking_id_fkey (
                    guest_id,
                    profiles!bookings_guest_id_fkey (
                        first_name,
                        last_name,
                        avatar_url
                    )
                )
            `)
            .eq('bookings.property_id', propertyId)
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
 * POST /api/reviews
 * Create a new review for a completed booking
 */
router.post('/', authMiddleware, async(req, res, next) => {
    try {
        const validatedData = createReviewSchema.parse(req.body);

        // Verify the booking belongs to the current user and is completed
        const { data: booking, error: bookingError } = await db.supabase
            .from('bookings')
            .select('id, status, guest_id, property_id')
            .eq('id', validatedData.bookingId)
            .eq('guest_id', req.user.id)
            .eq('status', 'confirmed')
            .single();

        if (bookingError || !booking) {
            return res.status(404).json({
                success: false,
                error: 'NotFoundError',
                message: 'Booking not found or not eligible for review'
            });
        }

        // Check if user has already reviewed this booking
        const { data: existingReview, error: reviewCheckError } = await db.supabase
            .from('reviews')
            .select('id')
            .eq('booking_id', validatedData.bookingId)
            .single();

        if (reviewCheckError && reviewCheckError.code !== 'PGRST116') {
            throw reviewCheckError;
        }

        if (existingReview) {
            return res.status(400).json({
                success: false,
                error: 'DuplicateReviewError',
                message: 'You have already reviewed this booking'
            });
        }

        // Create the review
        const { data: review, error: createError } = await db.supabase
            .from('reviews')
            .insert({
                booking_id: validatedData.bookingId,
                rating: validatedData.rating,
                comment: validatedData.comment
            })
            .select()
            .single();

        if (createError) throw createError;

        // Award loyalty jewels for leaving a review
        const jewelsEarned = Math.floor(validatedData.rating * 2); // 2 jewels per star
        await db.supabase
            .from('loyalty_transactions')
            .insert({
                user_id: req.user.id,
                jewels_earned: jewelsEarned,
                reason: 'review',
                booking_id: validatedData.bookingId
            });

        res.status(201).json({
            success: true,
            data: review,
            message: 'Review created successfully',
            loyaltyReward: {
                jewelsEarned,
                reason: 'Thank you for leaving a review!'
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Invalid review data',
                details: error.errors
            });
        }
        next(error);
    }
});

/**
 * PUT /api/reviews/:id
 * Update an existing review
 */
router.put('/:id', authMiddleware, async(req, res, next) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;

        // Validate input
        if (rating && (rating < 1 || rating > 5)) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Rating must be between 1 and 5'
            });
        }

        if (comment && (comment.length < 10 || comment.length > 1000)) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Comment must be between 10 and 1000 characters'
            });
        }

        // Verify the review belongs to the current user
        const { data: existingReview, error: fetchError } = await db.supabase
            .from('reviews')
            .select(`
                *,
                bookings!reviews_booking_id_fkey (
                    guest_id
                )
            `)
            .eq('id', id)
            .single();

        if (fetchError || !existingReview) {
            return res.status(404).json({
                success: false,
                error: 'NotFoundError',
                message: 'Review not found'
            });
        }

        if (existingReview.bookings.guest_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'ForbiddenError',
                message: 'You can only edit your own reviews'
            });
        }

        // Update the review
        const updateData = {};
        if (rating !== undefined) updateData.rating = rating;
        if (comment !== undefined) updateData.comment = comment;

        const { data: updatedReview, error: updateError } = await db.supabase
            .from('reviews')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        res.json({
            success: true,
            data: updatedReview,
            message: 'Review updated successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/reviews/:id
 * Delete a review
 */
router.delete('/:id', authMiddleware, async(req, res, next) => {
    try {
        const { id } = req.params;

        // Verify the review belongs to the current user
        const { data: existingReview, error: fetchError } = await db.supabase
            .from('reviews')
            .select(`
                *,
                bookings!reviews_booking_id_fkey (
                    guest_id
                )
            `)
            .eq('id', id)
            .single();

        if (fetchError || !existingReview) {
            return res.status(404).json({
                success: false,
                error: 'NotFoundError',
                message: 'Review not found'
            });
        }

        if (existingReview.bookings.guest_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'ForbiddenError',
                message: 'You can only delete your own reviews'
            });
        }

        // Delete the review
        const { error: deleteError } = await db.supabase
            .from('reviews')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        res.json({
            success: true,
            message: 'Review deleted successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/reviews/admin/all
 * Get all reviews (admin only)
 */
router.get('/admin/all', authMiddleware, requireRole(['admin']), async(req, res, next) => {
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
                        title
                    ),
                    profiles!bookings_guest_id_fkey (
                        first_name,
                        last_name,
                        email
                    )
                )
            `)
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
 * GET /api/reviews/stats
 * Get review statistics for properties
 */
router.get('/stats', async(req, res, next) => {
    try {
        const { data: stats, error } = await db.supabase
            .from('reviews')
            .select(`
                rating,
                bookings!reviews_booking_id_fkey (
                    properties (
                        id
                    )
                )
            `);

        if (error) throw error;

        // Calculate statistics
        const totalReviews = stats.length;
        const averageRating = totalReviews > 0 ?
            stats.reduce((sum, review) => sum + review.rating, 0) / totalReviews :
            0;

        const ratingDistribution = {
            1: stats.filter(r => r.rating === 1).length,
            2: stats.filter(r => r.rating === 2).length,
            3: stats.filter(r => r.rating === 3).length,
            4: stats.filter(r => r.rating === 4).length,
            5: stats.filter(r => r.rating === 5).length
        };

        res.json({
            success: true,
            data: {
                totalReviews,
                averageRating: Math.round(averageRating * 10) / 10,
                ratingDistribution
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;