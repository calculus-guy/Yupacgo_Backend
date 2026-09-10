const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        firstname: { type: String, required: true },
        lastname: { type: String, required: true },
        // lowercase+trim at the schema level so this holds even for any future
        // write path that forgets to normalize explicitly (see normalizeEmail.js).
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
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