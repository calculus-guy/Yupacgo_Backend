const UserProfile = require("../models/userProfile.models");
const { asyncHandler } = require("../middleware/errorHandler");
const AppError = require("../utils/AppError");

/**
 * Get user's computed profile
 * GET /api/profile
 */
exports.getProfile = asyncHandler(async (req, res) => {
    const profile = await UserProfile.findOne({ userId: req.user.userId });
    if (!profile) throw AppError.notFound("Profile not found. Please complete onboarding first.");

    return res.json({ status: "success", data: profile });
});

/**
 * Get profile summary (lightweight version)
 * GET /api/profile/summary
 */
exports.getProfileSummary = asyncHandler(async (req, res) => {
    const profile = await UserProfile.findOne({ userId: req.user.userId })
        .select("riskLevel profileType experienceLevel investmentHorizon");
    if (!profile) throw AppError.notFound("Profile not found");

    return res.json({ status: "success", data: profile });
});
