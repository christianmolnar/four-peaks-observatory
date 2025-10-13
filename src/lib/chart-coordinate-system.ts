/**
 * Precise Clear Sky Chart Coordinate System
 * 
 * User's Specifications:
 * 1. Sample 8x8 pixel areas (center +/- 4 pixels vertically and horizontally)
 * 2. Analyze first 24 hours only 
 * 3. Build grid pattern from:
 *    - Center coordinates for each of 8 factors (rows)
 *    - Horizontal distance between hour columns
 * 
 * This creates a precise sampling grid for accurate RGB analysis.
 */

export interface FactorCoordinates {
  cloudCover: { centerX: number; centerY: number };
  transparency: { centerX: number; centerY: number };
  seeing: { centerX: number; centerY: number };
  darkness: { centerX: number; centerY: number };
  smoke: { centerX: number; centerY: number };
  wind: { centerX: number; centerY: number };
  humidity: { centerX: number; centerY: number };
  temperature: { centerX: number; centerY: number };
}

export interface ChartGridConfig {
  // User-provided measurements
  factorCenters: FactorCoordinates;
  hourlySpacing: number; // Horizontal distance between hour columns
  
  // Calculated grid properties
  samplingArea: {
    width: 8;  // ±4 pixels horizontally
    height: 8; // ±4 pixels vertically
  };
  
  // Time configuration
  maxHours: 24; // Analyze first 24 hours only
  
  // Chart metadata
  totalHoursAvailable: number; // Actual hours available in chart (>72 as you mentioned)
}

export interface SamplingPoint {
  factorName: string;
  hourIndex: number; // 0-23 for first 24 hours
  centerX: number;
  centerY: number;
  samplingBounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}

export interface GridSamplingResult {
  r: number;
  g: number;
  b: number;
  averageColor: { r: number; g: number; b: number };
  pixelCount: number;
  confidence: number; // 0-1 based on color consistency
}

/**
 * Generate complete sampling grid from user coordinates
 */
export function generateSamplingGrid(config: ChartGridConfig): SamplingPoint[] {
  const samplingPoints: SamplingPoint[] = [];
  const factorNames = Object.keys(config.factorCenters) as Array<keyof FactorCoordinates>;
  
  // For each factor (row)
  factorNames.forEach(factorName => {
    const factorCenter = config.factorCenters[factorName];
    
    // For each hour column (0-23)
    for (let hourIndex = 0; hourIndex < config.maxHours; hourIndex++) {
      const centerX = factorCenter.centerX + (hourIndex * config.hourlySpacing);
      const centerY = factorCenter.centerY;
      
      const samplingPoint: SamplingPoint = {
        factorName,
        hourIndex,
        centerX,
        centerY,
        samplingBounds: {
          left: centerX - 4,
          right: centerX + 4,
          top: centerY - 4,
          bottom: centerY + 4
        }
      };
      
      samplingPoints.push(samplingPoint);
    }
  });
  
  return samplingPoints;
}

/**
 * Sample 8x8 pixel area and return average RGB with confidence
 */
export async function samplePixelArea(
  imageData: Buffer, 
  imageInfo: any, 
  samplingPoint: SamplingPoint
): Promise<GridSamplingResult> {
  const { left, right, top, bottom } = samplingPoint.samplingBounds;
  const width = imageInfo.width;
  const channels = imageInfo.channels;
  
  let totalR = 0, totalG = 0, totalB = 0;
  let pixelCount = 0;
  const pixels: Array<{ r: number; g: number; b: number }> = [];
  
  // Sample all pixels in the 8x8 area
  for (let y = Math.max(0, top); y <= Math.min(imageInfo.height - 1, bottom); y++) {
    for (let x = Math.max(0, left); x <= Math.min(width - 1, right); x++) {
      const pixelIndex = (y * width + x) * channels;
      
      const r = imageData[pixelIndex];
      const g = imageData[pixelIndex + 1];
      const b = imageData[pixelIndex + 2];
      
      totalR += r;
      totalG += g;
      totalB += b;
      pixelCount++;
      
      pixels.push({ r, g, b });
    }
  }
  
  if (pixelCount === 0) {
    throw new Error(`No pixels found in sampling area for ${samplingPoint.factorName} hour ${samplingPoint.hourIndex}`);
  }
  
  // Calculate average color
  const averageColor = {
    r: Math.round(totalR / pixelCount),
    g: Math.round(totalG / pixelCount),
    b: Math.round(totalB / pixelCount)
  };
  
  // Calculate confidence based on color consistency
  let colorVariance = 0;
  pixels.forEach(pixel => {
    const variance = Math.pow(pixel.r - averageColor.r, 2) + 
                    Math.pow(pixel.g - averageColor.g, 2) + 
                    Math.pow(pixel.b - averageColor.b, 2);
    colorVariance += variance;
  });
  
  const avgVariance = colorVariance / pixelCount;
  const confidence = Math.max(0, 1 - (avgVariance / 10000)); // Normalize variance to 0-1 confidence
  
  return {
    r: averageColor.r,
    g: averageColor.g,
    b: averageColor.b,
    averageColor,
    pixelCount,
    confidence
  };
}

/**
 * User input template for coordinates
 * Fill this out with your precise measurements
 */
