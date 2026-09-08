const mongoose = require("mongoose");
const env = require("./env");
const logger = require("../utils/logger");

const connectDB = async () => {
    try {
        await mongoose.connect(env.MONGO_URI);
        logger.info("MongoDB connected");
    } catch (err) {
        logger.exception("MongoDB connection failed", err);
        process.exit(1);
    }
};

mongoose.connection.on("error", (err) => logger.exception("MongoDB runtime error", err));
mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));

module.exports = connectDB;
