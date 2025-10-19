// Clear Sky Chart evaluation logic - Simple 1-5 scale for all factors

import fs from 'fs';
import path from 'path';

export interface ObservationCriteriaConfig {
  cloudCover: {
    excellent: { min: number; max: number };
    good: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  transparency: {
    excellent: { min: number; max: number };
    good: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  seeing: {
    excellent: { min: number; max: number };
    good: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  smoke: {
    excellent: { min: number; max: number };
    good: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  wind: {
    excellent: { min: number; max: number };
    good: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  heuristic: 'floor' | 'average' | 'weighted';
}

interface ClearSkyCondition {
  time: string;
  cloudCover: number;     // 1-5 scale (5=excellent, 1=poor)
  transparency: number;   // 1-5 scale (5=excellent, 1=poor)
  seeingRating: number;   // 1-5 scale (5=excellent, 1=poor)
}

type QualityRating = 'excellent' | 'good' | 'dubious' | 'poor';

/**
 * Load observation criteria configuration
 */
function loadObservationCriteria(): ObservationCriteriaConfig {
  const configPath = path.join(process.cwd(), 'src/config/observation-criteria-config.json');
  
  // Simple 1-5 scale configuration for all Clear Sky Chart factors
  const defaultConfig: ObservationCriteriaConfig = {
    cloudCover: {
      excellent: { min: 4, max: 5 },
      good: { min: 3, max: 3 },
      dubious: { min: 2, max: 2 },
      poor: { min: 1, max: 1 }
    },
    transparency: {
      excellent: { min: 4, max: 5 },
      good: { min: 3, max: 3 },
      dubious: { min: 2, max: 2 },
      poor: { min: 1, max: 1 }
    },
    seeing: {
      excellent: { min: 4, max: 5 },
      good: { min: 3, max: 3 },
      dubious: { min: 2, max: 2 },
      poor: { min: 1, max: 1 }
    },
    smoke: {
      excellent: { min: 4, max: 5 },
      good: { min: 3, max: 3 },
      dubious: { min: 2, max: 2 },
      poor: { min: 1, max: 1 }
    },
    wind: {
      excellent: { min: 4, max: 5 },
      good: { min: 3, max: 3 },
      dubious: { min: 2, max: 2 },
      poor: { min: 1, max: 1 }
    },
    heuristic: 'weighted'
  };

  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return { ...defaultConfig, ...JSON.parse(configData) };
    }
  } catch (error) {
    console.warn('Failed to load observation criteria config, using defaults:', error);
  }

  return defaultConfig;
}

/**
 * Evaluate a single parameter against criteria - Simple 1-5 scale only
 */
function evaluateParameter(
  value: number,
  criteria: { 
    excellent: { min: number; max: number }; 
    good: { min: number; max: number }; 
    dubious: { min: number; max: number }; 
    poor: { min: number; max: number }; 
  }
): QualityRating {
  // All values are 1-5 numbers, check ranges in priority order
  if (value >= criteria.excellent.min && value <= criteria.excellent.max) {
    return 'excellent';
  }
  if (value >= criteria.good.min && value <= criteria.good.max) {
    return 'good';
  }
  if (value >= criteria.dubious.min && value <= criteria.dubious.max) {
    return 'dubious';
  }
  return 'poor';
}

/**
 * Evaluate observing conditions for a single time period
 */
export function evaluateObservingCondition(
  condition: ClearSkyCondition, 
  factorWeights?: { [key: string]: number }
): {
  overall: QualityRating;
  details: { [key: string]: QualityRating };
  reason: string;
} {
  const config = loadObservationCriteria();
  const details: { [key: string]: QualityRating } = {};

  // Evaluate each parameter using simple 1-5 scale (3-factor system)
  details.cloudCover = evaluateParameter(condition.cloudCover, config.cloudCover);
  details.transparency = evaluateParameter(condition.transparency, config.transparency);
  details.seeing = evaluateParameter(condition.seeingRating, config.seeing);
  
  // Apply heuristic to determine overall rating using only 3 factors
  const ratings = [details.cloudCover, details.transparency, details.seeing];
  let overall: QualityRating;
  
  console.log(`[Evaluator] Using heuristic: ${config.heuristic}`);
  console.log(`[Evaluator] Individual ratings:`, details);

  switch (config.heuristic) {
    case 'floor':
      // Worst one wins (most conservative)
      if (ratings.includes('poor')) overall = 'poor';
      else if (ratings.includes('dubious')) overall = 'dubious';
      else if (ratings.includes('good')) overall = 'good';
      else overall = 'excellent';
      break;

    case 'average':
      // Average of all ratings
      const scores = ratings.map(r => ({ excellent: 4, good: 3, dubious: 2, poor: 1 }[r]));
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avgScore >= 3.5) overall = 'excellent';
      else if (avgScore >= 2.5) overall = 'good';
      else if (avgScore >= 1.5) overall = 'dubious';
      else overall = 'poor';
      break;

    case 'weighted':
      // 3-factor weighted average using factor weights from UI
      // Use provided factor weights - no hardcoded defaults
      const weights = {
        cloudCover: factorWeights?.cloudCover || 0,
        transparency: factorWeights?.transparency || 0,
        seeingRating: factorWeights?.seeing || factorWeights?.seeingRating || 0  // Handle both 'seeing' and 'seeingRating' parameter names
      };
      
      console.log('[Evaluator] Using factor weights:', weights);
      
      let weightedSum = 0;
      let totalWeight = 0;
      
      // Calculate for 3 factors only
      const score3f = {
        cloudCover: { excellent: 4, good: 3, dubious: 2, poor: 1 }[details.cloudCover],
        transparency: { excellent: 4, good: 3, dubious: 2, poor: 1 }[details.transparency],
        seeingRating: { excellent: 4, good: 3, dubious: 2, poor: 1 }[details.seeing]  // Note: details uses 'seeing' key
      };
      
      ['cloudCover', 'transparency', 'seeingRating'].forEach(param => {
        const weight = weights[param as keyof typeof weights] || 0;
        const score = score3f[param as keyof typeof score3f];
        if (weight > 0 && score) {
          weightedSum += score * weight;
          totalWeight += weight;
          console.log(`[Evaluator] ${param}: ${details[param === 'seeingRating' ? 'seeing' : param]} (score: ${score}, weight: ${weight}, contribution: ${score * weight})`);
        }
      });
      
      console.log(`[Evaluator] Weighted sum: ${weightedSum}, Total weight: ${totalWeight}, Average: ${weightedSum / totalWeight}`);
      
      const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : 0;
      console.log(`[Evaluator] Final weighted average: ${weightedAvg}`);
      
      if (weightedAvg >= 3.5) {
        overall = 'excellent';
        console.log(`[Evaluator] Result: EXCELLENT (${weightedAvg} >= 3.5)`);
      } else if (weightedAvg >= 2.5) {
        overall = 'good';
        console.log(`[Evaluator] Result: GOOD (${weightedAvg} >= 2.5)`);
      } else if (weightedAvg >= 1.5) {
        overall = 'dubious';
        console.log(`[Evaluator] Result: DUBIOUS (${weightedAvg} >= 1.5)`);
      } else {
        overall = 'poor';
        console.log(`[Evaluator] Result: POOR (${weightedAvg} < 1.5)`);
      }
      break;

    default:
      overall = 'dubious';
  }

  // Generate reason based on worst parameters
  const poorParams = Object.entries(details).filter(([, rating]) => rating === 'poor');
  const dubiousParams = Object.entries(details).filter(([, rating]) => rating === 'dubious');

  let reason = '';
  if (poorParams.length > 0) {
    const paramNames = poorParams.map(([param]) => param).join(', ');
    reason = `Poor conditions due to ${paramNames}`;
  } else if (dubiousParams.length > 0) {
    const paramNames = dubiousParams.map(([param]) => param).join(', ');
    reason = `Moderate conditions - ${paramNames} may obstruct targets`;
  } else {
    reason = 'Good conditions for most observations';
  }

  return { overall, details, reason };
}

/**
 * Convert legacy condition format to simplified format (for compatibility)
 */
export function convertLegacyCondition(legacyCondition: {
  time: string;
  cloudCover: number;
  transparency: number;
  seeingRating: number;
}): ClearSkyCondition {
  return {
    time: legacyCondition.time,
    cloudCover: legacyCondition.cloudCover,
    transparency: legacyCondition.transparency,
    seeingRating: legacyCondition.seeingRating
  };
}
