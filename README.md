# Luxe Staycations API

A comprehensive Express.js API for the Luxe Staycations luxury villa rental platform, built with Supabase and Stripe integration.

## 🚀 Features

- **Property Management**: Search, filter, and view luxury villa properties
- **Booking System**: Complete booking workflow with Stripe payment integration
- **User Management**: Authentication and user profile management
- **Payment Processing**: Secure payment handling with Stripe
- **Webhook Integration**: Real-time payment status updates
- **Loyalty Program**: Points system for customer retention
- **Host Payouts**: Automated payout management for property hosts

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth with JWT
- **Payments**: Stripe
- **Validation**: Zod
- **Security**: Helmet, CORS, Rate Limiting

## 📋 Prerequisites

- Node.js 18+ installed
- Supabase project set up with the provided schema
- Stripe account with API keys
- Git for version control

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd luxe-api
npm install
```

### 2. Environment Setup

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```env
# Supabase
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Stripe
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret

# Server
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

### 3. Database Setup

Ensure your Supabase database has the schema from `luxe_simplified_schema.sql`:

```sql
-- Run the schema file in your Supabase SQL editor
-- or use the provided schema file
```

### 4. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3001`

## 📚 API Endpoints

### Properties

#### GET /api/properties
Fetch all properties with filtering and pagination.

**Query Parameters:**
- `location` (string): Filter by location
- `minPrice` (number): Minimum price per night
- `maxPrice` (number): Maximum price per night
- `amenities` (array): Filter by amenities
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10)

**Example:**
```bash
GET /api/properties?location=Goa&minPrice=5000&maxPrice=20000&page=1&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Luxury Beach Villa",
      "description": "Beautiful beachfront villa",
      "location": "Goa, India",
      "price_per_night": 15000,
      "cleaning_fee": 2000,
      "security_deposit": 5000,
      "amenities": ["WiFi", "Pool", "Kitchen"],
      "image_urls": ["url1", "url2"],
      "is_verified": true,
      "status": "active",
      "profiles": {
        "first_name": "John",
        "last_name": "Smith",
        "avatar_url": "url"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

#### GET /api/properties/:id
Fetch a single property by ID with all details.

**Example:**
```bash
GET /api/properties/123e4567-e89b-12d3-a456-426614174000
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Luxury Beach Villa",
    "description": "Beautiful beachfront villa",
    "location": "Goa, India",
    "latitude": 15.2993,
    "longitude": 74.1240,
    "price_per_night": 15000,
    "cleaning_fee": 2000,
    "security_deposit": 5000,
    "amenities": ["WiFi", "Pool", "Kitchen"],
    "image_urls": ["url1", "url2"],
    "is_verified": true,
    "status": "active",
    "averageRating": 4.5,
    "reviewCount": 12,
    "profiles": {
      "first_name": "John",
      "last_name": "Smith",
      "avatar_url": "url",
      "phone": "+91-9876543210"
    },
    "reviews": [
      {
        "id": "uuid",
        "rating": 5,
        "comment": "Amazing villa!",
        "created_at": "2024-01-15T10:00:00Z"
      }
    ]
  }
}
```

### Bookings (Protected Routes)

#### POST /api/bookings
Create a new booking with Stripe payment intent.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "propertyId": "123e4567-e89b-12d3-a456-426614174000",
  "checkInDate": "2024-02-15T00:00:00Z",
  "checkOutDate": "2024-02-18T00:00:00Z",
  "guestCount": 2,
  "specialRequests": "Early check-in if possible"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "booking": {
      "id": "uuid",
      "propertyId": "uuid",
      "checkInDate": "2024-02-15T00:00:00Z",
      "checkOutDate": "2024-02-18T00:00:00Z",
      "totalPrice": 47000,
      "status": "pending",
      "guestCount": 2,
      "specialRequests": "Early check-in if possible",
      "createdAt": "2024-01-15T10:00:00Z"
    },
    "payment": {
      "clientSecret": "pi_xxx_secret_xxx",
      "paymentIntentId": "pi_xxx",
      "amount": 4700000,
      "currency": "inr"
    },
    "priceBreakdown": {
      "basePrice": 45000,
      "cleaningFee": 2000,
      "totalPrice": 47000,
      "nights": 3
    }
  }
}
```

