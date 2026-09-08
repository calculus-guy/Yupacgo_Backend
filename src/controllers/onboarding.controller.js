const Onboarding = require("../models/onboarding.models");
const User = require("../models/user.models");
const UserProfile = require("../models/userProfile.models");
const { computeProfile } = require("../services/profileCalculator.service");
const fx = require("../services/fx.service");
const { validateOnboardingPayload } = require("../validators/onboarding.validator");
const { asyncHandler } = require("../middleware/errorHandler");
const logger = require("../utils/logger");

exports.saveOnboarding = asyncHandler(async (req, res) => {
    const userId = req.user.userId;

    // Validated against the shared domain vocabulary — an unrecognised value
    // now fails clearly at the door instead of silently defaulting somewhere
    // downstream (which is exactly how every user ended up with the same
    // computed profile in the old code).
    const answers = validateOnboardingPayload(req.body);

    let record = await Onboarding.findOne({ userId });
    if (record) {
        Object.assign(record, answers);
        await record.save();
    } else {
        record = await Onboarding.create({ userId, ...answers });
        await User.findByIdAndUpdate(userId, { onboarding: record._id });
    }

    const { rate: ngnPerUsd, source: fxSource } = await fx.getNgnPerUsd();
    logger.debug("Computing profile with FX rate", { ngnPerUsd, fxSource, userId });

    const profileData = computeProfile(answers, { ngnPerUsd });

    let profile = await UserProfile.findOne({ userId });
    if (profile) {
        Object.assign(profile, profileData);
        await profile.save();
    } else {
        profile = await UserProfile.create({ userId, ...profileData });
    }

    return res.json({
        status: "success",
        message: "Onboarding saved and profile computed",
        data: { onboarding: record, profile }
    });
});

exports.getOnboarding = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.userId).populate("onboarding");

    if (!user || !user.onboarding) {
        return res.status(404).json({
            success: false,
            message: "No onboarding data found"
        });
    }

    res.status(200).json({ success: true, data: user.onboarding });
});
