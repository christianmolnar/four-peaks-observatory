/**
 * Observation Evaluation Weights Configuration
 * 
 * Defines the importance weights for each of the 5 key factors
 * when calculating overall observing conditions.
 */

export interface ObservationWeights {
  cloudCover: number;      // Weight for cloud cover impact
  transparency: number;    // Weight for atmospheric transparency
  seeing: number;          // Weight for astronomical seeing
  smoke: number;           // Weight for smoke/haze impact
  wind: number;            // Weight for wind conditions
}

/**
 * Default weights as specified by user:
 * - Cloud Cover: 50% (most important)
 * - Transparency: 25% 
 * - Seeing: 25%
 * - Smoke: 0% (monitoring only)
 * - Wind: 0% (monitoring only)
 */
export const DEFAULT_WEIGHTS: ObservationWeights = {
  cloudCover: 0.50,    // 50% - Primary factor for observing
  transparency: 0.25,  // 25% - Critical for deep-sky observation
  seeing: 0.25,        // 25% - Important for planetary/lunar work
  smoke: 0.00,         // 0% - Monitor but don't weight heavily
  wind: 0.00           // 0% - Monitor but don't weight heavily
};

/**
 * Validates that weights sum to 1.0 (100%)
 */
export function validateWeights(weights: ObservationWeights): boolean {
  const sum = weights.cloudCover + weights.transparency + weights.seeing + weights.smoke + weights.wind;
  return Math.abs(sum - 1.0) < 0.001; // Allow for small floating point errors
}

/**
 * Normalizes weights to sum to 1.0 if they don't already
 */
export function normalizeWeights(weights: ObservationWeights): ObservationWeights {
  const sum = weights.cloudCover + weights.transparency + weights.seeing + weights.smoke + weights.wind;
  
  if (sum === 0) {
    // If all weights are 0, return default weights
    return { ...DEFAULT_WEIGHTS };
  }
  
  return {
    cloudCover: weights.cloudCover / sum,
    transparency: weights.transparency / sum,
    seeing: weights.seeing / sum,
    smoke: weights.smoke / sum,
    wind: weights.wind / sum
  };
}

/**
 * Calculate weighted score for observation conditions
 * 
 * @param conditions - Object with values for each factor (0-100 scale)
 * @param weights - Weight configuration to use
 * @returns Weighted score (0-100)
 */
export function calculateWeightedScore(
  conditions: {
    cloudCover: number;     // 0-100 (0 = clear, 100 = cloudy)
    transparency: number;   // 0-100 (0 = poor, 100 = excellent)
    seeing: number;         // 1-5 (1 = poor, 5 = excellent) - will be converted to 0-100
    smoke: number;          // 0-100 (0 = clear, 100 = smoky)
    wind: number;           // 0-30 mph (converted to 0-100 scale)
  },
  weights: ObservationWeights = DEFAULT_WEIGHTS
): number {
  
  // Normalize weights to ensure they sum to 1.0
  const normalizedWeights = normalizeWeights(weights);
  
  // Convert all factors to 0-100 scale where 100 = best conditions
  const normalizedConditions = {
    cloudCover: 100 - conditions.cloudCover,           // Invert: less clouds = better
    transparency: conditions.transparency,              // Direct: more transparency = better
    seeing: ((conditions.seeing - 1) / 4) * 100,      // Convert 1-5 to 0-100
    smoke: 100 - conditions.smoke,                     // Invert: less smoke = better
    wind: Math.max(0, 100 - (conditions.wind / 30) * 100) // Convert 0-30mph to 100-0 scale
  };
  
  // Calculate weighted average
  const weightedScore = 
    (normalizedConditions.cloudCover * normalizedWeights.cloudCover) +
    (normalizedConditions.transparency * normalizedWeights.transparency) +
    (normalizedConditions.seeing * normalizedWeights.seeing) +
    (normalizedConditions.smoke * normalizedWeights.smoke) +
    (normalizedConditions.wind * normalizedWeights.wind);
  
  return Math.round(Math.max(0, Math.min(100, weightedScore)));
}

/**
 * Convert weighted score to quality rating
 */
export function scoreToQuality(score: number): "excellent" | "good" | "dubious" | "poor" {
  if (score >= 80) return "excellent";
  if (score >= 65) return "good";
  if (score >= 45) return "dubious";
  return "poor";
}
