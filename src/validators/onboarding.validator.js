const { GOALS, RISKS, DURATIONS, BUDGETS, INTERESTS, EXPERIENCES, APPROACHES } = require("../constants/domain");
const AppError = require("../utils/AppError");

/**
 * Validate a raw onboarding payload against the shared domain vocabulary
 * BEFORE it reaches profileCalculator.service.js.
 *
 * profileCalculator throws a plain Error on an unknown value (by design — see
 * that file's header comment), which is correct for defending the scoring
 * logic but the wrong shape for an API response. This turns "your answer
 * doesn't match our vocabulary" into a clean 400 with a field-level reason,
 * instead of a generic 500.
 */
function validateOnboardingPayload(body) {
    const errors = [];
    const { goal, risk, duration, budget, interest, experience, approach } = body || {};

    checkEnum(errors, "goal", goal, GOALS);
    checkEnum(errors, "risk", risk, RISKS);
    checkEnum(errors, "duration", duration, DURATIONS);
    checkEnum(errors, "budget", budget, BUDGETS);
    checkEnum(errors, "experience", experience, EXPERIENCES);
    checkEnum(errors, "approach", approach, APPROACHES);

    if (interest !== undefined) {
        if (!Array.isArray(interest)) {
            errors.push("interest must be an array");
        } else {
            const bad = interest.filter((i) => !INTERESTS.includes(i));
            if (bad.length > 0) {
                errors.push(`interest contains unsupported value(s): ${bad.join(", ")}. Expected one of: ${INTERESTS.join(", ")}`);
            }
        }
    }

    if (errors.length > 0) {
        throw AppError.badRequest("Invalid onboarding data", { details: errors });
    }

    return {
        goal, risk, duration, budget,
        interest: Array.isArray(interest) ? interest : [],
        experience, approach
    };
}

function checkEnum(errors, field, value, allowed) {
    if (value === undefined || value === null || value === "") {
        errors.push(`${field} is required`);
        return;
    }
    if (!allowed.includes(value)) {
        errors.push(`${field} must be one of: ${allowed.join(", ")} (got "${value}")`);
    }
}

module.exports = { validateOnboardingPayload };
