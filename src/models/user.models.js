const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        fullname: { type: String, required: true },
        email: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        role: {
             type: String,
            enum: ["user", "admin"],
            default: "user"
        },
        onboarding: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Onboarding",
            default: null
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);