const express = require('express');
const { z } = require('zod');
const { db } = require('../config/supabase');
const { applyCouponSchema, paginationSchema } = require('../validation/schemas');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/coupons
 * Get all active coupons (public)
 */
router.get('/', async(req, res, next) => {
    try {
        const validatedQuery = paginationSchema.parse(req.query);
        const { page, limit } = validatedQuery;

        const { data: coupons, error, count } = await db.supabase
            .from('coupons')
            .select('*')
            .eq('isActive', true)
            .gte('validUntil', new Date().toISOString())
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (error) throw error;

        const totalPages = Math.ceil((count || 0) / limit);

        res.json({
            success: true,
            data: coupons,
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
 * GET /api/coupons/:code
 * Get coupon details by code
 */
router.get('/:code', async(req, res, next) => {
    try {
        const { code } = req.params;

        const { data: coupon, error } = await db.supabase
            .from('coupons')
            .select('*')
            .eq('code', code.toUpperCase())
            .eq('isActive', true)
            .gte('validUntil', new Date().toISOString())
            .single();

        if (error || !coupon) {
            return res.status(404).json({
                success: false,
                error: 'NotFoundError',
                message: 'Coupon not found or expired'
            });
        }

        res.json({
            success: true,
            data: coupon
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/coupons/apply
 * Apply a coupon to a booking
 */
router.post('/apply', authMiddleware, async(req, res, next) => {
    try {
        const validatedData = applyCouponSchema.parse(req.body);

        // Get coupon details
        const { data: coupon, error: couponError } = await db.supabase
            .from('coupons')
            .select('*')
            .eq('code', validatedData.code.toUpperCase())
            .eq('isActive', true)
            .gte('validUntil', new Date().toISOString())
            .single();

        if (couponError || !coupon) {
            return res.status(404).json({
                success: false,
                error: 'NotFoundError',
                message: 'Coupon not found or expired'
            });
        }

        // Get booking details
        const { data: booking, error: bookingError } = await db.supabase
            .from('bookings')
            .select('*')
            .eq('id', validatedData.bookingId)
            .eq('guest_id', req.user.id)
            .eq('status', 'pending')
            .single();

        if (bookingError || !booking) {
            return res.status(404).json({
                success: false,
                error: 'NotFoundError',
                message: 'Booking not found or not eligible for coupon'
            });
        }

        // Check if coupon has usage limits
        if (coupon.maxUses && coupon.totalUses >= coupon.maxUses) {
            return res.status(400).json({
                success: false,
                error: 'CouponExhaustedError',
                message: 'Coupon usage limit reached'
            });
        }

        // Check if user has already used this coupon
        const { data: existingRedemption, error: redemptionCheckError } = await db.supabase
            .from('coupon_redemptions')
            .select('id')
            .eq('coupon_id', coupon.id)
            .eq('user_id', req.user.id)
            .single();

        if (redemptionCheckError && redemptionCheckError.code !== 'PGRST116') {
            throw redemptionCheckError;
        }

        if (existingRedemption) {
            return res.status(400).json({
                success: false,
                error: 'DuplicateCouponError',
                message: 'You have already used this coupon'
            });
        }

        // Check minimum booking value
        if (coupon.minBookingValue && booking.totalPriceInCents < coupon.minBookingValue) {
            return res.status(400).json({
                success: false,
                error: 'MinimumValueError',
                message: `Minimum booking value required: $${(coupon.minBookingValue / 100).toFixed(2)}`
            });
        }

        // Calculate discount amount
        let discountAmount = 0;
        if (coupon.couponType === 'percentage') {
            discountAmount = Math.round(booking.totalPriceInCents * (coupon.discountValue / 100));
        } else {
            discountAmount = Math.round(coupon.discountValue * 100); // Convert to cents
        }

        // Ensure discount doesn't exceed booking total
        discountAmount = Math.min(discountAmount, booking.totalPriceInCents);

        // Create coupon redemption
        const { data: redemption, error: redemptionError } = await db.supabase
            .from('coupon_redemptions')
            .insert({
                user_id: req.user.id,
                coupon_id: coupon.id,
                discount_amount: discountAmount
            })
            .select()
            .single();

        if (redemptionError) throw redemptionError;

        // Update coupon usage statistics
        await db.supabase
            .from('coupons')
            .update({
                totalUses: (coupon.totalUses || 0) + 1,
                totalDiscount: (coupon.totalDiscount || 0) + discountAmount
            })
            .eq('id', coupon.id);

        // Update booking with discount
        const { data: updatedBooking, error: updateError } = await db.supabase
            .from('bookings')
            .update({
                discountInCents: discountAmount,
                finalPayoutInCents: booking.totalPriceInCents - discountAmount
            })
            .eq('id', booking.id)
            .select()
            .single();

        if (updateError) throw updateError;

        res.json({
            success: true,
            data: {
                coupon: {
                    code: coupon.code,
                    name: coupon.name,
                    discountType: coupon.couponType,
                    discountValue: coupon.discountValue
                },
                discountApplied: discountAmount,
                newTotal: updatedBooking.finalPayoutInCents,
                savings: `$${(discountAmount / 100).toFixed(2)}`
            },
            message: 'Coupon applied successfully'
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Invalid coupon data',
                details: error.errors
            });
        }
        next(error);
    }
});

/**
 * POST /api/coupons
 * Create a new coupon (admin only)
 */
router.post('/', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        const { code, name, description, couponType, discountValue, scope, validFrom, validUntil, maxUses, maxUsesPerUser, minBookingValue, applicableVillas } = req.body;

        // Validate required fields
        if (!code || !name || !couponType || !discountValue || !scope || !validFrom || !validUntil) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Missing required fields'
            });
        }

        // Check if coupon code already exists
        const { data: existingCoupon, error: checkError } = await db.supabase
            .from('coupons')
            .select('id')
            .eq('code', code.toUpperCase())
            .single();

        if (checkError && checkError.code !== 'PGRST116') {
            throw checkError;
        }

        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                error: 'DuplicateCouponError',
                message: 'Coupon code already exists'
            });
        }

        // Create coupon
        const { data: coupon, error: createError } = await db.supabase
            .from('coupons')
            .insert({
                code: code.toUpperCase(),
                name,
                description,
                couponType,
                discountValue,
                scope,
                validFrom: new Date(validFrom).toISOString(),
                validUntil: new Date(validUntil).toISOString(),
                maxUses,
                maxUsesPerUser: maxUsesPerUser || 1,
                minBookingValue: minBookingValue ? Math.round(minBookingValue * 100) : null,
                applicableVillas: applicableVillas ? JSON.stringify(applicableVillas) : null
            })
            .select()
            .single();

        if (createError) throw createError;

        res.status(201).json({
            success: true,
            data: coupon,
            message: 'Coupon created successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/coupons/:id
 * Update coupon (admin only)
 */
router.put('/:id', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Validate coupon exists
        const { data: existingCoupon, error: fetchError } = await db.supabase
            .from('coupons')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !existingCoupon) {
            return res.status(404).json({
                success: false,
                error: 'NotFoundError',
                message: 'Coupon not found'
            });
        }

        // Update coupon
        const { data: updatedCoupon, error: updateError } = await db.supabase
            .from('coupons')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        res.json({
            success: true,
            data: updatedCoupon,
            message: 'Coupon updated successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/coupons/:id
 * Delete coupon (admin only)
 */
router.delete('/:id', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        const { id } = req.params;

        const { error: deleteError } = await db.supabase
            .from('coupons')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        res.json({
            success: true,
            message: 'Coupon deleted successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/coupons/admin/all
 * Get all coupons with statistics (admin only)
 */
router.get('/admin/all', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        const validatedQuery = paginationSchema.parse(req.query);
        const { page, limit } = validatedQuery;

        const { data: coupons, error, count } = await db.supabase
            .from('coupons')
            .select('*')
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (error) throw error;

        const totalPages = Math.ceil((count || 0) / limit);

        res.json({
            success: true,
            data: coupons,
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
 * GET /api/coupons/stats
 * Get coupon usage statistics (admin only)
 */
router.get('/admin/stats', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        const { data: coupons, error } = await db.supabase
            .from('coupons')
            .select('*');

        if (error) throw error;

        const totalCoupons = coupons.length;
        const activeCoupons = coupons.filter(c => c.isActive && new Date(c.validUntil) > new Date()).length;
        const totalDiscountGiven = coupons.reduce((sum, c) => sum + (c.totalDiscount || 0), 0);
        const totalUses = coupons.reduce((sum, c) => sum + (c.totalUses || 0), 0);

        res.json({
            success: true,
            data: {
                totalCoupons,
                activeCoupons,
                totalDiscountGiven: totalDiscountGiven / 100, // Convert to dollars
                totalUses,
                averageDiscountPerUse: totalUses > 0 ? (totalDiscountGiven / totalUses) / 100 : 0
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;