/**
 * Clear Sky Chart Color Scale Mapping
 * 
 * Based on actual Clear Sky Chart RGB color scale provided by user.
 * Maps RGB colors to condition quality values (0-100 scale where 100 = best conditions).
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface ColorScaleEntry {
  rgb: RgbColor;
  rating: number;  // Direct 1-5 scale (5 = best, 1 = worst)
  description: string;
}

/**
 * Clear Sky Chart color scale entries - DIRECT 1-5 rating mapping
 * IMPORTANT: Dark blue = BEST conditions (rating 5), White = WORST conditions (rating 1)
 */
export const CLEAR_SKY_COLOR_SCALE: ColorScaleEntry[] = [
  // Best conditions (darkest blue) - rating 5
  { rgb: { r: 0, g: 60, b: 127 }, rating: 5, description: "Excellent" },
  { rgb: { r: 16, g: 86, b: 152 }, rating: 5, description: "Excellent" },
  { rgb: { r: 39, g: 107, b: 173 }, rating: 4, description: "Good" },
  { rgb: { r: 78, g: 144, b: 208 }, rating: 4, description: "Good" },
  { rgb: { r: 99, g: 165, b: 228 }, rating: 3, description: "Fair" },
  
  // Transitional blues/cyans - should be rating 3, not 1!
  { rgb: { r: 149, g: 213, b: 213 }, rating: 3, description: "Fair" },
  { rgb: { r: 154, g: 218, b: 218 }, rating: 2, description: "Dubious" },
  
  // Dark grays (these should be better than white!)
  { rgb: { r: 32, g: 32, b: 32 }, rating: 2, description: "Dubious" },
  { rgb: { r: 48, g: 48, b: 48 }, rating: 2, description: "Dubious" },
  { rgb: { r: 64, g: 64, b: 64 }, rating: 2, description: "Dubious" },
  { rgb: { r: 80, g: 80, b: 80 }, rating: 2, description: "Dubious" },
  { rgb: { r: 128, g: 128, b: 128 }, rating: 2, description: "Dubious" },
  
  // Light grays to white (worst conditions) - rating 1
  { rgb: { r: 199, g: 199, b: 199 }, rating: 1, description: "Poor" },
  { rgb: { r: 224, g: 224, b: 224 }, rating: 1, description: "Poor" },
  { rgb: { r: 235, g: 235, b: 235 }, rating: 1, description: "Poor" },
  { rgb: { r: 239, g: 239, b: 239 }, rating: 1, description: "Poor" },
  { rgb: { r: 248, g: 248, b: 248 }, rating: 1, description: "Poor" },
  { rgb: { r: 255, g: 255, b: 255 }, rating: 1, description: "Poor" }
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
 * Find the closest color in the scale and return its rating directly
 */
export function mapRgbToRating(rgb: { r: number; g: number; b: number }): number {
  let closestEntry = CLEAR_SKY_COLOR_SCALE[0];
  let minDistance = calculateColorDistance(rgb, closestEntry.rgb);
  
  for (const entry of CLEAR_SKY_COLOR_SCALE) {
    const distance = calculateColorDistance(rgb, entry.rgb);
    if (distance < minDistance) {
      minDistance = distance;
      closestEntry = entry;
    }
  }
  
  console.log(`[Color Scale] RGB(${rgb.r}, ${rgb.g}, ${rgb.b}) → Rating ${closestEntry.rating} (${closestEntry.description}), Distance: ${Math.round(minDistance)}`);
  
  return closestEntry.rating;
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
    console.log(`  ${index + 1}. RGB(${item.entry.rgb.r}, ${item.entry.rgb.g}, ${item.entry.rgb.b}) - Rating: ${item.entry.rating}, Distance: ${Math.round(item.distance)}, Desc: ${item.entry.description}`);
  });
  console.log(`[Color Scale] Final rating: ${mapRgbToRating(rgb)}`);
}
