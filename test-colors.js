const CLEAR_SKY_COLOR_SCALE = [
  { rgb: { r: 0, g: 60, b: 127 }, value: 70.9, description: "Exceptional" },
  { rgb: { r: 16, g: 86, b: 152 }, value: 64.1, description: "Excellent" },
  { rgb: { r: 39, g: 107, b: 173 }, value: 52.4, description: "Very Good" },
  { rgb: { r: 78, g: 144, b: 208 }, value: 43.3, description: "Good" },
  { rgb: { r: 99, g: 165, b: 228 }, value: 39.5, description: "Fair" },
  { rgb: { r: 149, g: 213, b: 213 }, value: 37.6, description: "Below Average" },
  { rgb: { r: 154, g: 218, b: 218 }, value: 35.8, description: "Poor" },
  { rgb: { r: 199, g: 199, b: 199 }, value: 19.1, description: "Very Poor" },
  { rgb: { r: 224, g: 224, b: 224 }, value: 15.8, description: "Bad" },
  { rgb: { r: 235, g: 235, b: 235 }, value: 12.1, description: "Very Bad" },
  { rgb: { r: 239, g: 239, b: 239 }, value: 8.7, description: "Terrible" },
  { rgb: { r: 248, g: 248, b: 248 }, value: 6.9, description: "Awful" },
  { rgb: { r: 255, g: 255, b: 255 }, value: 0.0, description: "Worst" }
];

function calculateColorDistance(rgb1, rgb2) {
  const rDiff = rgb1.r - rgb2.r;
  const gDiff = rgb1.g - rgb2.g;
  const bDiff = rgb1.b - rgb2.b;
  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
}

function mapRgbToValue(rgb) {
  let closestEntry = CLEAR_SKY_COLOR_SCALE[0];
  let minDistance = calculateColorDistance(rgb, closestEntry.rgb);
  
  for (const entry of CLEAR_SKY_COLOR_SCALE) {
    const distance = calculateColorDistance(rgb, entry.rgb);
    if (distance < minDistance) {
      minDistance = distance;
      closestEntry = entry;
    }
  }
  
  return closestEntry.value;
}

function mapRgbToSeeingRating(rgb) {
  const value = mapRgbToValue(rgb);
  if (value >= 60) return 5;
  if (value >= 45) return 4;
  if (value >= 30) return 3;
  if (value >= 15) return 2;
  return 1;
}

function debugColorMatch(rgb) {
  const distances = CLEAR_SKY_COLOR_SCALE.map(entry => ({
    entry,
    distance: calculateColorDistance(rgb, entry.rgb)
  })).sort((a, b) => a.distance - b.distance);
  
  console.log(`Input RGB(${rgb.r}, ${rgb.g}, ${rgb.b})`);
  console.log(`Closest matches:`);
  distances.slice(0, 3).forEach((item, index) => {
    console.log(`  ${index + 1}. RGB(${item.entry.rgb.r}, ${item.entry.rgb.g}, ${item.entry.rgb.b}) - Value: ${item.entry.value}, Distance: ${Math.round(item.distance)}, Desc: ${item.entry.description}`);
  });
  console.log(`Final mapped value: ${mapRgbToValue(rgb)}`);
  console.log(`Final seeing rating: ${mapRgbToSeeingRating(rgb)}`);
}

console.log('=== Testing RGB(149,213,213) (Expected from chart) ===');
debugColorMatch({r: 149, g: 213, b: 213});

console.log('\n=== Testing RGB(66,66,66) (Actual from parser) ===');  
debugColorMatch({r: 66, g: 66, b: 66});
