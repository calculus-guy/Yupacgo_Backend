const User = require("../models/user.models");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendWelcomeEmail } = require("../services/email.service");
const { logActivity } = require("../services/activityLogger.service");

exports.signup = async (req, res) => {
    try {
        const { firstname, lastname, email, password } = req.body;

        if (!firstname || !lastname || !email || !password)
            return res.json({ status: "error", message: "All fields required" });

        const existing = await User.findOne({ email });
        if (existing)
            return res.json({ status: "error", message: "Email already exists" });

        const hashed = await bcrypt.hash(password, 10);

        const user = await User.create({
            firstname,
            lastname,
            email,
            password: hashed
        });

        // Send welcome email (async, don't wait)
        sendWelcomeEmail(email, firstname).catch(err => 
            console.error("Failed to send welcome email:", err.message)
        );

        // Log signup activity
        logActivity({
            userId: user._id,
            action: "user_signup",
            details: { email },
            userInfo: { email, firstname, lastname },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get("User-Agent")
        }).catch(err => console.error("Activity logging failed:", err.message));

        return res.json({
            status: "success",
            message: "Signup successful",
            data: { id: user._id, firstname, lastname, email }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user)
            return res.json({ status: "error", message: "Invalid credentials" });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid)
            return res.json({ status: "error", message: "Invalid credentials" });

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        // Check if onboarding is actually complete by validating required fields exist in DB
        let onboardingComplete = false;
        if (user.onboarding) {
            const Onboarding = require("../models/onboarding.models");
            const onboardingData = await Onboarding.findById(user.onboarding);
            
            // Validate that all required onboarding fields are present and not empty
            onboardingComplete = !!(
                onboardingData &&
                onboardingData.goal &&
                onboardingData.risk &&
                onboardingData.duration &&
                onboardingData.budget &&
                onboardingData.experience &&
                onboardingData.approach
            );
        }

        // Log login activity
        logActivity({
            userId: user._id,
            action: "user_login",
            details: { email },
            userInfo: { email, firstname: user.firstname, lastname: user.lastname },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get("User-Agent")
        }).catch(err => console.error("Activity logging failed:", err.message));

        return res.json({
            status: "success",
            message: "Login successful",
            token,
            data: { 
                id: user._id, 
                firstname: user.firstname, 
                lastname: user.lastname, 
                email, 
                role: user.role,
                onboardingComplete
            }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

exports.adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email, role: "admin" });
        if (!user)
            return res.json({ status: "error", message: "Invalid admin credentials" });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid)
            return res.json({ status: "error", message: "Invalid admin credentials" });

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "24h" } // Shorter expiry for admin
        );

        return res.json({
            status: "success",
            message: "Admin login successful",
            token,
            data: { id: user._id, firstname: user.firstname, lastname: user.lastname, email, role: user.role }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};

exports.logout = async (req, res) => {
    try {
        // For JWT, logout is handled client-side by deleting the token
        // This endpoint can be used for logging or future token blacklisting
        
        return res.json({
            status: "success",
            message: "Logged out successfully"
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};
