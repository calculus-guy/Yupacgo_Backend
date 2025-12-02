const UserProfile = require("../models/userProfile.models");

/**
 * Get user's computed profile
 * GET /api/profile
 */
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.userId;

        const profile = await UserProfile.findOne({ userId });

        if (!profile) {
            return res.status(404).json({
                status: "error",
                message: "Profile not found. Please complete onboarding first."
            });
        }

        return res.json({
            status: "success",
            data: profile
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

/**
 * Get profile summary (lightweight version)
 * GET /api/profile/summary
 */
exports.getProfileSummary = async (req, res) => {
    try {
        const userId = req.user.userId;

        const profile = await UserProfile.findOne({ userId }).select(
            "riskLevel profileType experienceLevel investmentHorizon"
        );

        if (!profile) {
            return res.status(404).json({
                status: "error",
                message: "Profile not found"
            });
        }

        return res.json({
            status: "success",
            data: profile
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};
