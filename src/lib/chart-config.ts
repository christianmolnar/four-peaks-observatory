/**
 * Clear Sky Chart Configuration Manager
 * 
 * Allows users to create custom coordinate configurations for any Clear Sky Chart
 * Based on user-provided measurements using the 6x6 pixel sampling system
 */

import { ChartCoordinates, validateCoordinates } from './chart-coordinates';

/**
 * Creates a ChartCoordinates configuration from user measurements
 * 
 * Users should provide coordinates for the CENTER of the first hour column for each parameter.
 * The system will automatically create 6x6 pixel sampling areas (center ± 3 pixels).
 * 
 * @param coordinates - User-measured coordinates for each parameter's first hour center
 * @param hourlySpacing - Pixels between hour columns (measured from user's chart)
 * @param maxHours - Maximum hours to analyze (default: 24)
 * @returns Validated ChartCoordinates configuration
 */
export function createChartConfig(
  coordinates: {
    cloudCover: { x: number; y: number };
    transparency: { x: number; y: number };
    seeing: { x: number; y: number };
    smoke: { x: number; y: number };
    wind: { x: number; y: number };
  },
  hourlySpacing: number,
  maxHours: number = 24
): ChartCoordinates {
  
  // Ensure we have all required parameters
  const requiredParams = ['cloudCover', 'transparency', 'seeing', 'smoke', 'wind'];
  for (const param of requiredParams) {
    if (!coordinates[param as keyof typeof coordinates]) {
      throw new Error(`Missing required parameter: ${param}`);
    }
  }

  // Build the configuration with only the 5 key factors
  const config: ChartCoordinates = {
    parameters: {
      cloudCover: coordinates.cloudCover,
      transparency: coordinates.transparency,
      seeing: coordinates.seeing,
      smoke: coordinates.smoke,
      wind: coordinates.wind
    },
    hourlySpacing,
    maxHours
  };

  // Validate the configuration
  const validation = validateCoordinates(config, 1200, 800); // Typical chart dimensions
  if (!validation.valid) {
    console.warn('Chart configuration validation warnings:', validation.errors);
  }

  return config;
}

/**
 * Universal Clear Sky Chart coordinate configuration
 * These coordinates work for ALL Clear Sky Charts (generic, not location-specific)
 * Based on standardized chart layout - the 5 key factors
 */
export const DEFAULT_CHART_CONFIG = createChartConfig({
  cloudCover: { x: 142, y: 85 },
  transparency: { x: 142, y: 117 },
  seeing: { x: 142, y: 133 },
  smoke: { x: 142, y: 197 },
  wind: { x: 142, y: 213 }
}, 14, 24);

/**
 * Example of how users can create their own configurations
 */
export const USAGE_EXAMPLES = {
  basic: `
// For any Clear Sky Chart, users provide their own measurements for the 5 key factors:
import { createChartConfig } from './chart-config';

const myObservatoryConfig = createChartConfig({
  cloudCover: { x: 150, y: 85 },      // Center of first hour column
  transparency: { x: 150, y: 110 },   // Center of first hour column  
  seeing: { x: 150, y: 135 },         // Center of first hour column
  smoke: { x: 150, y: 185 },          // Center of first hour column
  wind: { x: 150, y: 210 }            // Center of first hour column
}, 15, 24); // 15px spacing between hours, analyze 24 hours

// Then use with the enhanced parser:
const forecast = await fetchClearSkyChartDataEnhanced(
  chartUrl, 
  locationConfig, 
  myObservatoryConfig
);
`,
  
  measurement: `
// How to measure coordinates for the 5 key factors:
// 1. Open your Clear Sky Chart in a browser
// 2. Right-click and "Inspect Element" 
// 3. Use browser tools to measure pixel coordinates
// 4. Find the CENTER of the first hour column for each parameter row:
//    - Cloud Cover (top row)
//    - Transparency  
//    - Seeing
//    - Smoke
//    - Wind (bottom row of the 5 factors)
// 5. Measure the horizontal spacing between hour columns
// 6. Create your configuration with these measurements
// 
// Note: We skip ECMWF, Darkness, Humidity, and Temperature
`
};
