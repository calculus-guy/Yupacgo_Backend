const axios = require("axios");

/**
 * Email Service using Resend (HTTP API)
 * Sends emails for OTP, notifications, etc.
 *
 * Switched from SMTP (nodemailer) to Resend because Render blocks outbound
 * traffic on SMTP ports (25/465/587) on its web services - Resend sends over
 * HTTPS so it isn't affected.
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = `Yupacgo <${process.env.EMAIL_FROM || "hello@yupacgo.com"}>`;

/**
 * Check email configuration at startup
 */
const initializeTransporter = () => {
    if (!process.env.RESEND_API_KEY) {
        console.log("⚠️  Email not configured (RESEND_API_KEY missing). Email sending disabled.");
        return null;
    }

    console.log("✅ Email service initialized (Resend)");
    return true;
};

/**
 * Send an email via the Resend HTTP API
 * @param {String} to - Recipient email
 * @param {String} subject - Email subject
 * @param {String} html - Email HTML body
 * @returns {Promise<Boolean>} Whether the send succeeded
 */
const sendViaResend = async (to, subject, html) => {
    if (!process.env.RESEND_API_KEY) {
        console.log("Email not configured, email not sent");
        return false;
    }

    try {
        const response = await axios.post(
            RESEND_API_URL,
            {
                from: FROM_ADDRESS,
                to,
                subject,
                html
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                    "Content-Type": "application/json"
                },
                timeout: 15000
            }
        );

        console.log(`✅ Email sent to ${to} (id: ${response.data?.id})`);
        return true;
    } catch (error) {
        const details = error.response?.data || error.message;
        console.error("Error sending email via Resend:", details);
        return false;
    }
};

/**
 * Send OTP email
 * @param {String} email - Recipient email
 * @param {String} otp - OTP code
 * @param {String} purpose - Purpose of OTP
 */
const sendOTP = async (email, otp, purpose = "password_change") => {
    let subject, html;

    if (purpose === "password_reset") {
        subject = "Password Reset OTP - Yupacgo";
        html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
                    .content { background: #f9f9f9; padding: 30px; }
                    .otp-box { background: white; border: 2px solid #4F46E5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; }
                    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                    .warning { background: #FEF2F2; border: 1px solid #FECACA; padding: 15px; border-radius: 5px; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔐 Password Reset</h1>
                    </div>
                    <div class="content">
                        <h2>Reset Your Password</h2>
                        <p>You requested to reset your password for your Yupacgo account.</p>
                        <p>Use the following OTP code to reset your password:</p>
                        <div class="otp-box">${otp}</div>
                        <div class="warning">
                            <p><strong>⚠️ Security Notice:</strong></p>
                            <ul>
                                <li>This code will expire in <strong>5 minutes</strong></li>
                                <li>Never share this code with anyone</li>
                                <li>If you didn't request this, please ignore this email</li>
                            </ul>
                        </div>
                        <p>After entering this code, you'll be able to set a new password for your account.</p>
                    </div>
                    <div class="footer">
                        <p>© 2025 Yupacgo. All rights reserved.</p>
                        <p>This is an automated email. Please do not reply.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    } else {
        // Original password change template
        subject = purpose === "password_change"
            ? "Password Change OTP - Yupacgo"
            : "Email Verification OTP - Yupacgo";

        html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
                    .content { background: #f9f9f9; padding: 30px; }
                    .otp-box { background: white; border: 2px solid #4F46E5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; }
                    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Yupacgo</h1>
                    </div>
                    <div class="content">
                        <h2>Your OTP Code</h2>
                        <p>You requested to ${purpose === "password_change" ? "change your password" : "verify your email"}.</p>
                        <p>Use the following OTP code:</p>
                        <div class="otp-box">${otp}</div>
                        <p><strong>This code will expire in 5 minutes.</strong></p>
                        <p>If you didn't request this, please ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>© 2025 Yupacgo. All rights reserved.</p>
                        <p>This is an automated email. Please do not reply.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    return await sendViaResend(email, subject, html);
};

/**
 * Send notification email
 * @param {String} email - Recipient email
 * @param {String} title - Notification title
 * @param {String} message - Notification message
 */
const sendNotificationEmail = async (email, title, message) => {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
                .content { background: #f9f9f9; padding: 30px; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Yupacgo</h1>
                </div>
                <div class="content">
                    <h2>${title}</h2>
                    <p>${message}</p>
                    <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" style="background: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">View on Yupacgo</a></p>
                </div>
                <div class="footer">
                    <p>© 2025 Yupacgo. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    return await sendViaResend(email, title, html);
};

/**
 * Send welcome email
 * @param {String} email - Recipient email
 * @param {String} name - User's name
 */
const sendWelcomeEmail = async (email, name) => {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
                .content { background: #f9f9f9; padding: 30px; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Welcome to Yupacgo!</h1>
                </div>
                <div class="content">
                    <h2>Hi ${name},</h2>
                    <p>Welcome to Yupacgo - your personalized stock recommendation platform!</p>
                    <p>We're excited to help you discover great investment opportunities tailored to your profile.</p>
                    <p><strong>Next steps:</strong></p>
                    <ul>
                        <li>Complete your onboarding to get personalized recommendations</li>
                        <li>Explore trending stocks</li>
                        <li>Build your watchlist</li>
                        <li>Track your virtual portfolio</li>
                    </ul>
                    <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" style="background: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Get Started</a></p>
                </div>
                <div class="footer">
                    <p>© 2025 Yupacgo. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    return await sendViaResend(email, "Welcome to Yupacgo!", html);
};

module.exports = {
    initializeTransporter,
    sendOTP,
    sendNotificationEmail,
    sendWelcomeEmail
};
