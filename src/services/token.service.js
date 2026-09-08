const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const RefreshToken = require("../models/refreshToken.models");
const env = require("../config/env");

/**
 * Token Service — access + refresh token issuance, verification, and
 * revocation. See refreshToken.models.js for why this exists.
 */

const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");

/** Short-lived JWT carried on every request. */
function signAccessToken(user, { expiresIn } = {}) {
    return jwt.sign(
        { userId: user._id, email: user.email, role: user.role },
        env.JWT_SECRET,
        { expiresIn: expiresIn || env.JWT_EXPIRES_IN }
    );
}

/**
 * Long-lived opaque refresh token. Persisted hashed; the raw value is
 * returned exactly once, to the client, and never stored in plaintext.
 */
async function issueRefreshToken(user, { userAgent, ipAddress } = {}) {
    const raw = crypto.randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
        userId: user._id,
        tokenHash: hash(raw),
        expiresAt,
        userAgent,
        ipAddress
    });

    return raw;
}

/**
 * Exchange a refresh token for a new access token (rotating the refresh
 * token itself — the old one is revoked and a new one issued on every use,
 * so a replayed/stolen refresh token can only ever be used once before the
 * legitimate owner's next refresh invalidates it).
 */
async function rotateRefreshToken(rawToken, user, meta = {}) {
    const record = await RefreshToken.findOne({
        tokenHash: hash(rawToken),
        revoked: false,
        expiresAt: { $gt: new Date() }
    });

    if (!record || String(record.userId) !== String(user._id)) {
        return null;
    }

    record.revoked = true;
    record.revokedAt = new Date();
    await record.save();

    const newRefreshToken = await issueRefreshToken(user, meta);
    const newAccessToken = signAccessToken(user);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

/** Revoke one specific refresh token (logout from this device). */
async function revokeRefreshToken(rawToken) {
    await RefreshToken.updateOne(
        { tokenHash: hash(rawToken) },
        { revoked: true, revokedAt: new Date() }
    );
}

/**
 * Revoke every refresh token for a user (logout from all devices).
 * Called on password reset/change so a stolen session can't persist past a
 * credential change — previously nothing did this at all.
 */
async function revokeAllRefreshTokens(userId) {
    await RefreshToken.updateMany(
        { userId, revoked: false },
        { revoked: true, revokedAt: new Date() }
    );
}

module.exports = {
    signAccessToken,
    issueRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
    revokeAllRefreshTokens
};
