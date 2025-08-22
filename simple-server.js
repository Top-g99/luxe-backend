const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

// Basic middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Properties endpoint (mock data for now)
app.get('/properties', (req, res) => {
    res.json({
        success: true,
        data: [
            {
                id: '1',
                title: 'Luxury Villa in Bali',
                description: 'Beautiful villa with ocean view',
                location: 'Bali, Indonesia',
                price_per_night: 250,
                cleaning_fee: 50,
                security_deposit: 500,
                amenities: ['Pool', 'WiFi', 'Kitchen'],
                image_urls: ['https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800'],
                category: 'villa',
                max_guests: 6,
                bedrooms: 3,
                bathrooms: 2,
                is_verified: true,
                status: 'active',
                host_id: 'host1',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                averageRating: 4.8,
                reviewCount: 12
            }
        ],
        pagination: {
            page: 1,
            limit: 10,
            total: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false
        }
    });
});

// Simple test endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Luxe Staycations API is running!',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;