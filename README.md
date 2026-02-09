# Yupacgo Backend API

> **Intelligent Investment Platform API** - Empowering Nigerian investors with personalized stock recommendations and portfolio management.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Core Services](#core-services)
- [Deployment](#deployment)
- [Scripts](#scripts)
- [Contributing](#contributing)

---

## 🎯 Overview

Yupacgo is a sophisticated investment platform backend that provides personalized stock recommendations, portfolio management, and real-time market data for Nigerian and international investors. The system uses intelligent algorithms to match users with suitable investment opportunities based on their risk tolerance, financial goals, and preferences.

**Key Capabilities:**
- 🤖 AI-powered stock recommendation engine
- 📊 Real-time market data from multiple providers
- 💼 Virtual portfolio management
- 📈 Watchlist tracking with price alerts
- 🔔 Smart notification system
- 🔐 Secure authentication with JWT
- 📱 RESTful API architecture

---

## ✨ Features

### User Management
- Email/password authentication with JWT tokens
- OTP-based email verification
- Secure password reset flow
- User profile management
- Activity logging and tracking

### Investment Intelligence
- **Smart Recommendation Engine**: Personalized stock recommendations based on:
  - Risk tolerance (Conservative, Balanced, Aggressive)
  - Investment goals (Retirement, Wealth Building, Income)
  - Budget constraints
  - Sector preferences
  - Investment timeline
- **Multi-Provider Data Aggregation**: Combines data from Finnhub, TwelveData, and AlphaVantage
- **Price Comparison**: Real-time price validation across multiple sources
- **Confidence Scoring**: Data reliability metrics for each recommendation

### Portfolio & Watchlist
- Virtual portfolio simulation
- Real-time portfolio valuation
- Performance tracking and analytics
- Watchlist management with price alerts
- Transaction history

### Market Data
- Real-time stock quotes
- Company profiles and fundamentals
- Stock search functionality
- Popular stocks discovery
- Price comparison across providers

### Notifications
- Price alert notifications
- Portfolio updates
- Recommendation alerts
- Email notifications via Nodemailer
- Customizable notification preferences

### Admin Features
- User management dashboard
- System analytics
- Activity monitoring
- Admin authentication

---

## 🛠 Tech Stack

### Core Technologies
- **Runtime**: Node.js
- **Framework**: Express.js 5.x
- **Database**: MongoDB (Mongoose ODM)
- **Cache**: Redis (IORedis)
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcrypt

### External Services
- **Stock Data Providers**:
  - Finnhub API
  - TwelveData API
  - AlphaVantage API
- **Email**: Nodemailer
- **Scheduling**: node-cron

### Development Tools
- **Process Manager**: nodemon
- **HTTP Client**: axios
- **Security**: express-rate-limit, CORS

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or Atlas)
- Redis (local or cloud)
- API keys for stock data providers

### Installation

1. **Clone the repository**
```bash
cd backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.exmaple .env
# Edit .env with your configuration
```

4. **Start MongoDB and Redis**
```bash
# MongoDB (if local)
mongod

# Redis (if local)
redis-server
```

5. **Seed admin user (optional)**
```bash
node scripts/seedAdmin.js
```

6. **Start the server**
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:8080` (or your configured PORT).

---

## 🔐 Environment Variables

Create a `.env` file in the backend directory with the following variables:

```env
# Application
PORT=8080
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_change_this
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_SECRET=your_refresh_token_secret_change_this

# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/yupacgo?retryWrites=true&w=majority

# Redis Cache
REDIS_URL=redis://localhost:6379

# Stock Data Providers
FINNHUB_KEY=your_finnhub_api_key
TWELVEDATA_KEY=your_twelvedata_api_key
ALPHAVANTAGE_KEY=your_alphavantage_api_key

# Email Service (Nodemailer)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_specific_password

# Payment (Optional)
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_xxx

# CORS Origins (comma-separated)
ALLOWED_ORIGINS=https://yupacgo.com,https://www.yupacgo.com,http://localhost:5173
```

### Getting API Keys

**Finnhub** (Free tier available)
- Sign up at [finnhub.io](https://finnhub.io)
- Get your API key from dashboard
- Free tier: 60 calls/minute

**TwelveData** (Free tier available)
- Sign up at [twelvedata.com](https://twelvedata.com)
- Get your API key
- Free tier: 800 calls/day

**AlphaVantage** (Free tier available)
- Sign up at [alphavantage.co](https://www.alphavantage.co)
- Get your API key
- Free tier: 25 calls/day

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/              # Configuration files
│   │   ├── db.js           # MongoDB connection
│   │   ├── redis.js        # Redis connection
│   │   └── env.js          # Environment validation
│   │
│   ├── controllers/         # Request handlers
│   │   ├── auth.controllers.js
│   │   ├── onboarding.controller.js
│   │   ├── profile.controller.js
│   │   ├── stock.controller.js
│   │   ├── recommendation.controller.js
│   │   ├── watchlist.controller.js
│   │   ├── virtualPortfolio.controller.js
│   │   ├── notification.controller.js
│   │   └── admin.controller.js
│   │
│   ├── models/              # Mongoose schemas
│   │   ├── user.models.js
│   │   ├── userProfile.models.js
│   │   ├── onboarding.models.js
│   │   ├── recommendation.models.js
│   │   ├── watchlist.models.js
│   │   ├── virtualPortfolio.models.js
│   │   ├── notification.models.js
│   │   └── otp.models.js
│   │
│   ├── routes/              # API routes
│   │   ├── auth.routes.js
│   │   ├── onboarding.routes.js
│   │   ├── profile.routes.js
│   │   ├── stock.routes.js
│   │   ├── recommendation.routes.js
│   │   ├── watchlist.routes.js
│   │   ├── virtualPortfolio.routes.js
│   │   ├── notification.routes.js
│   │   └── admin.routes.js
│   │
│   ├── services/            # Business logic
│   │   ├── adapters/       # Stock data provider adapters
│   │   │   ├── baseAdapter.js
│   │   │   ├── finnhubAdapter.js
│   │   │   ├── twelveDataAdapter.js
│   │   │   └── alphaVantageAdapter.js
│   │   │
│   │   ├── recommendation.engine.v2.js  # Core recommendation logic
│   │   ├── providerManager.service.js   # Multi-provider orchestration
│   │   ├── priceAggregator.service.js   # Price data aggregation
│   │   ├── smartCache.service.js        # Intelligent caching
│   │   ├── providerHealth.service.js    # Provider monitoring
│   │   ├── priceMonitoring.service.js   # Price alert system
│   │   ├── notification.service.js      # Notification delivery
│   │   ├── email.service.js             # Email sending
│   │   ├── scheduler.service.js         # Cron jobs
│   │   └── profileCalculator.service.js # Risk profiling
│   │
│   └── middleware/          # Express middleware
│       ├── auth.middleware.js
│       ├── adminAuth.js
│       ├── ratelimit.js
│       └── activityLogger.js
│
├── scripts/                 # Utility scripts
│   └── seedAdmin.js        # Create admin user
│
├── tests/                   # Test files
│   ├── priceAggregator.property.test.js
│   ├── providerManager.property.test.js
│   └── smartCache.property.test.js
│
├── server.js               # Application entry point
├── package.json            # Dependencies
├── .env.exmaple           # Environment template
├── .gitignore             # Git ignore rules
├── API_DOCUMENTATION.md   # Complete API reference
└── RECOMMENDATION_ENGINE_EXPLAINED.md  # Engine documentation
```

---

## 📚 API Documentation

Complete API documentation is available in [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

### Quick Reference

**Base URL**: `https://yupacgo-prod-api.onrender.com/api`

### Authentication Endpoints
```
POST   /api/auth/register          # Register new user
POST   /api/auth/verify-email      # Verify email with OTP
POST   /api/auth/login             # Login user
POST   /api/auth/refresh-token     # Refresh JWT token
POST   /api/auth/forgot-password   # Request password reset
POST   /api/auth/reset-password    # Reset password with token
POST   /api/auth/resend-otp        # Resend verification OTP
```

### Onboarding Endpoints
```
POST   /api/onboarding             # Complete user onboarding
GET    /api/onboarding             # Get onboarding data
PUT    /api/onboarding             # Update onboarding
```

### Stock Endpoints
```
GET    /api/stocks/search          # Search stocks
GET    /api/stocks/popular         # Get popular stocks
GET    /api/stocks/:symbol         # Get stock details
GET    /api/stocks/:symbol/quote   # Get stock quote
GET    /api/stocks/:symbol/prices  # Price comparison
```

### Recommendation Endpoints
```
POST   /api/recommendations/generate        # Generate recommendations
GET    /api/recommendations                 # Get user recommendations
GET    /api/recommendations/:id             # Get specific recommendation
POST   /api/recommendations/:id/feedback    # Submit feedback
```

### Watchlist Endpoints
```
POST   /api/watchlist              # Add to watchlist
GET    /api/watchlist              # Get watchlist
DELETE /api/watchlist/:symbol      # Remove from watchlist
POST   /api/watchlist/:symbol/alert # Set price alert
```

### Portfolio Endpoints
```
POST   /api/portfolio/buy          # Buy stock
POST   /api/portfolio/sell         # Sell stock
GET    /api/portfolio              # Get portfolio
GET    /api/portfolio/performance  # Portfolio analytics
```

### Notification Endpoints
```
GET    /api/notifications          # Get notifications
PUT    /api/notifications/:id/read # Mark as read
GET    /api/notifications/preferences # Get preferences
PUT    /api/notifications/preferences # Update preferences
```

---

## 🧠 Core Services

### Recommendation Engine
The heart of Yupacgo - an intelligent system that analyzes user profiles and matches them with suitable investments.

**Key Features:**
- Multi-factor scoring algorithm
- Risk-based stock filtering
- Sector diversification
- Budget-aware recommendations
- Real-time market data integration

See [RECOMMENDATION_ENGINE_EXPLAINED.md](./RECOMMENDATION_ENGINE_EXPLAINED.md) for detailed documentation.

### Provider Manager
Orchestrates multiple stock data providers with intelligent failover and load balancing.

**Capabilities:**
- Multi-provider support (Finnhub, TwelveData, AlphaVantage)
- Automatic failover on provider errors
- Health monitoring and circuit breaking
- Rate limit management
- Response normalization

### Smart Cache Service
Redis-based caching with intelligent TTL management.

**Features:**
- Configurable cache durations per data type
- Automatic cache invalidation
- Cache hit/miss tracking
- Memory-efficient storage

### Price Aggregator
Combines price data from multiple sources for accuracy and reliability.

**Functions:**
- Multi-source price validation
- Confidence scoring
- Outlier detection
- Consensus pricing

### Price Monitoring Service
Background service for tracking watchlist prices and triggering alerts.

**Capabilities:**
- Scheduled price checks
- Alert threshold monitoring
- Notification triggering
- Performance optimization

---

## 🚢 Deployment

### Production Deployment (Render)

1. **Create Render Web Service**
   - Connect your GitHub repository
   - Select "Node" environment
   - Build command: `npm install`
   - Start command: `npm start`

2. **Configure Environment Variables**
   - Add all variables from `.env` in Render dashboard
   - Set `NODE_ENV=production`

3. **Add Redis Instance**
   - Create Redis instance on Render
   - Copy connection URL to `REDIS_URL`

4. **MongoDB Atlas Setup**
   - Create cluster on MongoDB Atlas
   - Whitelist Render IP addresses
   - Copy connection string to `MONGO_URI`

5. **Deploy**
   - Push to main branch
   - Render auto-deploys on push

### Health Check Endpoint
```bash
GET /api/health
```

### Verification Script
```bash
npm run verify
```

---

## 📜 Scripts

```bash
# Development
npm run dev          # Start with nodemon (auto-reload)

# Production
npm start            # Start server

# Testing
npm test             # Run tests

# Utilities
npm run verify       # Verify deployment
npm run build        # Build verification

# Database
node scripts/seedAdmin.js  # Create admin user
```

---

## 🔒 Security Features

- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcrypt with salt rounds
- **Rate Limiting**: Prevents brute force attacks
- **CORS Protection**: Configured allowed origins
- **Input Validation**: Request validation middleware
- **Activity Logging**: Tracks user actions
- **OTP Verification**: Email verification system

---

## 🎯 Performance Optimizations

- **Redis Caching**: Reduces API calls and database queries
- **Connection Pooling**: MongoDB connection optimization
- **Provider Failover**: Ensures high availability
- **Smart Cache TTL**: Balances freshness and performance
- **Batch Operations**: Efficient bulk data processing
- **Index Optimization**: Database query performance

---

## 🐛 Troubleshooting

### Common Issues

**MongoDB Connection Failed**
```bash
# Check MongoDB URI format
# Ensure IP whitelist includes your server
# Verify credentials
```

**Redis Connection Error**
```bash
# Check Redis URL format
# Ensure Redis server is running
# Verify network connectivity
```

**API Provider Errors**
```bash
# Verify API keys are correct
# Check rate limits
# Review provider status pages
```

**CORS Errors**
```bash
# Ensure frontend origin is in ALLOWED_ORIGINS
# Check CORS configuration in server.js
```

---

## 📈 Monitoring & Logs

### Activity Logs
All user actions are logged to MongoDB for audit trails.

### Provider Health
Monitor provider status and performance:
```javascript
// Check provider health
GET /api/admin/provider-health
```

### Error Tracking
Errors are logged with context for debugging.

---

## 🤝 Contributing

### Development Workflow

1. Create feature branch
```bash
git checkout -b feature/your-feature
```

2. Make changes and test
```bash
npm run dev
```

3. Run diagnostics
```bash
npm test
```

4. Commit and push
```bash
git add .
git commit -m "feat: your feature description"
git push origin feature/your-feature
```

5. Create pull request

### Code Style
- Use meaningful variable names
- Add comments for complex logic
- Follow existing patterns
- Keep functions focused and small

---

## 📞 Support

For issues, questions, or contributions:
- **Author**: Abdul-Lateef
- **Documentation**: See `API_DOCUMENTATION.md` and `RECOMMENDATION_ENGINE_EXPLAINED.md`
- **Issues**: Create GitHub issue

---

## 📄 License

ISC License

---

## 🎉 Acknowledgments

- Stock data provided by Finnhub, TwelveData, and AlphaVantage
- Built with Express.js and MongoDB
- Deployed on Render

---

**Made with ❤️ for Nigerian investors**