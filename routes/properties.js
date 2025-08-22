const express = require('express');
const { z } = require('zod');
const { db } = require('../config/supabase');
const { getPropertiesQuerySchema, propertyIdSchema, searchSchema, paginationSchema } = require('../validation/schemas');
const { authMiddleware, requireRole, optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/properties
 * Fetches all properties with optional filtering and pagination
 */
router.get('/', async(req, res, next) => {
    try {
        // Validate query parameters
        const validatedQuery = getPropertiesQuerySchema.parse(req.query);

        const { page, limit, ...filters } = validatedQuery;

        // Fetch properties from database
        const { data: properties, count } = await db.getProperties(filters, page, limit);

        // Calculate pagination metadata
        const totalPages = Math.ceil((count || 0) / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        res.json({
            success: true,
            data: properties,
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages,
                hasNextPage,
                hasPrevPage
            },
            filters: Object.keys(filters).length > 0 ? filters : null
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
 * GET /api/properties/search
 * Advanced search with multiple filters and sorting
 */
router.get('/search', async(req, res, next) => {
    try {
        const validatedQuery = searchSchema.parse(req.query);
        const { q, location, minPrice, maxPrice, amenities, verified, sortBy, sortOrder, page, limit } = validatedQuery;

        let query = db.supabase
            .from('properties')
            .select(`
                *,
                profiles!properties_host_id_fkey (
                    first_name,
                    last_name,
                    avatar_url
                ),
                reviews (
                    rating
                )
            `)
            .eq('status', 'active');

        // Text search
        if (q) {
            query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%`);
        }

        // Location filter
        if (location) {
            query = query.ilike('location', `%${location}%`);
        }

        // Price filters
        if (minPrice) {
            query = query.gte('price_per_night', minPrice);
        }
        if (maxPrice) {
            query = query.lte('price_per_night', maxPrice);
        }

        // Amenities filter
        if (amenities && amenities.length > 0) {
            query = query.overlaps('amenities', amenities);
        }

        // Verification filter
        if (verified !== undefined) {
            query = query.eq('is_verified', verified);
        }

        // Sorting
        if (sortBy) {
            const order = sortOrder === 'desc' ? { ascending: false } : { ascending: true };
            query = query.order(sortBy, order);
        } else {
            query = query.order('created_at', { ascending: false });
        }

        // Pagination
        const offset = (page - 1) * limit;
        query = query.range(offset, offset + limit - 1);

        const { data: properties, error, count } = await query;

        if (error) throw error;

        // Calculate average ratings
        const propertiesWithRatings = properties.map(property => {
            const avgRating = property.reviews && property.reviews.length > 0 ?
                property.reviews.reduce((sum, review) => sum + review.rating, 0) / property.reviews.length :
                0;
            return {
                ...property,
                averageRating: Math.round(avgRating * 10) / 10,
                reviewCount: property.reviews ? property.reviews.length : 0
            };
        });

        const totalPages = Math.ceil((count || 0) / limit);

        res.json({
            success: true,
            data: propertiesWithRatings,
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            },
            search: {
                query: q,
                filters: { location, minPrice, maxPrice, amenities, verified },
                sortBy,
                sortOrder
            }
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Invalid search parameters',
                details: error.errors
            });
        }
        next(error);
    }
});

/**
 * GET /api/properties/:id
 * Fetches a single property by ID with all details
 */
router.get('/:id', async(req, res, next) => {
    try {
        // Validate property ID
        const { id } = propertyIdSchema.parse(req.params);

        // Fetch property from database
        const property = await db.getPropertyById(id);

        if (!property) {
            return res.status(404).json({
                success: false,
                error: 'NotFoundError',
                message: 'Property not found'
            });
        }

        // Calculate average rating from reviews
        const averageRating = property.reviews && property.reviews.length > 0 ?
            property.reviews.reduce((sum, review) => sum + review.rating, 0) / property.reviews.length :
            0;

        // Add calculated fields
        const propertyWithStats = {
            ...property,
            averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
            reviewCount: property.reviews ? property.reviews.length : 0
        };

        res.json({
            success: true,
            data: propertyWithStats
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Invalid property ID',
                details: error.errors
            });
        }
        next(error);
    }
});

/**
 * POST /api/properties
 * Create a new property (host only)
 */
router.post('/', authMiddleware, requireRole(['host', 'admin']), async(req, res, next) => {
    try {
        const { title, description, location, latitude, longitude, pricePerNight, cleaningFee, securityDeposit, amenities, imageUrls, category, maxGuests, bedrooms, bathrooms } = req.body;

        // Validate required fields
        if (!title || !description || !location || !pricePerNight) {
            return res.status(400).json({
                success: false,
                error: 'ValidationError',
                message: 'Missing required fields'
            });
        }

        // Create property
        const { data: property, error } = await db.supabase
            .from('properties')
            .insert({
                host_id: req.user.id,
                title,
                description,
                location,
                latitude: latitude || null,
                longitude: longitude || null,
                price_per_night: pricePerNight,
                cleaning_fee: cleaningFee || 0,
                security_deposit: securityDeposit || 0,
                amenities: amenities || [],
                image_urls: imageUrls || [],
                category: category || 'Luxury',
                max_guests: maxGuests || 2,
                bedrooms: bedrooms || 1,
                bathrooms: bathrooms || 1,
                status: 'active'
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({
            success: true,
            data: property,
            message: 'Property created successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/properties/:id
 * Update property (host only)
 */
router.put('/:id', authMiddleware, requireRole(['host', 'admin']), async(req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Verify property ownership
        const { data: existingProperty, error: fetchError } = await db.supabase
            .from('properties')
            .select('host_id')
            .eq('id', id)
            .single();

        if (fetchError || !existingProperty) {
            return res.status(404).json({
                success: false,
                error: 'NotFoundError',
                message: 'Property not found'
            });
        }

        if (existingProperty.host_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'ForbiddenError',
                message: 'You can only edit your own properties'
            });
        }

        // Update property
        const { data: updatedProperty, error: updateError } = await db.supabase
            .from('properties')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        res.json({
            success: true,
            data: updatedProperty,
            message: 'Property updated successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/properties/:id
 * Delete property (host only)
 */
router.delete('/:id', authMiddleware, requireRole(['host', 'admin']), async(req, res, next) => {
    try {
        const { id } = req.params;

        // Verify property ownership
        const { data: existingProperty, error: fetchError } = await db.supabase
            .from('properties')
            .select('host_id')
            .eq('id', id)
            .single();

        if (fetchError || !existingProperty) {
            return res.status(404).json({
                success: false,
                error: 'NotFoundError',
                message: 'Property not found'
            });
        }

        if (existingProperty.host_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'ForbiddenError',
                message: 'You can only delete your own properties'
            });
        }

        // Check if property has active bookings
        const { data: activeBookings, error: bookingCheckError } = await db.supabase
            .from('bookings')
            .select('id')
            .eq('property_id', id)
            .in('status', ['pending', 'confirmed']);

        if (bookingCheckError) throw bookingCheckError;

        if (activeBookings && activeBookings.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'ActiveBookingsError',
                message: 'Cannot delete property with active bookings'
            });
        }

        // Delete property
        const { error: deleteError } = await db.supabase
            .from('properties')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        res.json({
            success: true,
            message: 'Property deleted successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/properties/search/amenities
 * Get available amenities for filtering
 */
router.get('/search/amenities', async(req, res, next) => {
    try {
        // Query to get all unique amenities from properties
        const { data, error } = await db.supabase
            .from('properties')
            .select('amenities')
            .eq('status', 'active')
            .not('amenities', 'is', null);

        if (error) throw error;

        // Extract and deduplicate amenities
        const allAmenities = data
            .flatMap(property => property.amenities || [])
            .filter((amenity, index, arr) => arr.indexOf(amenity) === index)
            .sort();

        res.json({
            success: true,
            data: allAmenities
        });

    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/properties/search/locations
 * Get available locations for filtering
 */
router.get('/search/locations', async(req, res, next) => {
    try {
        const { data, error } = await db.supabase
            .from('properties')
            .select('location')
            .eq('status', 'active')
            .not('location', 'is', null);

        if (error) throw error;

        // Extract and deduplicate locations
        const locations = [...new Set(data.map(property => property.location))].sort();

        res.json({
            success: true,
            data: locations
        });

    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/properties/search/categories
 * Get available property categories
 */
router.get('/search/categories', async(req, res, next) => {
    try {
        const { data, error } = await db.supabase
            .from('properties')
            .select('category')
            .eq('status', 'active')
            .not('category', 'is', null);

        if (error) throw error;

        // Extract and deduplicate categories
        const categories = [...new Set(data.map(property => property.category))].sort();

        res.json({
            success: true,
            data: categories
        });

    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/properties/admin/all
 * Get all properties (admin only)
 */
router.get('/admin/all', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        const validatedQuery = paginationSchema.parse(req.query);
        const { page, limit } = validatedQuery;

        const { data: properties, error, count } = await db.supabase
            .from('properties')
            .select(`
                *,
                profiles!properties_host_id_fkey (
                    first_name,
                    last_name,
                    email
                )
            `)
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
 * PUT /api/properties/admin/:id/verify
 * Verify property (admin only)
 */
router.put('/admin/:id/verify', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        const { id } = req.params;
        const { isVerified } = req.body;

        const { data: property, error } = await db.supabase
            .from('properties')
            .update({ is_verified: isVerified })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            data: property,
            message: `Property ${isVerified ? 'verified' : 'unverified'} successfully`
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;