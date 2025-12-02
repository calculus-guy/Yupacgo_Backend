const User = require("../models/user.models");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

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
            { expiresIn: "1d" }
        );

        return res.json({
            status: "success",
            message: "Login successful",
            token,
            data: { id: user._id, firstname: user.firstname, lastname: user.lastname, email, role: user.role }
        });
    } catch (error) {
        return res.status(500).json({ status: "error", message: error.message });
    }
};
