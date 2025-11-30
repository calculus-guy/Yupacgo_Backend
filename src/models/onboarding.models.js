const mongoose = require("mongoose");

const OnboardingSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

        goal: String,
        risk: String,
        duration: String,
        budget: String,
        interest: [String],
        experience: String,
        approach: String
    },
    { timestamps: true }
);

module.exports = mongoose.model("Onboarding", OnboardingSchema);