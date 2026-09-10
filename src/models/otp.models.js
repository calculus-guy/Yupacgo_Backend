const mongoose = require("mongoose");

/**
 * OTP Model
 *
 * `attempts` + `MAX_ATTEMPTS` added — the original had no attempt limit at
 * all on a 6-digit code (1,000,000 combinations), which is a full
 * brute-force account-takeover path. See otp.service.js for the enforcement.
 */
const MAX_ATTEMPTS = 5;

const OTPSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false, // Not required for password reset (use email instead)
            index: true
        },

        // lowercase+trim at the schema level, same reasoning as User.email —
        // see normalizeEmail.js.
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },

        otp: {
            type: String,
            required: true
        },

        purpose: {
            type: String,
            enum: ["password_change", "email_verification", "password_reset"],
            required: true
        },

        expiresAt: {
            type: Date,
            required: true,
            default: () => new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
            // TTL index declared below (needs expireAfterSeconds, so it can't
            // also be declared as `index: true` here without duplicating it).
        },

        attempts: {
            type: Number,
            default: 0
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

OTPSchema.statics.MAX_ATTEMPTS = MAX_ATTEMPTS;

module.exports = mongoose.model("OTP", OTPSchema);
