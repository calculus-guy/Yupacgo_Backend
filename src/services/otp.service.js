const crypto = require("crypto");
const OTP = require("../models/otp.models");

/**
 * OTP Service — shared by password-reset, password-change, and (future)
 * email-verification flows.
 *
 * Centralising this fixes two issues that existed independently in
 * auth.controllers.js and profileManagement.controller.js:
 *   1. OTPs were generated with `Math.random()` — not cryptographically
 *      secure. Now uses `crypto.randomInt`.
 *   2. There was no cap on verification attempts. A 6-digit code has only
 *      1,000,000 combinations; with no lockout, that's a full brute-force
 *      account-takeover path. Every verification now goes through
 *      `verifyOtp`, which enforces OTP.MAX_ATTEMPTS and permanently
 *      invalidates the code once exceeded.
 */

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Cryptographically-random 6-digit code. Never starts-with-leading-zero-lost — always a string. */
function generateOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

/**
 * Create a fresh OTP, invalidating any prior unused one for the same
 * (identifier, purpose) so an old code can't be used alongside a new one.
 *
 * @param {Object} p
 * @param {String} [p.userId]
 * @param {String} p.email
 * @param {'password_change'|'password_reset'|'email_verification'} p.purpose
 * @returns {Promise<string>} the plaintext OTP (caller is responsible for emailing it)
 */
async function createOtp({ userId, email, purpose }) {
    const scope = userId ? { userId, purpose } : { email, purpose };
    await OTP.deleteMany(scope);

    const otp = generateOtp();
    await OTP.create({
        userId: userId || undefined,
        email,
        otp,
        purpose,
        expiresAt: new Date(Date.now() + OTP_TTL_MS)
    });

    return otp;
}

/**
 * Verify a submitted OTP with attempt-limiting.
 *
 * @param {Object} p
 * @param {String} [p.userId]
 * @param {String} p.email
 * @param {String} p.otp - the code the user submitted
 * @param {String} p.purpose
 * @returns {Promise<{valid:boolean, reason?:string, record?:Object}>}
 */
async function verifyOtp({ userId, email, otp, purpose }) {
    const scope = userId ? { userId, purpose } : { email, purpose };

    const record = await OTP.findOne({
        ...scope,
        used: false,
        expiresAt: { $gt: new Date() }
    });

    if (!record) {
        return { valid: false, reason: "not_found" };
    }

    if (record.attempts >= OTP.MAX_ATTEMPTS) {
        record.used = true; // permanently burn it — no more guesses against this code
        record.usedAt = new Date();
        await record.save();
        return { valid: false, reason: "too_many_attempts" };
    }

    if (record.otp !== otp) {
        record.attempts += 1;
        await record.save();
        return {
            valid: false,
            reason: "incorrect",
            attemptsRemaining: Math.max(0, OTP.MAX_ATTEMPTS - record.attempts)
        };
    }

    return { valid: true, record };
}

/** Mark an OTP record as consumed after it has been successfully used. */
async function consumeOtp(record) {
    record.used = true;
    record.usedAt = new Date();
    await record.save();
}

module.exports = { generateOtp, createOtp, verifyOtp, consumeOtp };
