/**
 * Observation Evaluation Weights Configuration
 * 
 * Defines the importance weights for each of the 3 key factors
 * when calculating overall observing conditions.
 */

export interface ObservationWeights {
  cloudCover: number;      // Weight for cloud cover impact
  transparency: number;    // Weight for atmospheric transparency
  seeing: number;    // Weight for astronomical seeing
}

/**
 * Default weights for 3-factor system:
 * - Cloud Cover: 40% (most important)
 * - Transparency: 30% 
 * - Seeing: 30%
 */
export const DEFAULT_WEIGHTS: ObservationWeights = {
  cloudCover: 0.40,      // 40% - Primary factor for observing
  transparency: 0.30,    // 30% - Critical for deep-sky observation
  seeing: 0.30     // 30% - Important for all observation types
};

/**
 * Validates that weights sum to 1.0 (100%)
 */
export function validateWeights(weights: ObservationWeights): boolean {
  const sum = weights.cloudCover + weights.transparency + weights.seeing;
  return Math.abs(sum - 1.0) < 0.001; // Allow for small floating point errors
}

/**
 * Normalizes weights to sum to 1.0 if they don't already
 */
export function normalizeWeights(weights: ObservationWeights): ObservationWeights {
  const sum = weights.cloudCover + weights.transparency + weights.seeing;
  
  if (sum === 0) {
    // If all weights are 0, return default weights
    return { ...DEFAULT_WEIGHTS };
  }
  
  return {
    cloudCover: weights.cloudCover / sum,
    transparency: weights.transparency / sum,
    seeing: weights.seeing / sum
  };
}

/**
 * Calculate weighted score for observation conditions
 * 
 * @param conditions - Object with values for each factor (1-5 scale for all factors)
 * @param weights - Weight configuration to use
 * @returns Weighted score (0-100)
 */
export function calculateWeightedScore(
  conditions: {
    cloudCover: number;     // 1-5 (1 = poor/cloudy, 5 = excellent/clear)
    transparency: number;   // 1-5 (1 = poor, 5 = excellent)
    seeing: number;   // 1-5 (1 = poor, 5 = excellent)
  },
  weights: ObservationWeights = DEFAULT_WEIGHTS
): number {
  
  // Normalize weights to ensure they sum to 1.0
  const normalizedWeights = normalizeWeights(weights);
  
  // Calculate weighted average using 1-5 scale directly
  const cloudWeight = normalizedWeights.cloudCover;
  const transparencyWeight = normalizedWeights.transparency;
  const seeingWeight = normalizedWeights.seeing;
  const totalWeight = cloudWeight + transparencyWeight + seeingWeight;
  
  const weightedScore = (
    conditions.cloudCover * cloudWeight +
    conditions.transparency * transparencyWeight +
    conditions.seeing * seeingWeight
  ) / totalWeight;
  
  // Convert 1-5 weighted score to 0-100 scale for scoreToQuality function
  const scoreFor100Scale = ((weightedScore - 1) / 4) * 100;
  
  return Math.round(Math.max(0, Math.min(100, scoreFor100Scale)));
}

/**
 * Convert weighted score to quality rating
 */
export function scoreToQuality(score: number): "excellent" | "good" | "dubious" | "poor" {
  if (score >= 70) return "excellent";
  if (score >= 55) return "good";
  if (score >= 40) return "dubious";
  return "poor";
}