export const COORDINATE_INPUT_TEMPLATE: ChartGridConfig = {
  factorCenters: {
    cloudCover: { centerX: 0, centerY: 0 },    // MEASURE: Center of cloud cover row, first hour
    transparency: { centerX: 0, centerY: 0 },  // MEASURE: Center of transparency row, first hour
    seeing: { centerX: 0, centerY: 0 },        // MEASURE: Center of seeing row, first hour
    darkness: { centerX: 0, centerY: 0 },      // MEASURE: Center of darkness row, first hour
    smoke: { centerX: 0, centerY: 0 },         // MEASURE: Center of smoke row, first hour
    wind: { centerX: 0, centerY: 0 },          // MEASURE: Center of wind row, first hour
    humidity: { centerX: 0, centerY: 0 },      // MEASURE: Center of humidity row, first hour
    temperature: { centerX: 0, centerY: 0 }    // MEASURE: Center of temperature row, first hour
  },
  hourlySpacing: 0, // MEASURE: Horizontal pixels between hour columns
  
  samplingArea: {
    width: 8,  // Fixed: ±4 pixels horizontally
    height: 8  // Fixed: ±4 pixels vertically
  },
  
  maxHours: 24, // Fixed: First 24 hours only
  totalHoursAvailable: 72 // You mentioned >72 hours available
};

/**
 * Validate user coordinate input
 */
export function validateCoordinateInput(config: ChartGridConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check if any coordinates are still zero (not measured)
  Object.entries(config.factorCenters).forEach(([factor, coords]) => {
    if (coords.centerX === 0 || coords.centerY === 0) {
      errors.push(`${factor} coordinates not measured (still zero)`);
    }
  });
  
  if (config.hourlySpacing === 0) {
    errors.push(`hourlySpacing not measured (still zero)`);
  }
  
  // Validate sampling areas don't go negative
  Object.entries(config.factorCenters).forEach(([factor, coords]) => {
    if (coords.centerX < 4 || coords.centerY < 4) {
      errors.push(`${factor} center too close to edge for 8x8 sampling`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate coordinate measurement helper
 * Creates a visual guide for measuring coordinates
 */
export function generateCoordinateMeasurementGuide(): string {
  return `
🎯 CLEAR SKY CHART COORDINATE MEASUREMENT GUIDE

📏 **What You Need to Measure:**

1. **Factor Row Centers (8 measurements)**
   For each factor row, find the center Y-coordinate of the squares:
   
   📍 Cloud Cover row center Y: ______
   📍 Transparency row center Y: ______  
   📍 Seeing row center Y: ______
   📍 Darkness row center Y: ______
   📍 Smoke row center Y: ______
   📍 Wind row center Y: ______
   📍 Humidity row center Y: ______
   📍 Temperature row center Y: ______

2. **First Hour Column Center (1 measurement)**
   Find the center X-coordinate of the first hour column:
   
   📍 First hour column center X: ______

3. **Hourly Spacing (1 measurement)**
   Measure horizontal pixels between hour column centers:
   
   📍 Pixels between hour columns: ______

📋 **Measurement Tips:**
- Use browser developer tools or image editor with pixel coordinates
- Aim for exact center of each square
- Measure from center to center for hourly spacing
- All measurements should be in exact pixels
- The system will sample ±4 pixels around each center (8x8 area)

🔬 **Sampling Strategy:**
Each measurement point will sample an 8x8 pixel area:
- Center ± 4 pixels horizontally
- Center ± 4 pixels vertically  
- 64 pixels averaged for each reading
- Confidence calculated based on color consistency

📊 **Analysis Scope:**
- First 24 hours of chart data only
- 8 factors × 24 hours = 192 sampling points total
- Much more manageable than full 72+ hour chart
`;
}

/**
 * Create visual validation overlay for coordinate verification
 */
export async function createCoordinateValidationOverlay(
  config: ChartGridConfig,
  originalImagePath: string,
  outputPath: string
): Promise<void> {
  const sharp = (await import('sharp')).default;
  
  // Generate sampling grid
  const samplingPoints = generateSamplingGrid(config);
  
  // Create SVG overlay showing all sampling areas
  let svgOverlay = `<svg width="1284" height="292" xmlns="http://www.w3.org/2000/svg">`;
  
  // Add sampling rectangles for each point
  samplingPoints.forEach((point, index) => {
    const color = `hsl(${(index * 137.5) % 360}, 70%, 50%)`; // Unique color for each factor
    const opacity = point.hourIndex < 24 ? 0.3 : 0.1; // Highlight first 24 hours
    
    svgOverlay += `
      <rect x="${point.samplingBounds.left}" 
            y="${point.samplingBounds.top}" 
            width="8" 
            height="8" 
            fill="${color}" 
            opacity="${opacity}" 
            stroke="white" 
            stroke-width="0.5"/>
      <text x="${point.centerX}" 
            y="${point.centerY - 6}" 
            font-size="6" 
            fill="white" 
            text-anchor="middle">${point.hourIndex}</text>
    `;
  });
  
  svgOverlay += `</svg>`;
  
  // Composite overlay onto original image
  const image = sharp(originalImagePath);
  const overlayBuffer = Buffer.from(svgOverlay);
  
  await image
    .composite([{ input: overlayBuffer, top: 0, left: 0 }])
    .png()
    .toFile(outputPath);
  
  console.log(`📊 Coordinate validation overlay created: ${outputPath}`);
  console.log(`🎯 Shows ${samplingPoints.length} sampling points (${config.maxHours} hours × 8 factors)`);
}
