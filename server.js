const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const propertiesRoutes = require('./routes/properties');
const bookingsRoutes = require('./routes/bookings');
const webhooksRoutes = require('./routes/webhooks');
const usersRoutes = require('./routes/users');
const reviewsRoutes = require('./routes/reviews');
const couponsRoutes = require('./routes/coupons');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Luxe Staycations API',
        version: '2.0.0'
    });
});

// API documentation endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'Luxe Staycations API',
        version: '2.0.0',
        description: 'Luxury Villa Rental Platform API',
        endpoints: {
            properties: '/api/properties',
            bookings: '/api/bookings',
            users: '/api/users',
            reviews: '/api/reviews',
            coupons: '/api/coupons',
            analytics: '/api/analytics',
            webhooks: '/api/webhooks'
        },
        documentation: 'Check individual endpoint documentation for detailed usage'
    });
});

// API routes
app.use('/api/properties', propertiesRoutes);
app.use('/api/bookings', authMiddleware, bookingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/webhooks', webhooksRoutes);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        availableEndpoints: [
            '/api/properties',
            '/api/bookings',
            '/api/users',
            '/api/reviews',
            '/api/coupons',
            '/api/analytics',
            '/api/webhooks'
        ]
    });
});

// Global error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Luxe Staycations API server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📚 API documentation: http://localhost:${PORT}/api`);
    console.log(`🔐 Authentication required for protected endpoints`);
});

module.exports = app;