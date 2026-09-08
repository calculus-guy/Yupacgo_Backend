/**
 * Shared password strength rule.
 *
 * WHY THIS EXISTS: signup previously only checked the password field was
 * non-empty, while password-reset demanded 6+ chars with upper/lower/digit —
 * so a user could register with `a` and then be permanently unable to reset
 * their own password back to anything that simple. One rule, enforced
 * everywhere a password is set.
 */
const MIN_LENGTH = 8;

function validatePassword(password) {
    if (!password || typeof password !== "string") {
        return "Password is required";
    }
    if (password.length < MIN_LENGTH) {
        return `Password must be at least ${MIN_LENGTH} characters`;
    }
    if (!/[a-z]/.test(password)) {
        return "Password must contain at least one lowercase letter";
    }
    if (!/[A-Z]/.test(password)) {
        return "Password must contain at least one uppercase letter";
    }
    if (!/[0-9]/.test(password)) {
        return "Password must contain at least one number";
    }
    return null;
}

module.exports = { validatePassword, MIN_LENGTH };
