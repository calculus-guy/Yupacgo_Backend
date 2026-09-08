const User = require("../models/user.models");
const Onboarding = require("../models/onboarding.models");
const UserProfile = require("../models/userProfile.models");
const Watchlist = require("../models/watchlist.models");
const VirtualPortfolio = require("../models/virtualPortfolio.models");
const Notification = require("../models/notification.models");
const NotificationPreferences = require("../models/notificationPreferences.models");
const RecommendationSession = require("../models/recommendationSession.models");
const OTP = require("../models/otp.models");
const bcrypt = require("bcrypt");
const { sendOTP } = require("../services/email.service");
const { createOtp, verifyOtp, consumeOtp } = require("../services/otp.service");
const { revokeAllRefreshTokens } = require("../services/token.service");
const { validatePassword } = require("../validators/password.validator");
const { needsOnboardingRefresh } = require("../services/onboardingHealth.service");
const { asyncHandler } = require("../middleware/errorHandler");
const AppError = require("../utils/AppError");

/**
 * Request password change OTP (user is already authenticated)
 * POST /api/profile-management/request-password-change
 */
exports.requestPasswordChange = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) throw AppError.notFound("User not found");

    const otp = await createOtp({ userId, email: user.email, purpose: "password_change" });
    const emailSent = await sendOTP(user.email, otp, "password_change");

    if (!emailSent) {
        throw AppError.unavailable("Failed to send the code email. Please try again shortly.");
    }

    return res.json({
        status: "success",
        message: "Code sent to your email",
        data: { email: user.email, expiresIn: 300 }
    });
});

/**
 * Verify OTP for a password change
 * POST /api/profile-management/verify-otp
 */
exports.verifyOTP = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { otp } = req.body;
    if (!otp) throw AppError.badRequest("Code is required");

    const user = await User.findById(userId);
    if (!user) throw AppError.notFound("User not found");

    const result = await verifyOtp({ userId, email: user.email, otp, purpose: "password_change" });
    if (!result.valid) throw AppError.badRequest(otpFailureMessage(result), { code: result.reason });

    return res.json({ status: "success", message: "Code verified successfully", data: { otpId: result.record._id } });
});

/**
 * Change password with OTP (logged-in flow)
 * POST /api/profile-management/change-password
 */
exports.changePassword = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { otp, newPassword, confirmPassword } = req.body;

    if (!otp || !newPassword || !confirmPassword) throw AppError.badRequest("All fields are required");
    if (newPassword !== confirmPassword) throw AppError.badRequest("Passwords do not match");

    const passwordError = validatePassword(newPassword);
    if (passwordError) throw AppError.badRequest(passwordError);

    const user = await User.findById(userId);
    if (!user) throw AppError.notFound("User not found");

    const result = await verifyOtp({ userId, email: user.email, otp, purpose: "password_change" });
    if (!result.valid) throw AppError.badRequest(otpFailureMessage(result), { code: result.reason });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(userId, { password: hashedPassword });
    await consumeOtp(result.record);

    // Same reasoning as the forgot-password flow: a credential change should
    // end every other active session.
    await revokeAllRefreshTokens(userId);

    return res.json({ status: "success", message: "Password changed successfully" });
});

/**
 * Update profile info
 * PUT /api/profile-management/update
 */
exports.updateProfile = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { firstname, lastname } = req.body;

    const updates = {};
    if (firstname) updates.firstname = firstname;
    if (lastname) updates.lastname = lastname;

    const user = await User.findByIdAndUpdate(userId, updates, { new: true }).select("-password");

    return res.json({ status: "success", message: "Profile updated successfully", data: user });
});

/**
 * Get profile settings
 * GET /api/profile-management/settings
 *
 * This is what `getCurrentUser` calls on every page load/refresh (not just
 * login) — it previously returned the raw Mongoose user document, which has
 * `_id` rather than the `id` the frontend's `User` type expects, and carried
 * no `onboardingComplete`/`onboardingNeedsRefresh` at all. That mismatch is
 * why those flags could disappear on a refresh even though login computed
 * them correctly. Shaped to match the login/signup response exactly now.
 */
exports.getSettings = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.userId).select("-password").populate("onboarding");
    if (!user) throw AppError.notFound("User not found");

    const onboardingData = user.onboarding;
    const onboardingComplete = !!(
        onboardingData &&
        onboardingData.goal && onboardingData.risk && onboardingData.duration &&
        onboardingData.budget && onboardingData.experience && onboardingData.approach
    );

    return res.json({
        status: "success",
        data: {
            id: user._id,
            firstname: user.firstname,
            lastname: user.lastname,
            email: user.email,
            role: user.role,
            onboardingComplete,
            onboardingNeedsRefresh: needsOnboardingRefresh(onboardingData),
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        }
    });
});

/**
 * Delete account — and everything that belongs to it.
 * DELETE /api/profile-management/delete-account
 *
 * The original only deleted the User document (with a literal
 * `// TODO: Delete related data` left in place), orphaning the user's
 * onboarding, profile, watchlist, portfolio, notifications, and
 * recommendation history forever. This is also where the earlier
 * null-pointer bug lived (missing `if (!user)` check before reading
 * `user.password` — fixed here and preserved).
 */
exports.deleteAccount = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { password } = req.body;

    if (!password) throw AppError.badRequest("Password is required to delete account");

    const user = await User.findById(userId);
    if (!user) throw AppError.notFound("User not found");

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) throw AppError.badRequest("Invalid password");

    await Promise.all([
        Onboarding.deleteMany({ userId }),
        UserProfile.deleteOne({ userId }),
        Watchlist.deleteMany({ userId }),
        VirtualPortfolio.deleteOne({ userId }),
        Notification.deleteMany({ userId }),
        NotificationPreferences.deleteOne({ userId }),
        RecommendationSession.deleteMany({ userId }),
        OTP.deleteMany({ userId }),
        revokeAllRefreshTokens(userId)
    ]);

    await User.findByIdAndDelete(userId);

    return res.json({ status: "success", message: "Account deleted successfully" });
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
