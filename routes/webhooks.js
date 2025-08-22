const express = require('express');
const { z } = require('zod');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { db } = require('../config/supabase');
const { stripeWebhookSchema } = require('../validation/schemas');

const router = express.Router();

/**
 * POST /api/webhooks/stripe
 * Handles Stripe webhook events
 */
router.post('/stripe', express.raw({ type: 'application/json' }), async(req, res, next) => {
    try {
        const sig = req.headers['stripe-signature'];
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!endpointSecret) {
            console.error('STRIPE_WEBHOOK_SECRET not configured');
            return res.status(500).json({
                success: false,
                error: 'WebhookError',
                message: 'Webhook secret not configured'
            });
        }

        let event;

        try {
            // Verify webhook signature
            event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return res.status(400).json({
                success: false,
                error: 'WebhookError',
                message: 'Invalid webhook signature'
            });
        }

        // Validate event structure
        try {
            stripeWebhookSchema.parse(event);
        } catch (validationError) {
            console.error('Invalid webhook event structure:', validationError);
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Invalid webhook event structure'
            });
        }

        // Handle different event types
        switch (event.type) {
            case 'payment_intent.succeeded':
                await handlePaymentIntentSucceeded(event.data.object);
                break;

            case 'payment_intent.payment_failed':
                await handlePaymentIntentFailed(event.data.object);
                break;

            case 'payment_intent.canceled':
                await handlePaymentIntentCanceled(event.data.object);
                break;

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });

    } catch (error) {
        console.error('Webhook processing error:', error);
        next(error);
    }
});

/**
 * Handle successful payment intent
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
    try {
        console.log('Processing successful payment:', paymentIntent.id);

        const { propertyId, guestId, checkInDate, checkOutDate } = paymentIntent.metadata;

        // Find the booking associated with this payment intent
        const { data: booking, error } = await db.supabase
            .from('bookings')
            .select('*')
            .eq('stripe_payment_intent_id', paymentIntent.id)
            .single();

        if (error || !booking) {
            console.error('Booking not found for payment intent:', paymentIntent.id);
            return;
        }

        // Update booking status to confirmed
        const updatedBooking = await db.updateBookingStatus(booking.id, 'confirmed');

        // Create host payout record
        await createHostPayout(booking);

        // Award loyalty points to guest
        await awardLoyaltyPoints(booking.guest_id, booking.id, 'booking');

        console.log('Successfully processed payment for booking:', booking.id);

    } catch (error) {
        console.error('Error processing successful payment:', error);
        throw error;
    }
}

/**
 * Handle failed payment intent
 */
async function handlePaymentIntentFailed(paymentIntent) {
    try {
        console.log('Processing failed payment:', paymentIntent.id);

        // Find the booking associated with this payment intent
        const { data: booking, error } = await db.supabase
            .from('bookings')
            .select('*')
            .eq('stripe_payment_intent_id', paymentIntent.id)
            .single();

        if (error || !booking) {
            console.error('Booking not found for failed payment intent:', paymentIntent.id);
            return;
        }

        // Update booking status to cancelled
        await db.updateBookingStatus(booking.id, 'cancelled');

        console.log('Successfully processed failed payment for booking:', booking.id);

    } catch (error) {
        console.error('Error processing failed payment:', error);
        throw error;
    }
}

/**
 * Handle canceled payment intent
 */
async function handlePaymentIntentCanceled(paymentIntent) {
    try {
        console.log('Processing canceled payment:', paymentIntent.id);

        // Find the booking associated with this payment intent
        const { data: booking, error } = await db.supabase
            .from('bookings')
            .select('*')
            .eq('stripe_payment_intent_id', paymentIntent.id)
            .single();

        if (error || !booking) {
            console.error('Booking not found for canceled payment intent:', paymentIntent.id);
            return;
        }

        // Update booking status to cancelled
        await db.updateBookingStatus(booking.id, 'cancelled');

        console.log('Successfully processed canceled payment for booking:', booking.id);

    } catch (error) {
        console.error('Error processing canceled payment:', error);
        throw error;
    }
}

/**
 * Create host payout record
 */
async function createHostPayout(booking) {
    try {
        // Get property details to find host
        const { data: property, error: propertyError } = await db.supabase
            .from('properties')
            .select('host_id, price_per_night')
            .eq('id', booking.property_id)
            .single();

        if (propertyError || !property) {
            console.error('Property not found for payout:', booking.property_id);
            return;
        }

        // Calculate payout amount (example: 85% of total price goes to host)
        const payoutAmount = booking.total_price * 0.85;
        const tdsDeducted = payoutAmount * 0.05; // 5% TDS
        const finalPayoutAmount = payoutAmount - tdsDeducted;

        // Create payout record
        const { data: payout, error: payoutError } = await db.supabase
            .from('host_payouts')
            .insert({
                host_id: property.host_id,
                booking_id: booking.id,
                amount: finalPayoutAmount,
                status: 'pending',
                tds_deducted: tdsDeducted
            })
            .select()
            .single();

        if (payoutError) {
            console.error('Error creating host payout:', payoutError);
            return;
        }

        console.log('Created host payout:', payout.id);

    } catch (error) {
        console.error('Error creating host payout:', error);
        throw error;
    }
}

/**
 * Award loyalty points to guest
 */
async function awardLoyaltyPoints(userId, bookingId, reason) {
    try {
        // Calculate points based on booking amount (example: 1 point per 100 rupees)
        const { data: booking, error } = await db.supabase
            .from('bookings')
            .select('total_price')
            .eq('id', bookingId)
            .single();

        if (error || !booking) {
            console.error('Booking not found for loyalty points:', bookingId);
            return;
        }

        const pointsEarned = Math.floor(booking.total_price / 100);

        // Create loyalty transaction
        const { data: loyaltyTransaction, error: loyaltyError } = await db.supabase
            .from('loyalty_transactions')
            .insert({
                user_id: userId,
                jewels_earned: pointsEarned,
                jewels_redeemed: 0,
                booking_id: bookingId,
                reason: reason
            })
            .select()
            .single();

        if (loyaltyError) {
            console.error('Error creating loyalty transaction:', loyaltyError);
            return;
        }

        // Update user's total loyalty points
        const { error: updateError } = await db.supabase
            .from('users')
            .update({ luxe_jewels: db.supabase.raw('luxe_jewels + ?', [pointsEarned]) })
            .eq('id', userId);

        if (updateError) {
            console.error('Error updating user loyalty points:', updateError);
            return;
        }

        console.log(`Awarded ${pointsEarned} loyalty points to user ${userId}`);

    } catch (error) {
        console.error('Error awarding loyalty points:', error);
        throw error;
    }
}

/**
 * GET /api/webhooks/stripe/test
 * Test endpoint to verify webhook configuration
 */
router.get('/stripe/test', (req, res) => {
    res.json({
        success: true,
        message: 'Stripe webhook endpoint is working',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;