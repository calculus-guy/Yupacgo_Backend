/**
 * Canonical email normalization — trim + lowercase.
 *
 * WHY THIS EXISTS: a user signed up from a mobile keyboard that auto-
 * capitalized the first letter of the email field (e.g. "Jane@gmail.com").
 * Every lookup elsewhere — login, forgot-password — compared against
 * whatever case the user happened to type that time, and Mongo string
 * equality is case-sensitive by default. "Jane@gmail.com" and
 * "jane@gmail.com" were treated as two different addresses, so her own
 * password-reset request silently matched no account.
 *
 * Email addresses are effectively case-insensitive in practice (every major
 * provider treats them that way), so there is no correct reason for two
 * different-case spellings of the same address to ever resolve to different
 * accounts. This is applied at every layer — schema (`lowercase: true` on
 * User/OTP), every controller that accepts an email from a request, and
 * inside otp.service.js itself — so no future caller can reintroduce the gap
 * by forgetting to normalize before a lookup.
 */
function normalizeEmail(email) {
    return typeof email === "string" ? email.trim().toLowerCase() : email;
}

module.exports = { normalizeEmail };
