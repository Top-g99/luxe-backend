const { z } = require('zod');

// UUID validation
const uuidSchema = z.string().uuid('Invalid UUID format');

// Date validation - must be in the future
const futureDateSchema = z.string().datetime().refine(
    (date) => new Date(date) > new Date(), { message: 'Date must be in the future' }
);

// Properties validation schemas
const getPropertiesQuerySchema = z.object({
    location: z.string().optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    amenities: z.array(z.string()).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
});

const propertyIdSchema = z.object({
    id: uuidSchema
});

// Booking validation schemas
const createBookingSchema = z.object({
    propertyId: uuidSchema,
    checkInDate: z.string().datetime().refine(
        (date) => {
            const checkIn = new Date(date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return checkIn >= today;
        }, { message: 'Check-in date must be today or in the future' }
    ),
    checkOutDate: z.string().datetime().refine(
        (date) => {
            const checkOut = new Date(date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return checkOut > today;
        }, { message: 'Check-out date must be in the future' }
    ),
    guestCount: z.number().int().min(1).max(20).optional().default(1),
    specialRequests: z.string().max(1000).optional()
}).refine(
    (data) => {
        const checkIn = new Date(data.checkInDate);
        const checkOut = new Date(data.checkOutDate);
        return checkOut > checkIn;
    }, {
        message: 'Check-out date must be after check-in date',
        path: ['checkOutDate']
    }
);

const getUserBookingsQuerySchema = z.object({
    status: z.enum(['pending', 'confirmed', 'cancelled']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
});

// Stripe webhook validation
const stripeWebhookSchema = z.object({
    type: z.string(),
    data: z.object({
        object: z.object({
            id: z.string(),
            status: z.string().optional(),
            metadata: z.record(z.string()).optional()
        })
    })
});

// Review validation schemas
const createReviewSchema = z.object({
    bookingId: uuidSchema,
    rating: z.number().int().min(1).max(5),
    comment: z.string().min(10).max(1000)
});

// Coupon validation schemas
const applyCouponSchema = z.object({
    code: z.string().min(1).max(50),
    bookingId: uuidSchema
});

// User profile validation
const updateProfileSchema = z.object({
    first_name: z.string().min(1).max(100).optional(),
    last_name: z.string().min(1).max(100).optional(),
    phone: z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number format').optional(),
    avatar_url: z.string().url('Invalid URL format').optional()
});

// Pagination helper
const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10)
});

// Search and filter schemas
const searchSchema = z.object({
    q: z.string().min(1).max(100).optional(),
    location: z.string().min(1).max(100).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    amenities: z.array(z.string()).optional(),
    verified: z.coerce.boolean().optional(),
    sortBy: z.enum(['price', 'rating', 'created_at']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional()
}).merge(paginationSchema);

module.exports = {
    // Properties
    getPropertiesQuerySchema,
    propertyIdSchema,

    // Bookings
    createBookingSchema,
    getUserBookingsQuerySchema,

    // Reviews
    createReviewSchema,

    // Coupons
    applyCouponSchema,

    // User profiles
    updateProfileSchema,

    // Webhooks
    stripeWebhookSchema,

    // Common
    paginationSchema,
    searchSchema,
    uuidSchema
};