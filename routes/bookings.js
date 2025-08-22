const express = require('express');
const { z } = require('zod');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { db } = require('../config/supabase');
const { createBookingSchema, getUserBookingsQuerySchema } = require('../validation/schemas');
const { requireAuth, requireRole } = require('../middleware/requireAuth');

const router = express.Router();

/**
 * POST /api/bookings
 * Creates a new booking with Stripe payment intent
 * Requires authentication
 */
router.post('/', requireAuth, async(req, res, next) => {
    try {
        // Validate request body
        const validatedData = createBookingSchema.parse(req.body);

        const {
            propertyId,
            checkInDate,
            checkOutDate,
            guestCount,
            specialRequests
        } = validatedData;

        const guestId = req.user.id;

        // 1. Verify property is available for the given dates
        const isAvailable = await db.checkPropertyAvailability(
            propertyId,
            checkInDate,
            checkOutDate
        );

        if (!isAvailable) {
            return res.status(409).json({
                success: false,
                error: 'ConflictError',
                message: 'Property is not available for the selected dates'
            });
        }

        // 2. Get property details for price calculation
        const property = await db.getPropertyForBooking(propertyId);

        if (!property) {
            return res.status(404).json({
                success: false,
                error: 'NotFoundError',
                message: 'Property not found'
            });
        }

        // 3. Calculate total price
        const checkIn = new Date(checkInDate);
        const checkOut = new Date(checkOutDate);
        const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

        const basePrice = property.price_per_night * nights;
        const cleaningFee = property.cleaning_fee || 0;
        const totalPrice = basePrice + cleaningFee;

        // 4. Create Stripe Payment Intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(totalPrice * 100), // Convert to cents
            currency: 'inr', // Indian Rupees
            metadata: {
                propertyId,
                guestId,
                checkInDate,
                checkOutDate,
                nights: nights.toString(),
                guestCount: guestCount.toString()
            },
            automatic_payment_methods: {
                enabled: true,
            },
        });

        // 5. Create booking record in database
        const bookingData = {
            property_id: propertyId,
            guest_id: guestId,
            check_in_date: checkInDate,
            check_out_date: checkOutDate,
            total_price: totalPrice,
            status: 'pending',
            stripe_payment_intent_id: paymentIntent.id,
            guest_count: guestCount,
            special_requests: specialRequests
        };

        const booking = await db.createBooking(bookingData);

        res.status(201).json({
            success: true,
            data: {
                booking: {
                    id: booking.id,
                    propertyId: booking.property_id,
                    checkInDate: booking.check_in_date,
                    checkOutDate: booking.check_out_date,
                    totalPrice: booking.total_price,
                    status: booking.status,
                    guestCount: booking.guest_count,
                    specialRequests: booking.special_requests,
                    createdAt: booking.created_at
                },
                payment: {
                    clientSecret: paymentIntent.client_secret,
                    paymentIntentId: paymentIntent.id,
                    amount: paymentIntent.amount,
                    currency: paymentIntent.currency
                },
                priceBreakdown: {
                    basePrice,
                    cleaningFee,
                    totalPrice,
                    nights
                }
            }
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Invalid booking data',
                details: error.errors
            });
        }

        if (error.type === 'StripeCardError') {
            return res.status(400).json({
                success: false,
                error: 'PaymentError',
                message: error.message
            });
        }

        if (error.type === 'StripeInvalidRequestError') {
            return res.status(400).json({
                success: false,
                error: 'PaymentError',
                message: 'Invalid payment request'
            });
        }

        next(error);
    }
});

/**
 * GET /api/bookings
 * Fetches all bookings for the currently authenticated user
 * Requires authentication
 */
router.get('/', requireAuth, async(req, res, next) => {
    try {
        // Validate query parameters
        const validatedQuery = getUserBookingsQuerySchema.parse(req.query);

        const userId = req.user.id;

        // Fetch user bookings from database
        const bookings = await db.getUserBookings(userId);

        // Apply status filter if provided
        let filteredBookings = bookings;
        if (validatedQuery.status) {
            filteredBookings = bookings.filter(booking => booking.status === validatedQuery.status);
        }

        // Apply pagination
        const { page, limit } = validatedQuery;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedBookings = filteredBookings.slice(startIndex, endIndex);

        // Calculate pagination metadata
        const total = filteredBookings.length;
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        res.json({
            success: true,
            data: paginatedBookings.map(booking => ({
                id: booking.id,
                property: booking.properties,
                checkInDate: booking.check_in_date,
                checkOutDate: booking.check_out_date,
                totalPrice: booking.total_price,
                status: booking.status,
                guestCount: booking.guest_count,
                specialRequests: booking.special_requests,
                createdAt: booking.created_at,
                updatedAt: booking.updated_at
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage,
                hasPrevPage
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
 * GET /api/bookings/:id
 * Fetches a specific booking by ID (for the authenticated user)
 * Requires authentication
 */
router.get('/:id', requireAuth, async(req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Fetch booking from database
        const { data: booking, error } = await db.supabase
            .from('bookings')
            .select(`
        *,
        properties (
          id,
          title,
          description,
          location,
          image_urls,
          amenities,
          profiles!properties_host_id_fkey (
            first_name,
            last_name,
            avatar_url,
            phone
          )
        )
      `)
            .eq('id', id)
            .eq('guest_id', userId)
            .single();

        if (error || !booking) {
            return res.status(404).json({
                success: false,
                error: 'NotFoundError',
                message: 'Booking not found'
            });
        }

        res.json({
            success: true,
            data: {
                id: booking.id,
                property: booking.properties,
                checkInDate: booking.check_in_date,
                checkOutDate: booking.check_out_date,
                totalPrice: booking.total_price,
                status: booking.status,
                guestCount: booking.guest_count,
                specialRequests: booking.special_requests,
                stripePaymentIntentId: booking.stripe_payment_intent_id,
                createdAt: booking.created_at,
                updatedAt: booking.updated_at
            }
        });

    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/bookings/:id/cancel
 * Cancels a booking (only if it's still pending)
 * Requires authentication
 */
router.post('/:id/cancel', requireAuth, async(req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Get booking to check status and ownership
        const { data: booking, error } = await db.supabase
            .from('bookings')
            .select('*')
            .eq('id', id)
            .eq('guest_id', userId)
            .single();

        if (error || !booking) {
            return res.status(404).json({
                success: false,
                error: 'NotFoundError',
                message: 'Booking not found'
            });
        }

        if (booking.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: 'InvalidStatusError',
                message: 'Only pending bookings can be cancelled'
            });
        }

        // Update booking status to cancelled
        const updatedBooking = await db.updateBookingStatus(id, 'cancelled');

        res.json({
            success: true,
            data: {
                id: updatedBooking.id,
                status: updatedBooking.status,
                message: 'Booking cancelled successfully'
            }
        });

    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bookings/admin/all
 * Admin endpoint to get all bookings
 * Requires admin role
 */
router.get('/admin/all', requireAuth, requireRole(['admin']), async(req, res, next) => {
    try {
        const { page = 1, limit = 10, status } = req.query;

        let query = db.supabase
            .from('bookings')
            .select(`
        *,
        properties (
          id,
          title,
          location
        ),
        profiles!bookings_guest_id_fkey (
          first_name,
          last_name,
          email
        )
      `)
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        // Apply pagination
        const offset = (page - 1) * limit;
        query = query.range(offset, offset + limit - 1);

        const { data: bookings, error, count } = await query;

        if (error) throw error;

        res.json({
            success: true,
            data: bookings,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count || 0
            }
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;