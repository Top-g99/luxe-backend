const express = require('express');
const { db } = require('../config/supabase');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/analytics/overview
 * Get overview statistics (admin only)
 */
router.get('/overview', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        // Get total counts
        const [
            { count: totalUsers },
            { count: totalProperties },
            { count: totalBookings },
            { count: totalReviews }
        ] = await Promise.all([
            db.supabase.from('users').select('*', { count: 'exact', head: true }),
            db.supabase.from('properties').select('*', { count: 'exact', head: true }),
            db.supabase.from('bookings').select('*', { count: 'exact', head: true }),
            db.supabase.from('reviews').select('*', { count: 'exact', head: true })
        ]);

        // Get revenue statistics
        const { data: revenueData, error: revenueError } = await db.supabase
            .from('bookings')
            .select('total_price, status, created_at')
            .eq('status', 'confirmed');

        if (revenueError) throw revenueError;

        const totalRevenue = revenueData.reduce((sum, booking) => sum + (booking.total_price || 0), 0);
        const monthlyRevenue = revenueData
            .filter(booking => {
                const bookingDate = new Date(booking.created_at);
                const currentMonth = new Date();
                return bookingDate.getMonth() === currentMonth.getMonth() &&
                    bookingDate.getFullYear() === currentMonth.getFullYear();
            })
            .reduce((sum, booking) => sum + (booking.total_price || 0), 0);

        // Get user growth
        const { data: userGrowth, error: userGrowthError } = await db.supabase
            .from('users')
            .select('created_at, role')
            .order('created_at', { ascending: false })
            .limit(30);

        if (userGrowthError) throw userGrowthError;

        const recentUsers = userGrowth.filter(user => {
            const userDate = new Date(user.created_at);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return userDate >= thirtyDaysAgo;
        }).length;

        res.json({
            success: true,
            data: {
                overview: {
                    totalUsers: totalUsers || 0,
                    totalProperties: totalProperties || 0,
                    totalBookings: totalBookings || 0,
                    totalReviews: totalReviews || 0
                },
                revenue: {
                    total: totalRevenue,
                    monthly: monthlyRevenue,
                    averagePerBooking: totalRevenue / (revenueData.length || 1)
                },
                growth: {
                    newUsersLast30Days: recentUsers,
                    userGrowthRate: ((recentUsers / (totalUsers || 1)) * 100).toFixed(2)
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/analytics/revenue
 * Get detailed revenue analytics (admin only)
 */
router.get('/revenue', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        const { period = 'monthly' } = req.query;

        let dateFilter;
        const now = new Date();

        switch (period) {
            case 'weekly':
                dateFilter = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
                break;
            case 'monthly':
                dateFilter = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'yearly':
                dateFilter = new Date(now.getFullYear(), 0, 1);
                break;
            default:
                dateFilter = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const { data: bookings, error } = await db.supabase
            .from('bookings')
            .select('total_price, status, created_at, properties!bookings_property_id_fkey (title, location)')
            .gte('created_at', dateFilter.toISOString())
            .eq('status', 'confirmed')
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Group by time period
        const revenueByPeriod = {};
        bookings.forEach(booking => {
            let key;
            if (period === 'weekly') {
                const weekStart = new Date(booking.created_at);
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                key = weekStart.toISOString().split('T')[0];
            } else if (period === 'monthly') {
                key = new Date(booking.created_at).toISOString().substring(0, 7);
            } else {
                key = new Date(booking.created_at).getFullYear().toString();
            }

            if (!revenueByPeriod[key]) {
                revenueByPeriod[key] = {
                    revenue: 0,
                    bookings: 0,
                    averageBookingValue: 0
                };
            }

            revenueByPeriod[key].revenue += booking.total_price || 0;
            revenueByPeriod[key].bookings += 1;
        });

        // Calculate averages
        Object.keys(revenueByPeriod).forEach(key => {
            revenueByPeriod[key].averageBookingValue = revenueByPeriod[key].revenue / revenueByPeriod[key].bookings;
        });

        // Top performing properties
        const propertyRevenue = {};
        bookings.forEach(booking => {
            const propertyTitle = booking.properties ? .title || 'Unknown';
            if (!propertyRevenue[propertyTitle]) {
                propertyRevenue[propertyTitle] = {
                    revenue: 0,
                    bookings: 0,
                    location: booking.properties ? .location || 'Unknown'
                };
            }
            propertyRevenue[propertyTitle].revenue += booking.total_price || 0;
            propertyRevenue[propertyTitle].bookings += 1;
        });

        const topProperties = Object.entries(propertyRevenue)
            .map(([title, data]) => ({ title, ...data }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        res.json({
            success: true,
            data: {
                period,
                revenueByPeriod,
                topProperties,
                totalRevenue: bookings.reduce((sum, b) => sum + (b.total_price || 0), 0),
                totalBookings: bookings.length
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/analytics/users
 * Get user analytics (admin only)
 */
router.get('/users', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        // Get user statistics by role
        const { data: users, error } = await db.supabase
            .from('users')
            .select('role, created_at, isVerified, isSuspended');

        if (error) throw error;

        const userStats = {
            total: users.length,
            byRole: {
                guest: users.filter(u => u.role === 'guest').length,
                host: users.filter(u => u.role === 'host').length,
                admin: users.filter(u => u.role === 'admin').length
            },
            verified: users.filter(u => u.isVerified).length,
            suspended: users.filter(u => u.isSuspended).length
        };

        // User growth over time
        const monthlyGrowth = {};
        users.forEach(user => {
            const month = new Date(user.created_at).toISOString().substring(0, 7);
            monthlyGrowth[month] = (monthlyGrowth[month] || 0) + 1;
        });

        // Recent activity
        const recentUsers = users
            .filter(user => {
                const userDate = new Date(user.created_at);
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                return userDate >= thirtyDaysAgo;
            })
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 10);

        res.json({
            success: true,
            data: {
                overview: userStats,
                monthlyGrowth,
                recentUsers: recentUsers.map(user => ({
                    id: user.id,
                    role: user.role,
                    created_at: user.created_at,
                    isVerified: user.isVerified
                }))
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/analytics/properties
 * Get property analytics (admin only)
 */
router.get('/properties', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        // Get property statistics
        const { data: properties, error } = await db.supabase
            .from('properties')
            .select('status, is_verified, location, price_per_night, created_at, host_id');

        if (error) throw error;

        const propertyStats = {
            total: properties.length,
            byStatus: {
                active: properties.filter(p => p.status === 'active').length,
                inactive: properties.filter(p => p.status === 'inactive').length
            },
            verified: properties.filter(p => p.is_verified).length,
            unverified: properties.filter(p => !p.is_verified).length
        };

        // Location distribution
        const locationStats = {};
        properties.forEach(property => {
            const location = property.location || 'Unknown';
            locationStats[location] = (locationStats[location] || 0) + 1;
        });

        // Price analysis
        const prices = properties
            .filter(p => p.price_per_night)
            .map(p => p.price_per_night);

        const priceStats = {
            average: prices.length > 0 ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0,
            min: prices.length > 0 ? Math.min(...prices) : 0,
            max: prices.length > 0 ? Math.max(...prices) : 0,
            median: prices.length > 0 ? prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)] : 0
        };

        // Property growth over time
        const monthlyPropertyGrowth = {};
        properties.forEach(property => {
            const month = new Date(property.created_at).toISOString().substring(0, 7);
            monthlyPropertyGrowth[month] = (monthlyPropertyGrowth[month] || 0) + 1;
        });

        res.json({
            success: true,
            data: {
                overview: propertyStats,
                locationDistribution: locationStats,
                priceAnalysis: priceStats,
                monthlyGrowth: monthlyPropertyGrowth
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/analytics/bookings
 * Get booking analytics (admin only)
 */
router.get('/bookings', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        // Get booking statistics
        const { data: bookings, error } = await db.supabase
            .from('bookings')
            .select('status, total_price, created_at, check_in_date, check_out_date');

        if (error) throw error;

        const bookingStats = {
            total: bookings.length,
            byStatus: {
                pending: bookings.filter(b => b.status === 'pending').length,
                confirmed: bookings.filter(b => b.status === 'confirmed').length,
                cancelled: bookings.filter(b => b.status === 'cancelled').length
            }
        };

        // Revenue by status
        const revenueByStatus = {
            pending: bookings.filter(b => b.status === 'pending').reduce((sum, b) => sum + (b.total_price || 0), 0),
            confirmed: bookings.filter(b => b.status === 'confirmed').reduce((sum, b) => sum + (b.total_price || 0), 0),
            cancelled: bookings.filter(b => b.status === 'cancelled').reduce((sum, b) => sum + (b.total_price || 0), 0)
        };

        // Seasonal analysis
        const seasonalData = {};
        bookings.forEach(booking => {
            if (booking.check_in_date) {
                const month = new Date(booking.check_in_date).getMonth();
                const monthName = new Date(0, month).toLocaleString('default', { month: 'long' });

                if (!seasonalData[monthName]) {
                    seasonalData[monthName] = {
                        bookings: 0,
                        revenue: 0
                    };
                }

                seasonalData[monthName].bookings += 1;
                seasonalData[monthName].revenue += booking.total_price || 0;
            }
        });

        // Booking growth over time
        const monthlyBookingGrowth = {};
        bookings.forEach(booking => {
            const month = new Date(booking.created_at).toISOString().substring(0, 7);
            monthlyBookingGrowth[month] = (monthlyBookingGrowth[month] || 0) + 1;
        });

        res.json({
            success: true,
            data: {
                overview: bookingStats,
                revenueByStatus,
                seasonalAnalysis: seasonalData,
                monthlyGrowth: monthlyBookingGrowth,
                conversionRate: {
                    pendingToConfirmed: (bookingStats.byStatus.confirmed / (bookingStats.byStatus.pending + bookingStats.byStatus.confirmed) * 100).toFixed(2)
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/analytics/reviews
 * Get review analytics (admin only)
 */
router.get('/reviews', authMiddleware, requireRole(['admin']), async(req, res, next) => {
    try {
        // Get review statistics
        const { data: reviews, error } = await db.supabase
            .from('reviews')
            .select('rating, created_at');

        if (error) throw error;

        const reviewStats = {
            total: reviews.length,
            averageRating: reviews.length > 0 ?
                reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length :
                0
        };

        // Rating distribution
        const ratingDistribution = {
            1: reviews.filter(r => r.rating === 1).length,
            2: reviews.filter(r => r.rating === 2).length,
            3: reviews.filter(r => r.rating === 3).length,
            4: reviews.filter(r => r.rating === 4).length,
            5: reviews.filter(r => r.rating === 5).length
        };

        // Review growth over time
        const monthlyReviewGrowth = {};
        reviews.forEach(review => {
            const month = new Date(review.created_at).toISOString().substring(0, 7);
            monthlyReviewGrowth[month] = (monthlyReviewGrowth[month] || 0) + 1;
        });

        // Sentiment analysis
        const positiveReviews = reviews.filter(r => r.rating >= 4).length;
        const neutralReviews = reviews.filter(r => r.rating === 3).length;
        const negativeReviews = reviews.filter(r => r.rating <= 2).length;

        res.json({
            success: true,
            data: {
                overview: reviewStats,
                ratingDistribution,
                monthlyGrowth: monthlyReviewGrowth,
                sentiment: {
                    positive: positiveReviews,
                    neutral: neutralReviews,
                    negative: negativeReviews,
                    positivePercentage: ((positiveReviews / reviews.length) * 100).toFixed(2)
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;