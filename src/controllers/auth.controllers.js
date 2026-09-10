const User = require("../models/user.models");
const Onboarding = require("../models/onboarding.models");
const bcrypt = require("bcrypt");
const { sendWelcomeEmail, sendOTP } = require("../services/email.service");
const { logActivity } = require("../services/activityLogger.service");
const { createWelcomeNotification } = require("../services/notification.service");
const { createOtp, verifyOtp, consumeOtp } = require("../services/otp.service");
const { signAccessToken, issueRefreshToken, revokeRefreshToken, revokeAllRefreshTokens } = require("../services/token.service");
const { validatePassword } = require("../validators/password.validator");
const { needsOnboardingRefresh } = require("../services/onboardingHealth.service");
const { normalizeEmail } = require("../utils/normalizeEmail");
const { asyncHandler } = require("../middleware/errorHandler");
const AppError = require("../utils/AppError");

const clientMeta = (req) => ({
    userAgent: req.get("User-Agent"),
    ipAddress: req.ip
});

exports.signup = asyncHandler(async (req, res) => {
    let { firstname, lastname, email, password } = req.body;

    if (!firstname || !lastname || !email || !password) {
        throw AppError.badRequest("All fields are required");
    }
    email = normalizeEmail(email);

    const passwordError = validatePassword(password);
    if (passwordError) throw AppError.badRequest(passwordError);

    const existing = await User.findOne({ email });
    if (existing) throw AppError.conflict("An account with this email already exists");

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ firstname, lastname, email, password: hashed });

    // Best-effort side effects — none of these should fail the signup itself.
    sendWelcomeEmail(email, firstname).catch(() => {});
    createWelcomeNotification(user._id, firstname).catch(() => {});
    logActivity({
        userId: user._id,
        action: "user_signup",
        details: { email },
        userInfo: { email, firstname, lastname },
        ...clientMeta(req)
    }).catch(() => {});

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user, clientMeta(req));

    return res.status(201).json({
        status: "success",
        message: "Signup successful",
        token: accessToken,
        refreshToken,
        data: {
            id: user._id, firstname, lastname, email,
            role: user.role, onboardingComplete: false
        }
    });
});

exports.login = asyncHandler(async (req, res) => {
    let { email, password } = req.body;

    if (!email || !password) throw AppError.badRequest("Email and password are required");
    email = normalizeEmail(email);

    const user = await User.findOne({ email });
    // Deliberately generic message on both branches below — confirming an
    // email doesn't exist is a free account-enumeration oracle for an attacker.
    if (!user) throw AppError.unauthorized("Invalid email or password");

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw AppError.unauthorized("Invalid email or password");

    let onboardingComplete = false;
    let onboardingNeedsRefresh = false;
    if (user.onboarding) {
        const onboardingData = await Onboarding.findById(user.onboarding);
        onboardingComplete = !!(
            onboardingData &&
            onboardingData.goal && onboardingData.risk && onboardingData.duration &&
            onboardingData.budget && onboardingData.experience && onboardingData.approach
        );
        onboardingNeedsRefresh = needsOnboardingRefresh(onboardingData);
    }

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user, clientMeta(req));

    logActivity({
        userId: user._id,
        action: "user_login",
        details: { email },
        userInfo: { email, firstname: user.firstname, lastname: user.lastname },
        ...clientMeta(req)
    }).catch(() => {});

    return res.json({
        status: "success",
        message: "Login successful",
        token: accessToken,
        refreshToken,
        data: {
            id: user._id, firstname: user.firstname, lastname: user.lastname,
            email, role: user.role, onboardingComplete, onboardingNeedsRefresh
        }
    });
});

exports.adminLogin = asyncHandler(async (req, res) => {
    let { email, password } = req.body;
    if (!email || !password) throw AppError.badRequest("Email and password are required");
    email = normalizeEmail(email);

    const user = await User.findOne({ email, role: "admin" });
    if (!user) throw AppError.unauthorized("Invalid admin credentials");

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw AppError.unauthorized("Invalid admin credentials");

    // Shorter-lived than a normal session — admin access deserves a tighter blast radius.
    const accessToken = signAccessToken(user, { expiresIn: "4h" });
    const refreshToken = await issueRefreshToken(user, clientMeta(req));

    return res.json({
        status: "success",
        message: "Admin login successful",
        token: accessToken,
        refreshToken,
        data: { id: user._id, firstname: user.firstname, lastname: user.lastname, email, role: user.role }
    });
});

/**
 * Exchange a refresh token for a new access token, rotating the refresh
 * token in the process. There was previously no refresh endpoint at all,
 * despite REFRESH_TOKEN_SECRET being defined — sessions had no way to renew
 * short of a full re-login (or, as shipped, just lasted 7 days flat).
 */
