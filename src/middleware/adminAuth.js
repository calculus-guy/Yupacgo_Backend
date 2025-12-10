const jwt = require("jsonwebtoken");
const User = require("../models/user.models");

/**
 * Admin authentication middleware
 * Verifies JWT token and checks if user has admin role
 */
exports.adminAuth = async (req, res, next) => {
    try {
        const token = req.header("Authorization")?.replace("Bearer ", "");
        
        if (!token) {
            return res.status(401).json({
                status: "error",
                message: "Access denied. No token provided."
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user and check admin role
        const user = await User.findById(decoded.userId).select("-password");
        
        if (!user) {
            return res.status(401).json({
                status: "error",
                message: "Invalid token. User not found."
            });
        }

        if (user.role !== "admin") {
            return res.status(403).json({
                status: "error",
                message: "Access denied. Admin privileges required."
            });
        }

        // Add user info to request
        req.user = {
            userId: user._id,
            email: user.email,
            firstname: user.firstname,
            lastname: user.lastname,
            role: user.role
        };

        next();
    } catch (error) {
        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                status: "error",
                message: "Invalid token."
            });
        }
        
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                status: "error",
                message: "Token expired."
            });
        }

        return res.status(500).json({
            status: "error",
            message: "Server error during authentication."
        });
    }
};