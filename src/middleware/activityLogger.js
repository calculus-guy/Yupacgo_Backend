const { logActivity } = require("../services/activityLogger.service");

/**
 * Middleware to automatically log activities
 * Usage: router.post("/login", logActivityMiddleware("user_login"), loginController);
 */
const logActivityMiddleware = (action, getDetails = null) => {
    return async (req, res, next) => {
        // Store original res.json to intercept successful responses
        const originalJson = res.json;
        
        res.json = function(data) {
            // Only log if response is successful
            if (data && data.status === "success" && req.user) {
                const details = getDetails ? getDetails(req, data) : {};
                
                // Log activity asynchronously (don't wait)
                logActivity({
                    userId: req.user.userId,
                    action,
                    details,
                    userInfo: {
                        email: req.user.email,
                        firstname: req.user.firstname,
                        lastname: req.user.lastname
                    },
                    ipAddress: req.ip || req.connection.remoteAddress,
                    userAgent: req.get("User-Agent")
                }).catch(err => console.error("Activity logging failed:", err.message));
            }
            
            // Call original res.json
            return originalJson.call(this, data);
        };
        
        next();
    };
};

/**
 * Manual activity logging helper
 */
const logManualActivity = async (req, action, details = {}) => {
    if (!req.user) return;
    
    try {
        await logActivity({
            userId: req.user.userId,
            action,
            details,
            userInfo: {
                email: req.user.email,
                firstname: req.user.firstname,
                lastname: req.user.lastname
            },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get("User-Agent")
        });
    } catch (error) {
        console.error("Manual activity logging failed:", error.message);
    }
};

module.exports = {
    logActivityMiddleware,
    logManualActivity
};