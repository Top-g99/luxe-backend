# Luxe Staycations API Documentation

## Overview

The Luxe Staycations API is a comprehensive REST API for managing a luxury villa rental platform. It provides endpoints for user management, property listings, bookings, reviews, coupons, and analytics.

**Base URL:** `http://localhost:3001/api`
**Version:** 2.0.0

## Authentication

Most endpoints require authentication using Supabase JWT tokens. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Properties

#### GET /api/properties
Get all properties with filtering and pagination.

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10)
- `location` (string): Filter by location
- `minPrice` (number): Minimum price filter
- `maxPrice` (number): Maximum price filter
- `amenities` (array): Filter by amenities

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

#### GET /api/properties/search
Advanced search with multiple filters and sorting.

**Query Parameters:**
- `q` (string): Text search query
- `location` (string): Location filter
- `minPrice` (number): Minimum price
- `maxPrice` (number): Maximum price
- `amenities` (array): Amenities filter
- `verified` (boolean): Verification status
- `sortBy` (string): Sort field (price, rating, created_at)
- `sortOrder` (string): Sort order (asc, desc)

#### GET /api/properties/:id
Get a specific property by ID.

#### POST /api/properties
Create a new property (Host/Admin only).

**Body:**
```json
{
  "title": "Luxury Beach Villa",
  "description": "Beautiful beachfront villa",
  "location": "Goa, India",
  "pricePerNight": 15000,
  "cleaningFee": 2000,
  "securityDeposit": 5000,
  "amenities": ["WiFi", "Pool", "Kitchen"],
  "imageUrls": ["url1", "url2"],
  "category": "Beachfront",
  "maxGuests": 6,
  "bedrooms": 3,
  "bathrooms": 2
}
```

#### PUT /api/properties/:id
Update a property (Host/Admin only).

#### DELETE /api/properties/:id
Delete a property (Host/Admin only).

### 2. Bookings

#### GET /api/bookings
Get user's bookings (authenticated).

#### POST /api/bookings
Create a new booking.

**Body:**
```json
{
  "propertyId": "uuid",
  "checkInDate": "2024-02-01T00:00:00Z",
  "checkOutDate": "2024-02-05T00:00:00Z",
  "guestCount": 2,
  "specialRequests": "Early check-in if possible"
}
```

#### PUT /api/bookings/:id/status
Update booking status.

### 3. Users

#### GET /api/users/profile
Get current user's profile.

#### PUT /api/users/profile
Update user profile.

**Body:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+91-9876543210",
  "avatar_url": "https://example.com/avatar.jpg"
}
```

#### GET /api/users/bookings
Get current user's bookings.

#### GET /api/users/host-properties
Get properties owned by current user (Host/Admin only).

#### GET /api/users/loyalty
Get user's loyalty information.

#### GET /api/users/reviews
Get reviews written by current user.

#### GET /api/users/admin/all
Get all users (Admin only).

#### PUT /api/users/admin/:id/role
Update user role (Admin only).

#### DELETE /api/users/admin/:id
Delete user (Admin only).

### 4. Reviews

#### GET /api/reviews/property/:propertyId
Get all reviews for a specific property.

#### POST /api/reviews
Create a new review.

**Body:**
```json
{
  "bookingId": "uuid",
  "rating": 5,
  "comment": "Amazing villa with beautiful views!"
}
```

#### PUT /api/reviews/:id
Update a review.

#### DELETE /api/reviews/:id
Delete a review.

#### GET /api/reviews/admin/all
Get all reviews (Admin only).

#### GET /api/reviews/stats
Get review statistics.

### 5. Coupons

#### GET /api/coupons
Get all active coupons.

#### GET /api/coupons/:code
Get coupon details by code.

#### POST /api/coupons/apply
Apply a coupon to a booking.

**Body:**
```json
{
  "code": "WELCOME10",
  "bookingId": "uuid"
}
```

#### POST /api/coupons
Create a new coupon (Admin only).

**Body:**
```json
{
  "code": "SAVE500",
  "name": "Save $500",
  "description": "Save $500 on your next booking",
  "couponType": "fixed",
  "discountValue": 500,
  "scope": "SITE_WIDE",
  "validFrom": "2024-01-01T00:00:00Z",
  "validUntil": "2024-12-31T23:59:59Z",
  "maxUses": 100,
  "maxUsesPerUser": 1,
  "minBookingValue": 1000
}
```

#### PUT /api/coupons/:id
Update a coupon (Admin only).

#### DELETE /api/coupons/:id
Delete a coupon (Admin only).

#### GET /api/coupons/admin/all
Get all coupons (Admin only).

#### GET /api/coupons/stats
Get coupon usage statistics (Admin only).

### 6. Analytics

#### GET /api/analytics/overview
Get overview statistics (Admin only).

#### GET /api/analytics/revenue
Get detailed revenue analytics (Admin only).

**Query Parameters:**
- `period` (string): Time period (weekly, monthly, yearly)

#### GET /api/analytics/users
Get user analytics (Admin only).

#### GET /api/analytics/properties
Get property analytics (Admin only).

#### GET /api/analytics/bookings
Get booking analytics (Admin only).

#### GET /api/analytics/reviews
Get review analytics (Admin only).

### 7. Webhooks

#### POST /api/webhooks/stripe
Stripe webhook endpoint for payment processing.

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "ErrorType",
  "message": "Human readable error message",
  "details": [] // Validation errors if applicable
}
```

**Common Error Types:**
- `ValidationError`: Invalid input data
- `NotFoundError`: Resource not found
- `ForbiddenError`: Insufficient permissions
- `AuthenticationError`: Invalid or missing authentication
- `DuplicateError`: Resource already exists

## Rate Limiting

- **Limit:** 100 requests per 15 minutes per IP
- **Headers:** Rate limit information included in response headers

## Security Features

- **Helmet:** Security headers
- **CORS:** Cross-origin resource sharing configuration
- **JWT Authentication:** Supabase JWT token validation
- **Role-based Access Control:** Different permissions for different user roles
- **Input Validation:** Zod schema validation for all inputs

## User Roles

- **guest:** Can view properties, make bookings, write reviews
- **host:** Can manage properties, view bookings for their properties
- **admin:** Full access to all endpoints and analytics
- **super_admin:** Highest level of access (future implementation)

## Data Models

### User
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "role": "guest|host|admin",
  "isVerified": false,
  "isSuspended": false,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### Property
```json
{
  "id": "uuid",
  "title": "Luxury Villa",
  "description": "Beautiful villa description",
  "location": "Goa, India",
  "pricePerNight": 15000,
  "cleaningFee": 2000,
  "securityDeposit": 5000,
  "amenities": ["WiFi", "Pool"],
  "imageUrls": ["url1", "url2"],
  "isVerified": false,
  "status": "active",
  "hostId": "uuid",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### Booking
```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "guestId": "uuid",
  "checkInDate": "2024-02-01",
  "checkOutDate": "2024-02-05",
  "totalPrice": 75000,
  "status": "pending|confirmed|cancelled",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

## Testing

### Health Check
```bash
curl http://localhost:3001/health
```

### API Documentation
```bash
curl http://localhost:3001/api
```

### Authentication Test
```bash
curl -H "Authorization: Bearer <token>" \
     http://localhost:3001/api/users/profile
```

## Development

### Running the Server
```bash
# Development
npm run dev

# Production
npm start

# Docker
docker-compose up
```

### Environment Variables
```env
PORT=3001
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
FRONTEND_URL=http://localhost:3000
```

## Support

For API support and questions, please refer to the project documentation or contact the development team.
