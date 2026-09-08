const { DURATIONS } = require("../constants/domain");

/**
 * Detects onboarding data saved before the domain-vocabulary fix.
 *
 * The old frontend mapper could only ever produce `duration: "medium_term"` —
 * every real UI answer collapsed to that one default (see
 * profileCalculator.service.js's header comment). `"medium_term"` is not a
 * member of the current DURATIONS enum, so any stored onboarding record
 * whose duration isn't in that list is, unambiguously, pre-fix data whose
 * true answer was never actually captured. There is no way to recover what
 * the user really selected — the only honest remediation is asking them to
 * redo the (2-minute) questionnaire.
 *
 * This check is self-expiring: once a user redoes onboarding, the new
 * mapper can only ever write a value that IS in DURATIONS, so it will never
 * flag again for them.
 */
function needsOnboardingRefresh(onboarding) {
    if (!onboarding || !onboarding.duration) return false;
    return !DURATIONS.includes(onboarding.duration);
}

module.exports = { needsOnboardingRefresh };
