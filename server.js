require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./src/config/db");
const { connectRedis } = require("./src/config/redis");
const { initializeTransporter } = require("./src/services/email.service");
const { initializeScheduler } = require("./src/services/scheduler.service");

const authRoutes = require("./src/routes/auth.routes");
const onboardingRoutes = require("./src/routes/onboarding.routes");
const profileRoutes = require("./src/routes/profile.routes");
const stockRoutes = require("./src/routes/stock.routes");
const recommendationRoutes = require("./src/routes/recommendation.routes");
const watchlistRoutes = require("./src/routes/watchlist.routes");
const notificationRoutes = require("./src/routes/notification.routes");
const profileManagementRoutes = require("./src/routes/profileManagement.routes");
const virtualPortfolioRoutes = require("./src/routes/virtualPortfolio.routes");
const adminRoutes = require("./src/routes/admin.routes");

const app = express();

app.use(express.json());
app.use(cors());

connectDB();
connectRedis();
initializeTransporter();
initializeScheduler();

app.use("/api/auth", authRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/stocks", stockRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/profile-management", profileManagementRoutes);
app.use("/api/portfolio", virtualPortfolioRoutes);
app.use("/api/admin", adminRoutes);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));