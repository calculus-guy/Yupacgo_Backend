require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("../src/models/user.models");

const seedAdmin = async () => {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        // Check if admin already exists
        const existingAdmin = await User.findOne({ role: "admin" });
        if (existingAdmin) {
            console.log("Admin user already exists:", existingAdmin.email);
            process.exit(0);
        }

        // Create admin user
        const adminPassword = process.env.ADMIN_PASSWORD;
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        const admin = await User.create({
            firstname: "Abdul-Lateef",
            lastname: "Sakariyau",
            email: process.env.ADMIN_EMAIL,
            password: hashedPassword,
            role: "admin"
        });

        console.log("✅ Admin user created successfully!");
        console.log("Email:", admin.email);
        console.log("Password:", adminPassword);
        console.log("⚠️  Please change the password after first login!");

    } catch (error) {
        console.error("❌ Error creating admin user:", error.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

seedAdmin();