#### GET /api/bookings
Fetch all bookings for the authenticated user.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `status` (string): Filter by status (pending, confirmed, cancelled)
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "property": {
        "id": "uuid",
        "title": "Luxury Beach Villa",
        "location": "Goa, India",
        "image_urls": ["url1", "url2"]
      },
      "checkInDate": "2024-02-15T00:00:00Z",
      "checkOutDate": "2024-02-18T00:00:00Z",
      "totalPrice": 47000,
      "status": "confirmed",
      "guestCount": 2,
      "specialRequests": "Early check-in if possible",
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

#### GET /api/bookings/:id
Fetch a specific booking by ID.

#### POST /api/bookings/:id/cancel
Cancel a pending booking.

### Webhooks

#### POST /api/webhooks/stripe
Handle Stripe webhook events (payment success, failure, etc.).

**Headers:**
```
Stripe-Signature: <webhook_signature>
```

**Events Handled:**
- `payment_intent.succeeded`: Updates booking status to confirmed
- `payment_intent.payment_failed`: Updates booking status to cancelled
- `payment_intent.canceled`: Updates booking status to cancelled

## 🔐 Authentication

The API uses Supabase JWT tokens for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

### Getting a JWT Token

1. Sign up/login through Supabase Auth
2. Get the JWT token from the auth response
3. Include it in API requests

## 💳 Payment Integration

### Stripe Setup

1. Create a Stripe account
2. Get your API keys from the dashboard
3. Set up webhook endpoints
4. Configure the webhook secret

### Payment Flow

1. **Create Booking**: POST `/api/bookings`
2. **Process Payment**: Use the returned `clientSecret` with Stripe Elements
3. **Webhook Processing**: Payment status updates automatically via webhooks

## 🧪 Testing

### Run Tests
```bash
npm test
```

### Test with Sample Data

The API includes sample data inserts. You can test with:

```bash
# Get all properties
curl http://localhost:3001/api/properties

# Get specific property
curl http://localhost:3001/api/properties/<property_id>

# Create booking (requires auth)
curl -X POST http://localhost:3001/api/bookings \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "propertyId": "<property_id>",
    "checkInDate": "2024-02-15T00:00:00Z",
    "checkOutDate": "2024-02-18T00:00:00Z",
    "guestCount": 2
  }'
```

## 🔧 Development

### Project Structure
```
luxe-api/
├── config/
│   └── supabase.js          # Supabase configuration
├── middleware/
│   ├── auth.js              # Authentication middleware
│   └── errorHandler.js      # Global error handler
├── routes/
│   ├── properties.js        # Property endpoints
│   ├── bookings.js          # Booking endpoints
│   └── webhooks.js          # Webhook handlers
├── validation/
│   └── schemas.js           # Zod validation schemas
├── server.js                # Main server file
├── package.json
└── README.md
```

### Available Scripts

- `npm start`: Start production server
- `npm run dev`: Start development server with nodemon
- `npm test`: Run tests
- `npm run lint`: Run ESLint
- `npm run lint:fix`: Fix ESLint issues

## 🚀 Deployment

### Environment Variables

Ensure all required environment variables are set in production:

```env
NODE_ENV=production
SUPABASE_URL=your_production_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_production_service_key
STRIPE_SECRET_KEY=sk_live_your_production_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_production_webhook_secret
```

### Deployment Platforms

The API can be deployed to:
- Vercel
- Heroku
- AWS Lambda
- DigitalOcean App Platform
- Railway

### Health Check

Monitor the API health:

```bash
curl http://your-api-domain/health
```

## 🔒 Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: Request throttling
- **Input Validation**: Zod schema validation
- **JWT Authentication**: Secure token-based auth
- **Webhook Verification**: Stripe signature verification

## 📊 Monitoring

### Logging

The API includes comprehensive logging:
- Request/response logging
- Error logging with stack traces
- Payment processing logs
- Webhook event logs

### Error Handling

Consistent error responses across all endpoints:

```json
{
  "success": false,
  "error": "ValidationError",
  "message": "Invalid request data",
  "details": [...],
  "timestamp": "2024-01-15T10:00:00Z",
  "path": "/api/bookings",
  "method": "POST"
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

---

**Built with ❤️ for Luxe Staycations**
