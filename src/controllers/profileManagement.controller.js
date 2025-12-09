const User = require("../models/user.models");
const OTP = require("../models/otp.models");
const bcrypt = require("bcrypt");
const { sendOTP } = require("../services/email.service");

/**
 * Generate 6-digit OTP
 */
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Request password change OTP
 * POST /api/profile/request-password-change
 */
exports.requestPasswordChange = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                status: "error",
                message: "User not found"
            });
        }

        // Generate OTP
        const otp = generateOTP();

        // Delete any existing OTPs for this user
        await OTP.deleteMany({ userId, purpose: "password_change" });

        // Create new OTP
        await OTP.create({
            userId,
            email: user.email,
            otp,
            purpose: "password_change"
        });

        // Send OTP via email
        await sendOTP(user.email, otp, "password_change");

        return res.json({
            status: "success",
            message: "OTP sent to your email",
            data: {
                email: user.email,
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
 * Verify OTP
 * POST /api/profile/verify-otp
 */
exports.verifyOTP = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { otp } = req.body;

        if (!otp) {
            return res.status(400).json({
                status: "error",
                message: "OTP is required"
            });
        }

        // Find OTP
        const otpRecord = await OTP.findOne({
            userId,
            otp,
            purpose: "password_change",
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
                otpId: otpRecord._id
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
 * Change password with OTP
 * POST /api/profile/change-password
 */
exports.changePassword = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { otp, newPassword, confirmPassword } = req.body;

        // Validation
        if (!otp || !newPassword || !confirmPassword) {
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

        // Verify OTP
        const otpRecord = await OTP.findOne({
            userId,
            otp,
            purpose: "password_change",
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
        await User.findByIdAndUpdate(userId, { password: hashedPassword });

        // Mark OTP as used
        otpRecord.used = true;
        otpRecord.usedAt = new Date();
        await otpRecord.save();

        return res.json({
            status: "success",
            message: "Password changed successfully"
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Update profile info
 * PUT /api/profile/update
 */
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { firstname, lastname } = req.body;

        const updates = {};
        if (firstname) updates.firstname = firstname;
        if (lastname) updates.lastname = lastname;

        const user = await User.findByIdAndUpdate(
            userId,
            updates,
            { new: true }
        ).select("-password");

        return res.json({
            status: "success",
            message: "Profile updated successfully",
            data: user
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get profile settings
 * GET /api/profile/settings
 */
exports.getSettings = async (req, res) => {
    try {
        const userId = req.user.userId;

        const user = await User.findById(userId).select("-password");

        if (!user) {
            return res.status(404).json({
                status: "error",
                message: "User not found"
            });
        }

        return res.json({
            status: "success",
            data: user
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Delete account
 * DELETE /api/profile/delete-account
 */
exports.deleteAccount = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({
                status: "error",
                message: "Password is required to delete account"
            });
        }

        // Verify password
        const user = await User.findById(userId);
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(400).json({
                status: "error",
                message: "Invalid password"
            });
        }

        // Delete user and related data
        await User.findByIdAndDelete(userId);
        // TODO: Delete related data (onboarding, profile, notifications, etc.)

        return res.json({
            status: "success",
            message: "Account deleted successfully"
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};
