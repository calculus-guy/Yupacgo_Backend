const mongoose = require("mongoose");

/**
 * OTP Model
 * Stores one-time passwords for verification
 */
const OTPSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        email: {
            type: String,
            required: true
        },

        otp: {
            type: String,
            required: true
        },

        purpose: {
            type: String,
            enum: ["password_change", "email_verification"],
            required: true
        },

        expiresAt: {
            type: Date,
            required: true,
            default: () => new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
            index: true
        },

        used: {
            type: Boolean,
            default: false
        },

        usedAt: Date
    },
    { timestamps: true }
);

// TTL index for auto-deletion
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OTP", OTPSchema);
