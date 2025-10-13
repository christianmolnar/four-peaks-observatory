/**
 * Clear Sky Chart Coordinate System - User Input Based
 * 
 * Takes user-provided top-left coordinates for 6x6 sampling areas
 * and calculates precise sampling coordinates for 24-hour analysis
 */

// Interface for user-provided coordinates - simplified to 5 key factors
export interface ChartCoordinates {
  // Top-left coordinates for each parameter's 6x6 sampling area (at hour 0)
  parameters: {
    cloudCover: { x: number; y: number };
    transparency: { x: number; y: number };
    seeing: { x: number; y: number };
    smoke: { x: number; y: number };
    wind: { x: number; y: number };
  };
  
  // Horizontal distance between hour columns
  hourlySpacing: number;
  
  // Total hours to analyze (24 as per your requirement)
  maxHours: number;
}

// Calculated sampling area for a parameter at a specific hour
export interface SamplingArea {
  topLeft: { x: number; y: number };
  center: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

// Grid of all sampling areas
export interface ChartGrid {
  parameters: {
    [key: string]: SamplingArea[];  // Array of 24 sampling areas (one per hour)
  };
  hourlySpacing: number;
  totalHours: number;
}

/**
 * Calculate sampling area from top-left coordinate
 */
function calculateSamplingArea(topLeftX: number, topLeftY: number): SamplingArea {
  // 6x6 pixel area: top-left to top-left + 6
  const bottomRightX = topLeftX + 6;
  const bottomRightY = topLeftY + 6;
  
  // Center is top-left + 3
  const centerX = topLeftX + 3;
  const centerY = topLeftY + 3;
  
  return {
    topLeft: { x: topLeftX, y: topLeftY },
    center: { x: centerX, y: centerY },
    bottomRight: { x: bottomRightX, y: bottomRightY },
    bounds: {
      minX: topLeftX,
      maxX: bottomRightX - 1,  // Inclusive bounds
      minY: topLeftY,
      maxY: bottomRightY - 1   // Inclusive bounds
    }
  };
}

/**
 * Generate complete grid from user coordinates
 */
export function generateChartGrid(coordinates: ChartCoordinates): ChartGrid {
  const grid: ChartGrid = {
    parameters: {},
    hourlySpacing: coordinates.hourlySpacing,
    totalHours: coordinates.maxHours
  };
  
  // Generate sampling areas for each parameter
  for (const [paramName, baseCoord] of Object.entries(coordinates.parameters)) {
    const parameterAreas: SamplingArea[] = [];
    
    // Generate 24 hours of sampling areas
    for (let hour = 0; hour < coordinates.maxHours; hour++) {
      const hourOffsetX = hour * coordinates.hourlySpacing;
      const topLeftX = baseCoord.x + hourOffsetX;
      const topLeftY = baseCoord.y;  // Y doesn't change across hours
      
      const samplingArea = calculateSamplingArea(topLeftX, topLeftY);
      parameterAreas.push(samplingArea);
    }
    
    grid.parameters[paramName] = parameterAreas;
  }
  
  return grid;
}

/**
 * Get sampling area for specific parameter and hour
 */
export function getSamplingArea(
  grid: ChartGrid, 
  parameter: string, 
  hour: number
): SamplingArea | null {
  if (!grid.parameters[parameter] || hour < 0 || hour >= grid.totalHours) {
    return null;
  }
  
  return grid.parameters[parameter][hour];
}

/**
 * Validate coordinates are within image bounds
 */
export function validateCoordinates(
  coordinates: ChartCoordinates, 
  imageWidth: number, 
  imageHeight: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check each parameter's coordinate
  for (const [paramName, coord] of Object.entries(coordinates.parameters)) {
    // Check base coordinate is in bounds
    if (coord.x < 0 || coord.y < 0) {
      errors.push(`${paramName}: Top-left coordinate (${coord.x}, ${coord.y}) has negative values`);
    }
    
    // Check 6x6 area doesn't exceed image bounds
    if (coord.x + 6 > imageWidth) {
      errors.push(`${paramName}: 6x6 area exceeds image width (${coord.x + 6} > ${imageWidth})`);
    }
    
    if (coord.y + 6 > imageHeight) {
      errors.push(`${paramName}: 6x6 area exceeds image height (${coord.y + 6} > ${imageHeight})`);
    }
    
    // Check last hour doesn't exceed image bounds
    const lastHourX = coord.x + ((coordinates.maxHours - 1) * coordinates.hourlySpacing);
    if (lastHourX + 6 > imageWidth) {
      errors.push(`${paramName}: Hour ${coordinates.maxHours - 1} exceeds image width (${lastHourX + 6} > ${imageWidth})`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate visual validation data for overlay
 */
export function generateValidationOverlay(grid: ChartGrid): string {
  let svg = '';
  
  const colors = {
    cloudCover: '#FF0000',    // Red
    ecmwfCloud: '#FFA500',    // Orange  
    transparency: '#00FF00',  // Green
    seeing: '#0000FF',        // Blue
    darkness: '#FFFF00',      // Yellow
    smoke: '#FF00FF',         // Magenta
    wind: '#00FFFF',          // Cyan
    humidity: '#800080',      // Purple
    temperature: '#008000'    // Dark Green
  };
  
  // Draw sampling areas for each parameter
  for (const [paramName, areas] of Object.entries(grid.parameters)) {
    const color = colors[paramName as keyof typeof colors] || '#000000';
    
    areas.forEach((area, hour) => {
      // Draw 6x6 rectangle
      svg += `<rect x="${area.topLeft.x}" y="${area.topLeft.y}" width="6" height="6" `;
      svg += `fill="none" stroke="${color}" stroke-width="1" opacity="0.7" />`;
      
      // Draw center point
      svg += `<circle cx="${area.center.x}" cy="${area.center.y}" r="1" fill="${color}" />`;
      
      // Label first and last hour
      if (hour === 0 || hour === areas.length - 1) {
        svg += `<text x="${area.center.x}" y="${area.topLeft.y - 2}" `;
        svg += `font-size="8" fill="${color}" text-anchor="middle">${paramName}:${hour}</text>`;
      }
    });
  }
  
  return svg;
}

/**
 * Template for user coordinate input - 5 key factors only
 */
export const COORDINATE_TEMPLATE: ChartCoordinates = {
  parameters: {
    cloudCover: { x: 0, y: 0 },     // User to provide
    transparency: { x: 0, y: 0 },   // User to provide
    seeing: { x: 0, y: 0 },         // User to provide
    smoke: { x: 0, y: 0 },          // User to provide
    wind: { x: 0, y: 0 }            // User to provide
  },
  hourlySpacing: 0,  // User to provide (pixels between hour columns)
  maxHours: 24       // Fixed at 24 hours as requested
};

/**
 * Example usage documentation - 5 key factors
 */
export const USAGE_EXAMPLE = `
// Example user input - completely generic for any Clear Sky Chart:
const userCoordinates: ChartCoordinates = {
  parameters: {
    cloudCover: { x: 137, y: 80 },      // User provides actual coordinates  
    transparency: { x: 137, y: 112 },   // User provides actual coordinates
    seeing: { x: 137, y: 128 },         // User provides actual coordinates
    smoke: { x: 137, y: 192 },          // User provides actual coordinates
    wind: { x: 137, y: 208 }            // User provides actual coordinates
  },
  hourlySpacing: 14,  // User provides actual spacing between hour columns
  maxHours: 24        // Fixed at 24 hours for performance
};

// Generate grid from ANY Clear Sky Chart coordinates
const grid = generateChartGrid(userCoordinates);

// Get sampling area for any parameter at any hour
const area = getSamplingArea(grid, 'transparency', 5);
// Returns: { topLeft: {x: 207, y: 112}, center: {x: 210, y: 115}, bounds: {...} }
`;