exports.refreshToken = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) throw AppError.badRequest("refreshToken is required");

    // We need to know which user this claims to belong to before we can look
    // up and rotate their token record — but we don't trust the request's
    // claim without the DB-backed hash matching, which rotateRefreshToken enforces.
    const RefreshToken = require("../models/refreshToken.models");
    const crypto = require("crypto");
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    const record = await RefreshToken.findOne({ tokenHash, revoked: false, expiresAt: { $gt: new Date() } });
    if (!record) throw AppError.unauthorized("Invalid or expired refresh token");

    const user = await User.findById(record.userId);
    if (!user) throw AppError.unauthorized("Invalid or expired refresh token");

    const { rotateRefreshToken } = require("../services/token.service");
    const rotated = await rotateRefreshToken(refreshToken, user, clientMeta(req));
    if (!rotated) throw AppError.unauthorized("Invalid or expired refresh token");

    return res.json({
        status: "success",
        token: rotated.accessToken,
        refreshToken: rotated.refreshToken
    });
});

exports.logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (refreshToken) await revokeRefreshToken(refreshToken);

    return res.json({ status: "success", message: "Logged out successfully" });
});

/**
 * Forgot Password — Request OTP
 * POST /api/auth/forgot-password
 */
exports.forgotPassword = asyncHandler(async (req, res) => {
    let { email } = req.body;
    if (!email) throw AppError.badRequest("Email is required");
    email = normalizeEmail(email);

    const genericResponse = {
        status: "success",
        message: "If an account with this email exists, you will receive a password reset code",
        data: { email, expiresIn: 300 }
    };

    const user = await User.findOne({ email });
    // Don't reveal whether the email exists — same response either way.
    if (!user) return res.json(genericResponse);

    const otp = await createOtp({ email, purpose: "password_reset" });
    const emailSent = await sendOTP(email, otp, "password_reset");

    if (!emailSent) {
        throw AppError.unavailable("Failed to send the reset code email. Please try again shortly.");
    }

    logActivity({
        userId: user._id,
        action: "password_reset_requested",
        details: { email },
        userInfo: { email, firstname: user.firstname, lastname: user.lastname },
        ...clientMeta(req)
    }).catch(() => {});

    return res.json(genericResponse);
});

/**
 * Verify Password Reset OTP (preview step — does not consume the code)
 * POST /api/auth/verify-reset-otp
 */
exports.verifyResetOTP = asyncHandler(async (req, res) => {
    let { email, otp } = req.body;
    if (!email || !otp) throw AppError.badRequest("Email and code are required");
    email = normalizeEmail(email);

    const result = await verifyOtp({ email, otp, purpose: "password_reset" });

    if (!result.valid) {
        throw AppError.badRequest(otpFailureMessage(result), { code: result.reason });
    }

    return res.json({
        status: "success",
        message: "Code verified successfully",
        data: { email, otpId: result.record._id, canResetPassword: true }
    });
});

/**
 * Reset Password with OTP
 * POST /api/auth/reset-password
 */
exports.resetPassword = asyncHandler(async (req, res) => {
    let { email, otp, newPassword, confirmPassword } = req.body;

    if (!email || !otp || !newPassword || !confirmPassword) {
        throw AppError.badRequest("All fields are required");
    }
    email = normalizeEmail(email);
    if (newPassword !== confirmPassword) {
        throw AppError.badRequest("Passwords do not match");
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) throw AppError.badRequest(passwordError);

    const user = await User.findOne({ email });
    if (!user) throw AppError.notFound("User not found");

    const result = await verifyOtp({ email, otp, purpose: "password_reset" });
    if (!result.valid) {
        throw AppError.badRequest(otpFailureMessage(result), { code: result.reason });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(user._id, { password: hashedPassword });
    await consumeOtp(result.record);

    // A password reset should end every existing session, not just this
    // request's — otherwise a stolen token silently keeps working.
    await revokeAllRefreshTokens(user._id);

    logActivity({
        userId: user._id,
        action: "password_reset_completed",
        details: { email },
        userInfo: { email, firstname: user.firstname, lastname: user.lastname },
        ...clientMeta(req)
    }).catch(() => {});

    return res.json({
        status: "success",
        message: "Password reset successfully. You can now log in with your new password."
    });
});

function otpFailureMessage(result) {
    if (result.reason === "too_many_attempts") {
        return "Too many incorrect attempts. Please request a new code.";
    }
    if (result.reason === "incorrect") {
        return `Incorrect code. ${result.attemptsRemaining} attempt(s) remaining.`;
    }
    return "Invalid or expired code";
}
