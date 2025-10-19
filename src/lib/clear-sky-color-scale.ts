/**
 * Clear Sky Chart Color Scale Mapping
 * 
 * Based on actual Clear Sky Chart RGB color scale provided by user.
 * Maps RGB colors to condition quality values (0-100 scale where 100 = best conditions).
 */

export interface ColorScaleEntry {
  rgb: { r: number; g: number; b: number };
  value: number;  // Quality value (0-100, where 100 = best)
  description: string;
}

/**
 * Clear Sky Chart color scale entries based on actual user-provided scale
 * IMPORTANT: Dark blue = BEST conditions, White = WORST conditions
 * Values are from the actual Clear Sky Chart scale
 */
export const CLEAR_SKY_COLOR_SCALE: ColorScaleEntry[] = [
  // Best conditions (darkest blue) - highest values
  { rgb: { r: 0, g: 60, b: 127 }, value: 70.9, description: "Exceptional" },
  { rgb: { r: 16, g: 86, b: 152 }, value: 64.1, description: "Excellent" },
  { rgb: { r: 39, g: 107, b: 173 }, value: 52.4, description: "Very Good" },
  { rgb: { r: 78, g: 144, b: 208 }, value: 43.3, description: "Good" },
  { rgb: { r: 99, g: 165, b: 228 }, value: 39.5, description: "Fair" },
  
  // Transitional blues/cyans
  { rgb: { r: 149, g: 213, b: 213 }, value: 37.6, description: "Below Average" },
  { rgb: { r: 154, g: 218, b: 218 }, value: 35.8, description: "Poor" },
  
  // Grays to white (worst conditions) - lowest values
  { rgb: { r: 199, g: 199, b: 199 }, value: 19.1, description: "Very Poor" },
  { rgb: { r: 224, g: 224, b: 224 }, value: 15.8, description: "Bad" },
  { rgb: { r: 235, g: 235, b: 235 }, value: 12.1, description: "Very Bad" },
  { rgb: { r: 239, g: 239, b: 239 }, value: 8.7, description: "Terrible" },
  { rgb: { r: 248, g: 248, b: 248 }, value: 6.9, description: "Awful" },
  { rgb: { r: 255, g: 255, b: 255 }, value: 0.0, description: "Worst" }
];

/**
 * Calculate Euclidean distance between two RGB colors
 */
function calculateColorDistance(rgb1: { r: number; g: number; b: number }, rgb2: { r: number; g: number; b: number }): number {
  const rDiff = rgb1.r - rgb2.r;
  const gDiff = rgb1.g - rgb2.g;
  const bDiff = rgb1.b - rgb2.b;
  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
}

/**
 * Find the closest color in the scale and return its value
 */
export function mapRgbToValue(rgb: { r: number; g: number; b: number }): number {
  let closestEntry = CLEAR_SKY_COLOR_SCALE[0];
  let minDistance = calculateColorDistance(rgb, closestEntry.rgb);
  
  for (const entry of CLEAR_SKY_COLOR_SCALE) {
    const distance = calculateColorDistance(rgb, entry.rgb);
    if (distance < minDistance) {
      minDistance = distance;
      closestEntry = entry;
    }
  }
  
  // If the distance is very large, interpolate between closest colors
  if (minDistance > 50) {
    return interpolateValue(rgb);
  }
  
  return closestEntry.value;
}

/**
 * Interpolate value between closest color scale entries
 */
function interpolateValue(rgb: { r: number; g: number; b: number }): number {
  // Find two closest colors
  const distances = CLEAR_SKY_COLOR_SCALE.map(entry => ({
    entry,
    distance: calculateColorDistance(rgb, entry.rgb)
  })).sort((a, b) => a.distance - b.distance);
  
  const closest = distances[0];
  const secondClosest = distances[1];
  
  // If first color is very close, use it directly
  if (closest.distance < 10) {
    return closest.entry.value;
  }
  
  // Interpolate between the two closest colors
  const totalDistance = closest.distance + secondClosest.distance;
  const weight1 = secondClosest.distance / totalDistance;
  const weight2 = closest.distance / totalDistance;
  
  const interpolatedValue = (closest.entry.value * weight1) + (secondClosest.entry.value * weight2);
  return Math.round(Math.max(0, Math.min(100, interpolatedValue)));
}

/**
 * Get description for a value (using actual Clear Sky Chart scale)
 */
export function getValueDescription(value: number): string {
  if (value >= 65) return "Exceptional";
  if (value >= 50) return "Excellent";
  if (value >= 40) return "Very Good";
  if (value >= 35) return "Good";
  if (value >= 30) return "Fair";
  if (value >= 20) return "Below Average";
  if (value >= 15) return "Poor";
  if (value >= 10) return "Very Poor";
  if (value >= 5) return "Bad";
  return "Worst";
}

/**
 * Convert RGB to seeing rating (1-5 scale) using actual Clear Sky Chart values
 */
export function mapRgbToSeeingRating(rgb: RgbColor): number {
  const value = mapRgbToValue(rgb);
  
  // Convert 0-100 scale to 1-5 seeing rating scale based on visual analysis
  if (value >= 80) return 5; // Excellent - darkest blues (64.1 and above)
  if (value >= 65) return 4; // Good - medium blues (43.3 range)
  if (value >= 55) return 3; // Fair - light blues (39.5 range) 
  if (value >= 45) return 2; // Below Average - cyan colors (37.6 range)
  return 1; // Poor - light cyan to white (35.8 and below)
}

/**
 * Debug function to show closest color matches
 */
export function debugColorMatch(rgb: { r: number; g: number; b: number }): void {
  const distances = CLEAR_SKY_COLOR_SCALE.map(entry => ({
    entry,
    distance: calculateColorDistance(rgb, entry.rgb)
  })).sort((a, b) => a.distance - b.distance);
  
  console.log(`[Color Scale] Input RGB(${rgb.r}, ${rgb.g}, ${rgb.b})`);
  console.log(`[Color Scale] Closest matches:`);
  distances.slice(0, 3).forEach((item, index) => {
    console.log(`  ${index + 1}. RGB(${item.entry.rgb.r}, ${item.entry.rgb.g}, ${item.entry.rgb.b}) - Value: ${item.entry.value}, Distance: ${Math.round(item.distance)}, Desc: ${item.entry.description}`);
  });
  console.log(`[Color Scale] Final mapped value: ${mapRgbToValue(rgb)}`);
}
