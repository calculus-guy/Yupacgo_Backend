/**
 * Profile Calculator Service - Enhanced Version
 * Converts onboarding answers into computed investor profile
 * with goal-based constraints, budget constraints, and diversification levels
 */

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
 * Compute goal-based investment constraints
 * Different goals require different investment strategies
 * @param {String} goal - User's financial goal
 * @param {String} duration - Investment duration
 * @returns {Object} Goal constraints
 */
function computeGoalConstraints(goal, duration) {
    const constraints = {
        retirement: {
            minDiversification: 8,
            preferDividends: true,
            avoidHighVolatility: true,
            preferStableGrowth: true,
            recommendETFs: true,
            liquidityPriority: "low"
        },
        education: {
            minDiversification: 5,
            preferGrowth: true,
            liquidityImportant: true,
            avoidLongLockup: true,
            recommendETFs: true,
            liquidityPriority: "medium"
        },
        short_term: {
            minDiversification: 3,
            preferLiquidity: true,
            avoidLongLockup: true,
            avoidHighVolatility: true,
            recommendETFs: false,
            liquidityPriority: "high"
        },
        long_term: {
            minDiversification: 6,
            preferGrowth: true,
            canHandleVolatility: true,
            preferCompounding: true,
            recommendETFs: true,
            liquidityPriority: "low"
        },
        preserve: {
            minDiversification: 10,
            preferStable: true,
            avoidVolatility: true,
            preferDividends: true,
            recommendETFs: true,
            liquidityPriority: "medium"
        }
    };

    return constraints[goal] || constraints.long_term;
}

/**
 * Compute budget-based investment constraints
 * Budget affects position sizing, stock selection, and fractional share recommendations
 * @param {String} budget - User's monthly budget (low/medium/high)
 * @returns {Object} Budget constraints
 */
function computeBudgetConstraints(budget) {
    const constraints = {
        low: {
            maxStockPrice: 50000,        // ₦50k per share max (or $50 for US stocks)
            preferFractional: true,
            minPositionSize: 5000,       // ₦5k minimum
            recommendETFs: true,
            maxPositionsCount: 5,        // Limit to 5 positions
            budgetLevel: "low"
        },
        medium: {
            maxStockPrice: 200000,       // ₦200k per share max
            preferFractional: false,
            minPositionSize: 20000,      // ₦20k minimum
            recommendETFs: true,
            maxPositionsCount: 10,
            budgetLevel: "medium"
        },
        high: {
            maxStockPrice: null,         // No limit
            preferFractional: false,
            minPositionSize: 100000,     // ₦100k minimum
            recommendETFs: false,        // Can buy individual stocks
            maxPositionsCount: 20,
            budgetLevel: "high"
        }
    };

    return constraints[budget] || constraints.medium;
}

/**
 * Compute diversification level based on risk profile
 * @param {String} riskLevel - Conservative/Balanced/Aggressive
 * @param {String} experience - User's experience level
 * @returns {Object} Diversification settings
 */
function computeDiversificationLevel(riskLevel, experience) {
    const levels = {
        Conservative: {
            level: "high",
            minAssets: 8,
            maxAssets: 15,
            description: "Highly diversified across sectors and asset types"
        },
        Balanced: {
            level: "medium",
            minAssets: 5,
            maxAssets: 10,
            description: "Moderately diversified with focus on key sectors"
        },
        Aggressive: {
            level: "low",
            minAssets: 3,
            maxAssets: 7,
            description: "Concentrated positions in high-conviction picks"
        }
    };

    const baseLevel = levels[riskLevel] || levels.Balanced;

    // Beginners should have more diversification regardless of risk level
    if (experience === "beginner") {
        baseLevel.minAssets = Math.max(baseLevel.minAssets, 6);
    }

    return baseLevel;
}

/**
 * Compute rebalancing frequency based on approach
 * @param {String} approach - passive/active
 * @param {String} riskLevel - Conservative/Balanced/Aggressive
 * @returns {Object} Rebalancing settings
 */
function computeRebalancingFrequency(approach, riskLevel) {
    const frequencies = {
        passive: {
            Conservative: { frequency: "quarterly", days: 90 },
            Balanced: { frequency: "monthly", days: 30 },
            Aggressive: { frequency: "monthly", days: 30 }
        },
        active: {
            Conservative: { frequency: "monthly", days: 30 },
            Balanced: { frequency: "bi-weekly", days: 14 },
            Aggressive: { frequency: "weekly", days: 7 }
        }
    };

    return frequencies[approach]?.[riskLevel] || { frequency: "monthly", days: 30 };
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
 * Enhanced with goal constraints, budget constraints, and diversification
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

    // Compute advanced constraints
    const goalConstraints = computeGoalConstraints(onboardingData.goal, onboardingData.duration);
    const budgetConstraints = computeBudgetConstraints(onboardingData.budget);
    const diversificationLevel = computeDiversificationLevel(riskLevel, onboardingData.experience);
    const rebalancingFrequency = computeRebalancingFrequency(onboardingData.approach, riskLevel);

    return {
        // Core profile data
        riskScore,
        riskLevel,
        experienceLevel,
        investmentHorizon,
        goal: onboardingData.goal,
        preferredSectors,
        monthlyBudget: onboardingData.budget,
        approach: onboardingData.approach,
        profileType,

        // Advanced constraints for recommendation engine
        goalConstraints,
        budgetConstraints,
        diversificationLevel,
        rebalancingFrequency
    };
}

module.exports = {
    computeProfile,
    calculateRiskScore,
    computeGoalConstraints,
    computeBudgetConstraints,
    computeDiversificationLevel,
    computeRebalancingFrequency,
    mapExperienceLevel,
    mapInvestmentHorizon,
    mapPreferredSectors,
    generateProfileType
};
