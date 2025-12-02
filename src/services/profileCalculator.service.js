
/**
 * Calculate risk score from onboarding data
 * @param {Object} onboardingData - Raw onboarding answers
 * @returns {Object} { riskScore, riskLevel }
 */
function calculateRiskScore(onboardingData) {
    const { risk, experience, duration } = onboardingData;

    // Base risk score from user's risk tolerance answer
    const riskMap = {
        low: 1,
        medium: 2,
        high: 3
    };
    let baseRisk = riskMap[risk] || 2;

    // Experience modifier
    const experienceModifier = {
        beginner: -0.3,
        intermediate: 0,
        advanced: 0.3
    };
    const expMod = experienceModifier[experience] || 0;

    // Duration modifier (longer horizon = can take more risk, but user chose conservative duration)
    const durationModifier = {
        short: 0.5,      // < 1 year - short term, higher urgency
        mid: 0,          // 1-3 years - medium term
        long: -0.2,      // 3-7 years - long term, can be patient
        very_long: -0.3  // 7+ years - very long term, most patient
    };
    const durMod = durationModifier[duration] || 0;

    // Calculate total risk score
    let totalRiskScore = baseRisk + expMod + durMod;

    // Clamp between 1 and 3
    totalRiskScore = Math.max(1, Math.min(3, totalRiskScore));

    // Determine risk level
    let riskLevel;
    if (totalRiskScore <= 1.6) {
        riskLevel = "Conservative";
    } else if (totalRiskScore <= 2.3) {
        riskLevel = "Balanced";
    } else {
        riskLevel = "Aggressive";
    }

    return {
        riskScore: parseFloat(totalRiskScore.toFixed(2)),
        riskLevel
    };
}

/**
 * Map experience string to standardized level
 * @param {String} experience - Raw experience value
 * @returns {String} Standardized experience level
 */
function mapExperienceLevel(experience) {
    const mapping = {
        beginner: "Beginner",
        intermediate: "Intermediate",
        advanced: "Advanced"
    };
    return mapping[experience] || "Beginner";
}

/**
 * Map duration to investment horizon
 * @param {String} duration - Raw duration value
 * @returns {String} Standardized investment horizon
 */
function mapInvestmentHorizon(duration) {
    const mapping = {
        short: "short_term",      // < 1 year
        mid: "medium_term",       // 1-3 years
        long: "long_term",        // 3-7 years
        very_long: "very_long_term" // 7+ years
    };
    return mapping[duration] || "medium_term";
}

/**
 * Map interest areas to preferred sectors
 * @param {Array} interest - Array of interest strings
 * @returns {Array} Preferred sectors
 */
function mapPreferredSectors(interest) {
    if (!interest || !Array.isArray(interest)) return [];

    const sectorMapping = {
        stocks: ["tech", "finance", "healthcare", "consumer"],
        etf: ["diversified", "index"],
        mutualfunds: ["diversified", "managed"],
        crypto: ["crypto", "blockchain"],
        bonds: ["fixed_income", "government"]
    };

    const sectors = new Set();
    interest.forEach(item => {
        const mapped = sectorMapping[item];
        if (mapped) {
            mapped.forEach(sector => sectors.add(sector));
        }
    });

    return Array.from(sectors);
}

/**
 * Generate profile type string
 * @param {String} riskLevel - Conservative/Balanced/Aggressive
 * @param {String} investmentHorizon - short_term/medium_term/long_term/very_long_term
 * @returns {String} Profile type
 */
function generateProfileType(riskLevel, investmentHorizon) {
    // Convert horizon to readable format
    const horizonMap = {
        short_term: "ShortTerm",
        medium_term: "MediumTerm",
        long_term: "LongTerm",
        very_long_term: "VeryLongTerm"
    };
    
    const horizonLabel = horizonMap[investmentHorizon] || "MediumTerm";
    return `${riskLevel}-${horizonLabel}`;
}

/**
 * Main function: Compute full investor profile from onboarding data
 * @param {Object} onboardingData - Raw onboarding answers
 * @returns {Object} Computed profile object
 */
function computeProfile(onboardingData) {
    // Calculate risk metrics
    const { riskScore, riskLevel } = calculateRiskScore(onboardingData);

    // Map other fields
    const experienceLevel = mapExperienceLevel(onboardingData.experience);
    const investmentHorizon = mapInvestmentHorizon(onboardingData.duration);
    const preferredSectors = mapPreferredSectors(onboardingData.interest);
    const profileType = generateProfileType(riskLevel, investmentHorizon);

    return {
        riskScore,
        riskLevel,
        experienceLevel,
        investmentHorizon,
        goal: onboardingData.goal,
        preferredSectors,
        monthlyBudget: onboardingData.budget,
        approach: onboardingData.approach,
        profileType
    };
}

module.exports = {
    computeProfile,
    calculateRiskScore,
    mapExperienceLevel,
    mapInvestmentHorizon,
    mapPreferredSectors,
    generateProfileType
};
