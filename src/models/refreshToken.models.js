const mongoose = require("mongoose");

/**
 * Refresh Token Model
 *
 * WHY THIS EXISTS: the original issued a single JWT with a hardcoded 7-day
 * expiry (ignoring the `JWT_EXPIRES_IN=1d` already sitting in `.env`), no
 * refresh mechanism despite `REFRESH_TOKEN_SECRET` being defined, and no way
 * to revoke a token short of waiting out the full week. A stolen token was
 * valid for up to 7 days with nothing anyone could do about it.
 *
 * Now: access tokens are short-lived (see env.JWT_EXPIRES_IN, default 2h) and
 * this table backs a real, revocable refresh flow — logout, password
 * change/reset, and account deletion all revoke the tokens stored here.
 *
 * The token itself is stored hashed (SHA-256) — never the raw value — so a
 * database read alone can't be used to impersonate a session, mirroring how
 * passwords are handled.
 */
const RefreshTokenSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        tokenHash: {
            type: String,
            required: true,
            unique: true
        },

        expiresAt: {
            type: Date,
            required: true
            // TTL index declared below
        },

        revoked: {
            type: Boolean,
            default: false
        },

        revokedAt: Date,

        userAgent: String,
        ipAddress: String
    },
    { timestamps: true }
);

// TTL cleanup — no need to keep expired tokens around.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", RefreshTokenSchema);
