// Clear Sky Chart evaluation logic using configurable criteria

import fs from 'fs';
import path from 'path';

export interface ObservationCriteriaConfig {
  cloudCover: {
    excellent: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  ecmwfCloud: {
    excellent: { values: string[] };
    dubious: { values: string[] };
    poor: { values: string[] };
  };
  transparency: {
    excellent: { values: string[] };
    dubious: { values: string[] };
    poor: { values: string[] };
  };
  seeing: {
    excellent: { values: string[] };
    dubious: { values: string[] };
    poor: { values: string[] };
  };
  darkness: {
    enabled: boolean;
    excellent: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  smoke: {
    excellent: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  wind: {
    excellent: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  humidity: {
    excellent: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  temperature: {
    excellent: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  heuristic: 'floor' | 'average' | 'weighted';
}

interface ClearSkyCondition {
  time: string;
  cloudCover: number;
  transparency: string;
  seeing: string;
  darkness: number;
  smoke: number;
  windSpeed: number;
  humidity: number;
  temperature: number;
}

type QualityRating = 'excellent' | 'good' | 'dubious' | 'poor';

/**
 * Load observation criteria configuration
 */
function loadObservationCriteria(): ObservationCriteriaConfig {
  const configPath = path.join(process.cwd(), 'src/config/observation-criteria-config.json');
  
  // Default configuration based on Clear Sky Chart standards
  const defaultConfig: ObservationCriteriaConfig = {
    cloudCover: {
      excellent: { min: 0, max: 10 },
      dubious: { min: 20, max: 30 },
      poor: { min: 40, max: 100 }
    },
    ecmwfCloud: {
      excellent: { values: ['Clear Sky'] },
      dubious: { values: ['Cloud 25%'] },
      poor: { values: ['Cloud 50%', 'Cloud 75%', 'Overcast'] }
    },
    transparency: {
      excellent: { values: ['Transparent', 'Above average', 'Average'] },
      dubious: { values: ['Below Average'] },
      poor: { values: ['Poor'] }
    },
    seeing: {
      excellent: { values: ['Excellent 5/5', 'Good 4/5', 'Average 3/5'] },
      dubious: { values: ['Poor 2/5'] },
      poor: { values: ['Bad 1/5'] }
    },
    darkness: {
      enabled: false,
      excellent: { min: -4, max: 6.4 },
      dubious: { min: -6, max: -4.1 },
      poor: { min: -10, max: -6.1 }
    },
    smoke: {
      excellent: { min: 0, max: 20 },
      dubious: { min: 40, max: 100 },
      poor: { min: 200, max: 500 }
    },
    wind: {
      excellent: { min: 0, max: 11 },
      dubious: { min: 12, max: 16 },
      poor: { min: 17, max: 100 }
    },
    humidity: {
      excellent: { min: 0, max: 100 },
      dubious: { min: 101, max: 101 },
      poor: { min: 102, max: 102 }
    },
    temperature: {
      excellent: { min: -50, max: 120 },
      dubious: { min: 121, max: 121 },
      poor: { min: 122, max: 122 }
    },
    heuristic: 'floor'
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
 * Evaluate a single parameter against criteria
 */
function evaluateParameter(
  value: number | string,
  criteria: { 
    excellent: { min?: number; max?: number; values?: string[] }; 
    dubious: { min?: number; max?: number; values?: string[] }; 
    poor: { min?: number; max?: number; values?: string[] } 
  }
): QualityRating {
  if (typeof value === 'number') {
    // Handle numeric ranges
    if (criteria.excellent.min !== undefined && criteria.excellent.max !== undefined &&
        value >= criteria.excellent.min && value <= criteria.excellent.max) {
      return 'excellent';
    }
    if (criteria.dubious.min !== undefined && criteria.dubious.max !== undefined &&
        value >= criteria.dubious.min && value <= criteria.dubious.max) {
      return 'dubious';
    }
    return 'poor';
  } else {
    // Handle string values
    if (criteria.excellent.values && criteria.excellent.values.includes(value)) {
      return 'excellent';
    }
    if (criteria.dubious.values && criteria.dubious.values.includes(value)) {
      return 'dubious';
    }
    return 'poor';
  }
}

/**
 * Evaluate observing conditions for a single time period
 */
export function evaluateObservingCondition(condition: ClearSkyCondition): {
  overall: QualityRating;
  details: { [key: string]: QualityRating };
  reason: string;
} {
  const config = loadObservationCriteria();
  const details: { [key: string]: QualityRating } = {};

  // Evaluate each parameter
  details.cloudCover = evaluateParameter(condition.cloudCover, config.cloudCover);
  details.transparency = evaluateParameter(condition.transparency, config.transparency);
  details.seeing = evaluateParameter(condition.seeing, config.seeing);
  details.smoke = evaluateParameter(condition.smoke, config.smoke);
  details.wind = evaluateParameter(condition.windSpeed, config.wind);
  details.humidity = evaluateParameter(condition.humidity, config.humidity);
  details.temperature = evaluateParameter(condition.temperature, config.temperature);

  // Conditionally evaluate darkness
  if (config.darkness.enabled) {
    details.darkness = evaluateParameter(condition.darkness, config.darkness);
  }

  // Apply heuristic to determine overall rating
  const ratings = Object.values(details);
  let overall: QualityRating;

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
      // Weighted average (prioritize critical parameters)
      const weights = {
        cloudCover: 3,
        transparency: 2,
        seeing: 2,
        smoke: 2,
        wind: 1,
        humidity: 1,
        temperature: 1,
        darkness: config.darkness.enabled ? 2 : 0
      };
      let weightedSum = 0;
      let totalWeight = 0;
      Object.entries(details).forEach(([param, rating]) => {
        const weight = weights[param as keyof typeof weights] || 1;
        const score = { excellent: 4, good: 3, dubious: 2, poor: 1 }[rating];
        weightedSum += score * weight;
        totalWeight += weight;
      });
      const weightedAvg = weightedSum / totalWeight;
      if (weightedAvg >= 3.5) overall = 'excellent';
      else if (weightedAvg >= 2.5) overall = 'good';
      else if (weightedAvg >= 1.5) overall = 'dubious';
      else overall = 'poor';
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
 * Convert legacy condition format to new format
 */
export function convertLegacyCondition(legacyCondition: {
  time: string;
  cloudCover: number;
  transparency: number;
  seeingRating: number;
  temperature: number;
  humidity: number;
  windSpeed: number;
}): ClearSkyCondition {
  // Convert numeric transparency to string equivalent
  const transparencyMap = {
    1: 'Poor',
    2: 'Below Average',
    3: 'Average',
    4: 'Above average',
    5: 'Transparent'
  };

  // Convert numeric seeing to string equivalent
  const seeingMap = {
    1: 'Bad 1/5',
    2: 'Poor 2/5',
    3: 'Average 3/5',
    4: 'Good 4/5',
    5: 'Excellent 5/5'
  };

  return {
    time: legacyCondition.time,
    cloudCover: legacyCondition.cloudCover,
    transparency: transparencyMap[Math.round(legacyCondition.transparency) as keyof typeof transparencyMap] || 'Average',
    seeing: seeingMap[Math.round(legacyCondition.seeingRating) as keyof typeof seeingMap] || 'Average 3/5',
    darkness: 4.0, // Default value for now
    smoke: 0, // Default to no smoke
    windSpeed: legacyCondition.windSpeed,
    humidity: legacyCondition.humidity,
    temperature: legacyCondition.temperature
  };
}
