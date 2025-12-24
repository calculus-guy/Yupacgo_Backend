const User = require("../models/user.models");
const OTP = require("../models/otp.models");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendWelcomeEmail, sendOTP } = require("../services/email.service");
const { logActivity } = require("../services/activityLogger.service");
const { createWelcomeNotification } = require("../services/notification.service");

exports.signup = async (req, res) => {
    try {
        const { firstname, lastname, email, password } = req.body;

        if (!firstname || !lastname || !email || !password)
            return res.json({ status: "error", message: "All fields required" });

        const existing = await User.findOne({ email });
        if (existing)
            return res.json({ status: "error", message: "Email already exists" });

        const hashed = await bcrypt.hash(password, 10);

        const user = await User.create({
            firstname,
            lastname,
            email,
            password: hashed
        });

        // Send welcome email (async, don't wait)
        sendWelcomeEmail(email, firstname).catch(err => 
            console.error("Failed to send welcome email:", err.message)
        );

        // Create welcome notification (async, don't wait)
        createWelcomeNotification(user._id, firstname).catch(err =>
            console.error("Failed to create welcome notification:", err.message)
        );

        // Log signup activity
        logActivity({
            userId: user._id,
            action: "user_signup",
            details: { email },
            userInfo: { email, firstname, lastname },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get("User-Agent")
        }).catch(err => console.error("Activity logging failed:", err.message));

        return res.json({
            status: "success",
            message: "Signup successful",
            data: { id: user._id, firstname, lastname, email }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user)
            return res.json({ status: "error", message: "Invalid credentials" });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid)
            return res.json({ status: "error", message: "Invalid credentials" });

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        // Check if onboarding is actually complete by validating required fields exist in DB
        let onboardingComplete = false;
        if (user.onboarding) {
            const Onboarding = require("../models/onboarding.models");
            const onboardingData = await Onboarding.findById(user.onboarding);
            
            // Validate that all required onboarding fields are present and not empty
            onboardingComplete = !!(
                onboardingData &&
                onboardingData.goal &&
                onboardingData.risk &&
                onboardingData.duration &&
                onboardingData.budget &&
                onboardingData.experience &&
                onboardingData.approach
            );
        }

        // Log login activity
        logActivity({
            userId: user._id,
            action: "user_login",
            details: { email },
            userInfo: { email, firstname: user.firstname, lastname: user.lastname },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get("User-Agent")
        }).catch(err => console.error("Activity logging failed:", err.message));

        return res.json({
            status: "success",
            message: "Login successful",
            token,
            data: { 
                id: user._id, 
                firstname: user.firstname, 
                lastname: user.lastname, 
                email, 
                role: user.role,
                onboardingComplete
            }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

exports.adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email, role: "admin" });
        if (!user)
            return res.json({ status: "error", message: "Invalid admin credentials" });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid)
            return res.json({ status: "error", message: "Invalid admin credentials" });

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "24h" } // Shorter expiry for admin
        );

        return res.json({
            status: "success",
            message: "Admin login successful",
            token,
            data: { id: user._id, firstname: user.firstname, lastname: user.lastname, email, role: user.role }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

exports.logout = async (req, res) => {
    try {
        // For JWT, logout is handled client-side by deleting the token
        // This endpoint can be used for logging or future token blacklisting
        
        return res.json({
            status: "success",
            message: "Logged out successfully"
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};
/**
 * Generate 6-digit OTP
 */
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Forgot Password - Request OTP
 * POST /api/auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                status: "error",
                message: "Email is required"
            });
        }

        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            // Don't reveal if email exists or not for security
            return res.json({
                status: "success",
                message: "If an account with this email exists, you will receive a password reset OTP",
                data: {
                    email,
                    expiresIn: 300 // 5 minutes in seconds
                }
            });
        }

        // Generate OTP
        const otp = generateOTP();

        // Delete any existing password reset OTPs for this email
        await OTP.deleteMany({ email, purpose: "password_reset" });

        // Create new OTP (without userId for password reset)
        await OTP.create({
            email,
            otp,
            purpose: "password_reset"
        });

        // Send OTP via email
        const emailSent = await sendOTP(email, otp, "password_reset");

        if (!emailSent) {
            return res.status(500).json({
                status: "error",
                message: "Failed to send OTP email. Please try again."
            });
        }

        // Log password reset request
        logActivity({
            userId: user._id,
            action: "password_reset_requested",
            details: { email },
            userInfo: { email, firstname: user.firstname, lastname: user.lastname },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get("User-Agent")
        }).catch(err => console.error("Activity logging failed:", err.message));

        return res.json({
            status: "success",
            message: "Password reset OTP sent to your email",
            data: {
                email,
                expiresIn: 300 // 5 minutes in seconds
            }
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Verify Password Reset OTP
 * POST /api/auth/verify-reset-otp
 */
exports.verifyResetOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                status: "error",
                message: "Email and OTP are required"
            });
        }

        // Find OTP
        const otpRecord = await OTP.findOne({
            email,
            otp,
            purpose: "password_reset",
            used: false,
            expiresAt: { $gt: new Date() }
        });

        if (!otpRecord) {
            return res.status(400).json({
                status: "error",
                message: "Invalid or expired OTP"
            });
        }

        return res.json({
            status: "success",
            message: "OTP verified successfully",
            data: {
                email,
                otpId: otpRecord._id,
                canResetPassword: true
            }
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Reset Password with OTP
 * POST /api/auth/reset-password
 */
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword, confirmPassword } = req.body;

        // Validation
        if (!email || !otp || !newPassword || !confirmPassword) {
            return res.status(400).json({
                status: "error",
                message: "All fields are required"
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                status: "error",
                message: "Passwords do not match"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                status: "error",
                message: "Password must be at least 6 characters"
            });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                status: "error",
                message: "User not found"
            });
        }

        // Verify OTP
        const otpRecord = await OTP.findOne({
            email,
            otp,
            purpose: "password_reset",
            used: false,
            expiresAt: { $gt: new Date() }
        });

        if (!otpRecord) {
            return res.status(400).json({
                status: "error",
                message: "Invalid or expired OTP"
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await User.findByIdAndUpdate(user._id, { password: hashedPassword });

        // Mark OTP as used
        otpRecord.used = true;
        otpRecord.usedAt = new Date();
        await otpRecord.save();

        // Log password reset success
        logActivity({
            userId: user._id,
            action: "password_reset_completed",
            details: { email },
            userInfo: { email, firstname: user.firstname, lastname: user.lastname },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get("User-Agent")
        }).catch(err => console.error("Activity logging failed:", err.message));

        return res.json({
            status: "success",
            message: "Password reset successfully. You can now login with your new password."
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};