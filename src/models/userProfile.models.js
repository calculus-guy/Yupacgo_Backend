const mongoose = require("mongoose");

const UserProfileSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true
        },
        
        riskScore: {
            type: Number,
            required: true,
            min: 1,
            max: 3
        },
        riskLevel: {
            type: String,
            enum: ["Conservative", "Balanced", "Aggressive"],
            required: true
        },
        
        experienceLevel: {
            type: String,
            enum: ["Beginner", "Intermediate", "Advanced"],
            required: true
        },
        investmentHorizon: {
            type: String,
            enum: ["short_term", "medium_term", "long_term", "very_long_term"],
            required: true
        },
        
        goal: {
            type: String,
            required: true
        },
        preferredSectors: {
            type: [String],
            default: []
        },
        
        monthlyBudget: {
            type: String,
            enum: ["low", "medium", "high"],
            required: true
        },
        
        approach: {
            type: String,
            enum: ["passive", "active"],
            required: true
        },
        
        profileType: {
            type: String,
            required: true
        }
    },
    { timestamps: true }
);

UserProfileSchema.index({ userId: 1 });

module.exports = mongoose.model("UserProfile", UserProfileSchema);