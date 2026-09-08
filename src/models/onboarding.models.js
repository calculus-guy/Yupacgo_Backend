const mongoose = require("mongoose");
const { GOALS, RISKS, DURATIONS, BUDGETS, INTERESTS, EXPERIENCES, APPROACHES } = require("../constants/domain");

/**
 * Enums added here (previously plain `String`) so a malformed value is
 * rejected by Mongoose at the storage layer as defense-in-depth, in addition
 * to the request-level validation in onboarding.validators.js. The two used
 * to be able to drift silently; both now read from constants/domain.js.
 */
const OnboardingSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

        goal: { type: String, enum: GOALS, required: true },
        risk: { type: String, enum: RISKS, required: true },
        duration: { type: String, enum: DURATIONS, required: true },
        budget: { type: String, enum: BUDGETS, required: true },
        interest: { type: [String], enum: INTERESTS, default: [] },
        experience: { type: String, enum: EXPERIENCES, required: true },
        approach: { type: String, enum: APPROACHES, required: true }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Onboarding", OnboardingSchema);
