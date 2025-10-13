// Clear Sky Chart parser for real astronomical weather data
import sharp from 'sharp';
import { mapRgbToSeeingRating } from './clear-sky-color-scale';
import { DEFAULT_CHART_CONFIG } from './chart-config';

export interface ClearSkyCondition {
  time: string;
  cloudCover: number; // 1-5 scale (5=excellent, 1=poor)
  transparency: number; // 1-5 scale (5=excellent, 1=poor)
  seeingRating: number; // 1-5 scale (5=excellent, 1=poor)
  smoke: number; // 1-5 scale (5=excellent, 1=poor)
  windSpeed: number; // 1-5 scale (5=excellent, 1=poor)
  // Legacy fields for compatibility
  temperature: number;
  humidity: number;
}

export interface ClearSkyForecastData {
  location: string;
  forecast: ClearSkyCondition[];
  lastUpdated: Date;
}

/**
 * Parse Clear Sky Chart URL to extract location info
 */
export function parseClearSkyChartUrl(url: string) {
  // Handle both HTML page URLs and direct GIF URLs
  
  // Check if it's a direct GIF URL first
  const gifMatch = url.match(/\/c\/([^\/\?]+)csk\.gif/);
  if (gifMatch) {
    const chartId = gifMatch[1]; // e.g., "DyrsbrgTN" from DyrsbrgTNcsk.gif
    return {
      chartId,
      imageUrl: url.split('?')[0], // Remove query parameters for clean URL
      dataUrl: `https://www.cleardarksky.com/c/${chartId}key.html` // Generate corresponding HTML URL
    };
  }
  
  // Fall back to HTML URL parsing
  const htmlMatch = url.match(/\/c\/([^\/]+)\.html/);
  if (htmlMatch) {
    const fullId = htmlMatch[1]; // e.g., "MplVllyObWAkey"
    // Remove the "key" suffix to get the base chart ID
    const chartId = fullId.replace(/key$/, ''); // e.g., "MplVllyObWA"
    
    return {
      chartId,
      imageUrl: `https://www.cleardarksky.com/c/${chartId}csk.gif`,
      dataUrl: url // We'll scrape this for data
    };
  }
  
  throw new Error('Invalid Clear Sky Chart URL format - must be either .html page or .gif image URL');
}

/**
 * Fetch Clear Sky Chart data by parsing the actual chart image
 * This analyzes the colored pixels in the chart according to the standard legend
 */
export async function fetchClearSkyChartData(chartUrl: string): Promise<ClearSkyForecastData> {
  try {
    const { chartId, imageUrl, dataUrl } = parseClearSkyChartUrl(chartUrl);
    
    let location = 'Unknown Location';
    
    // Try to get location name from HTML page if available
    try {
      const pageResponse = await fetch(dataUrl);
      if (pageResponse.ok) {
        const html = await pageResponse.text();
        const locationMatch = html.match(/<title>(.+?) Clear Sky Chart/);
        if (locationMatch) {
          location = locationMatch[1];
        }
      }
    } catch (error) {
      console.warn('Could not fetch location name from HTML page:', error);
      // Extract location from chart ID if possible
      location = chartId.replace(/([A-Z])/g, ' $1').trim() || 'Observatory Location';
    }
    
    // Parse the actual chart image (use the clean imageUrl without query params)
    const forecast = await parseClearSkyChartImage(imageUrl);
    
    return {
      location,
      forecast,
      lastUpdated: new Date()
    };
    
  } catch (error) {
    console.error('Failed to fetch Clear Sky Chart data:', error);
    throw new Error(`Clear Sky Chart parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse the Clear Sky Chart image to extract forecast data
 * Analyzes colored pixels according to the standard CSC legend
 */
async function parseClearSkyChartImage(imageUrl: string): Promise<ClearSkyCondition[]> {
  try {
    console.log(`[Clear Sky Parser] Starting analysis of ${imageUrl}`);
    
    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch chart image: ${response.status} ${response.statusText} from ${imageUrl}`);
    }
    
    const imageBuffer = await response.arrayBuffer();
    console.log(`[Clear Sky Parser] Fetched ${imageBuffer.byteLength} bytes`);
    
    // Parse the image using Sharp for server-side processing
    const forecast = await analyzeImageWithSharp(Buffer.from(imageBuffer));
    
    console.log(`[Clear Sky Parser] Successfully parsed ${forecast.length} hourly conditions`);
    return forecast;
    
  } catch (error) {
    console.error(`[Clear Sky Parser] Failed to parse image: ${error}`);
    throw new Error(`Clear Sky Chart parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Analyze Clear Sky Chart image using Sharp library
 */
async function analyzeImageWithSharp(imageBuffer: Buffer): Promise<ClearSkyCondition[]> {
  try {
    // Add color mapping test for debugging
    console.log("\n=== TESTING COLOR MAPPINGS ===");
    testColorMappings();
    console.log("=== END COLOR MAPPING TEST ===\n");
    
    // Get image metadata and pixel data
    const image = sharp(imageBuffer);
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    
    console.log(`[Sharp] Image dimensions: ${info.width}x${info.height}, channels: ${info.channels}`);
    
    // Create a debug image with markers showing where we sample pixels
    await createDebugImageWithMarkers(imageBuffer, info);
    
    // DEBUGGING: Test specific pixel sampling to verify we're reading the right areas
    console.log("=== PIXEL SAMPLING DEBUG ===");
    const testX = Math.floor(info.width * 0.5); // Middle of image
    const testRows = [
      { name: "Row at 30%", y: Math.floor(info.height * 0.30) },
      { name: "Row at 35%", y: Math.floor(info.height * 0.35) },
      { name: "Row at 40%", y: Math.floor(info.height * 0.40) },
      { name: "Row at 45%", y: Math.floor(info.height * 0.45) },
    ];
    
    testRows.forEach(row => {
      const pixel = analyzePixelRow(data, info, testX, row.y, 5);
      const cloudRating = mapRgbToSeeingRating(pixel);
      console.log(`${row.name} (y=${row.y}): RGB(${pixel.r},${pixel.g},${pixel.b}) → ${cloudRating}/5 rating`);
    });
    console.log("=== END PIXEL DEBUG ===");
    
    // Extract hourly forecast data
    const forecast: ClearSkyCondition[] = [];
    const currentTime = new Date();
    
    // Parse 48 hours of forecast data (standard Clear Sky Chart format)
    for (let hour = 0; hour < 48; hour++) {
      const time = new Date(currentTime.getTime() + (hour * 60 * 60 * 1000));
      const hourString = formatTime(time);
      
      // Use precise coordinates from DEFAULT_CHART_CONFIG for each hour
      const config = DEFAULT_CHART_CONFIG;
      
      // Calculate precise X coordinate for this hour
      const hourX = config.parameters.cloudCover.x + (hour * config.hourlySpacing);
      
      // Sample pixels using precise coordinates for each parameter
      const cloudCover = analyzePixelRow(data, info, hourX, config.parameters.cloudCover.y, 3);
      const transparency = analyzePixelRow(data, info, hourX, config.parameters.transparency.y, 3);
      const seeing = analyzePixelRow(data, info, hourX, config.parameters.seeing.y, 3);
      
      // DEBUG: Log RGB values being sampled
      if (hour <= 2) {
        console.log(`[Hour ${hour}] Sampling coordinates:`);
        console.log(`  CloudCover at (${hourX}, ${config.parameters.cloudCover.y}): RGB(${cloudCover.r},${cloudCover.g},${cloudCover.b})`);
        console.log(`  Transparency at (${hourX}, ${config.parameters.transparency.y}): RGB(${transparency.r},${transparency.g},${transparency.b})`);
        console.log(`  Seeing at (${hourX}, ${config.parameters.seeing.y}): RGB(${seeing.r},${seeing.g},${seeing.b})`);
        console.log(`  Image dimensions: ${info.width}x${info.height}`);
      }
      const smoke = analyzePixelRow(data, info, hourX, config.parameters.smoke.y, 3);
      const wind = analyzePixelRow(data, info, hourX, config.parameters.wind.y, 3);
      
      // Map colors to 1-5 ratings using unified RGB color scale (dark blue = excellent, white = poor)
      const cloudRating = mapRgbToSeeingRating(cloudCover);
      const transparencyRating = mapRgbToSeeingRating(transparency);
      const seeingRating = mapRgbToSeeingRating(seeing);
      const smokeRating = mapRgbToSeeingRating(smoke);
      const windRating = mapRgbToSeeingRating(wind);
      
      // DEBUG: Log direct 1-5 ratings
      if (hour <= 3) {
        console.log(`[Hour ${hour}] Direct 1-5 Ratings:`);
        console.log(`  Cloud: RGB(${cloudCover.r},${cloudCover.g},${cloudCover.b}) → ${cloudRating}/5`);
        console.log(`  Transparency: RGB(${transparency.r},${transparency.g},${transparency.b}) → ${transparencyRating}/5`);
        console.log(`  Seeing: RGB(${seeing.r},${seeing.g},${seeing.b}) → ${seeingRating}/5`);
        console.log(`  Smoke: RGB(${smoke.r},${smoke.g},${smoke.b}) → ${smokeRating}/5`);
        console.log(`  Wind: RGB(${wind.r},${wind.g},${wind.b}) → ${windRating}/5`);
      }
      
      // Log mapped values for first few hours
      if (hour < 5) {
        console.log(`[Sharp] Hour ${hour} - All 1-5 scale: Cloud=${cloudRating}/5, Trans=${transparencyRating}/5, Seeing=${seeingRating}/5`);
      }
      
      forecast.push({
        time: hourString,
        cloudCover: cloudRating,        // 1-5 scale (5=excellent, 1=poor)
        transparency: transparencyRating, // 1-5 scale (5=excellent, 1=poor)
        seeingRating: seeingRating,     // 1-5 scale (5=excellent, 1=poor)
        smoke: smokeRating,             // 1-5 scale (5=excellent, 1=poor)
        windSpeed: windRating,          // 1-5 scale (5=excellent, 1=poor)
        temperature: 4,                 // Default good temperature (legacy compatibility)
        humidity: 4                     // Default good humidity (legacy compatibility)
      });
    }
    
    return forecast;
    
  } catch (error) {
    throw new Error(`Sharp image analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Analyze pixel colors in a specific row and column
 */
function analyzePixelRow(
  data: Buffer, 
  info: { width: number; height: number; channels: number }, 
  columnX: number, 
  rowY: number, 
  rowHeight: number
): { r: number; g: number; b: number } {
  
  // Sample multiple pixels in the cell and average the color
  const samples: { r: number; g: number; b: number }[] = [];
  
  // Sample a grid of pixels within the cell for better accuracy
  const gridSize = 3; // 3x3 sampling grid
  const halfGrid = Math.floor(gridSize / 2);
  
  for (let dy = -halfGrid; dy <= halfGrid; dy++) {
    for (let dx = -halfGrid; dx <= halfGrid; dx++) {
      const x = Math.floor(columnX + dx * 2); // Spread out samples
      const y = Math.floor(rowY + (rowHeight / 2) + dy); // Center on row middle
      
      // Ensure we don't go out of bounds
      if (x >= 0 && x < info.width && y >= 0 && y < info.height) {
        const pixelIndex = (y * info.width + x) * info.channels;
        
        // Ensure pixel index is valid
        if (pixelIndex + 2 < data.length) {
          samples.push({
            r: data[pixelIndex] || 0,
            g: data[pixelIndex + 1] || 0,
            b: data[pixelIndex + 2] || 0
          });
        }
      }
    }
  }
  
  // Return average color
  if (samples.length === 0) {
    return { r: 255, g: 255, b: 255 }; // Default to white
  }
  
  const avgR = Math.round(samples.reduce((sum, s) => sum + s.r, 0) / samples.length);
  const avgG = Math.round(samples.reduce((sum, s) => sum + s.g, 0) / samples.length);
  const avgB = Math.round(samples.reduce((sum, s) => sum + s.b, 0) / samples.length);
  
  return { r: avgR, g: avgG, b: avgB };
}

/**
 * NOTE: All color mapping now uses the unified RGB color scale from clear-sky-color-scale.ts
 * The scale follows the Clear Sky Chart standard: Dark Blue = Excellent, White = Poor
 * Individual mapping functions have been removed in favor of mapRgbToSeeingRating()
 */

/**
 * Format time as HH:MM string
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false 
  });
}

/**
 * Analyze observing conditions for a specific time window
 */
export function analyzeObservingConditions(
  chartData: ClearSkyForecastData,
  startTime: string,
  endTime: string
): Array<{
  time: string;
  quality: 'excellent' | 'good' | 'dubious' | 'poor';
  reason: string;
  cloudCover: number;
  seeingRating: number;
  transparency: number;
}> {
  const startHour = parseInt(startTime.split(':')[0]);
  const endHour = parseInt(endTime.split(':')[0]);
  
  return chartData.forecast
    .filter((condition: ClearSkyCondition) => {
      const hour = parseInt(condition.time.split(':')[0]);
      if (startHour <= endHour) {
        return hour >= startHour && hour <= endHour;
      } else {
        // Handle overnight periods
        return hour >= startHour || hour <= endHour;
      }
    })
    .map((condition: ClearSkyCondition) => {
      const quality = determineConditionQuality(condition);
      const reason = generateConditionReason(condition, quality);
      
      return {
        time: condition.time,
        quality,
        reason,
        cloudCover: condition.cloudCover,
        seeingRating: condition.seeingRating,
        transparency: condition.transparency
      };
    });
}

/**
 * Determine observing quality based on multiple factors
 */
function determineConditionQuality(condition: ClearSkyCondition): 'excellent' | 'good' | 'dubious' | 'poor' {
  const cloudScore = (100 - condition.cloudCover) / 100 * 4; // 0-4
  const transparencyScore = condition.transparency; // 1-5, normalize to 0-4
  const seeingScore = condition.seeingRating; // 1-5, normalize to 0-4
  
  // Weighted average: clouds most important, then transparency, then seeing
  const overallScore = (cloudScore * 0.5 + (transparencyScore - 1) * 0.3 + (seeingScore - 1) * 0.2);
  
  if (overallScore >= 3.5) return 'excellent';
  if (overallScore >= 2.5) return 'good';
  if (overallScore >= 1.5) return 'dubious';
  return 'poor';
}

/**
 * Generate human-readable reason for the condition quality
 */
function generateConditionReason(condition: ClearSkyCondition, quality: string): string {
  if (condition.cloudCover > 75) {
    return 'Heavy cloud cover prevents observation';
  }
  if (condition.cloudCover > 50) {
    return 'Moderate clouds may obstruct targets';
  }
  if (condition.transparency < 2) {
    return 'Poor atmospheric transparency';
  }
  if (condition.seeingRating < 2) {
    return 'Poor seeing conditions';
  }
  if (quality === 'excellent') {
    return 'Excellent conditions for all observations';
  }
  if (quality === 'good') {
    return 'Good conditions for most observations';
  }
  if (quality === 'dubious') {
    return 'Marginal conditions, some observations possible';
  }
  return 'Clear skies with good transparency and seeing';
}

/**
 * Test color mappings for debugging
 */
export function testColorMappings() {
  // Test exact colors that should appear in white/gray areas
  const testColors = [
    { name: "Pure White", r: 255, g: 255, b: 255 },
    { name: "Light Gray", r: 245, g: 245, b: 245 },
    { name: "Medium Gray", r: 224, g: 224, b: 224 },
    { name: "Dark Gray", r: 192, g: 192, b: 192 },
    { name: "Off White", r: 248, g: 248, b: 248 },
    { name: "Very Light Gray", r: 240, g: 240, b: 240 },
    { name: "Dark Blue", r: 0, g: 0, b: 128 },
    { name: "Medium Blue", r: 64, g: 128, b: 255 },
  ];
  
  console.log("=== COLOR MAPPING TEST ===");
  testColors.forEach(color => {
    const cloudRating = mapRgbToSeeingRating(color);
    const transRating = mapRgbToSeeingRating(color);
    const seeingRating = mapRgbToSeeingRating(color);
    console.log(`${color.name} (${color.r},${color.g},${color.b}): Cloud=${cloudRating}/5, Trans=${transRating}/5, Seeing=${seeingRating}/5`);
  });
  console.log("=== END TEST ===");
}

/**
 * Create a debug image with markers showing where pixels are sampled
 */
async function createDebugImageWithMarkers(imageBuffer: Buffer, info: { width: number; height: number }): Promise<void> {
  try {
    // Create a copy of the original image
    const debugImage = sharp(imageBuffer);
    
    // Standard row positions based on image analysis
    const dataStartX = Math.floor(info.width * 0.12);
    const dataWidth = Math.floor(info.width * 0.75);
    
    // Test positions for each factor row - CORRECTED based on actual chart
    const rowPositions = [
      { name: "Cloud Cover", y: Math.floor(info.height * 0.19), color: "#FF0000" },      // 1st row - WHITE/GRAY
      { name: "ECMWF Cloud", y: Math.floor(info.height * 0.26), color: "#FF8800" },      // 2nd row - BLUE
      { name: "Transparency", y: Math.floor(info.height * 0.33), color: "#00FF00" },     // 3rd row - WHITE
      { name: "Seeing", y: Math.floor(info.height * 0.40), color: "#0000FF" },           // 4th row - WHITE/BLUE
      { name: "Darkness", y: Math.floor(info.height * 0.47), color: "#FF00FF" },         // 5th row - BLUE (varies day/night)
      { name: "Smoke", y: Math.floor(info.height * 0.54), color: "#FFFF00" },            // 6th row - BLUE
      { name: "Wind", y: Math.floor(info.height * 0.61), color: "#00FFFF" },             // 7th row - BLUE (varies)
      { name: "Humidity", y: Math.floor(info.height * 0.68), color: "#FFA500" },         // 8th row - RED!!!
      { name: "Temperature", y: Math.floor(info.height * 0.75), color: "#800080" }       // 9th row - GREEN/YELLOW/RED
    ];
    
    // Create SVG overlay with markers
    let svgOverlay = `<svg width="${info.width}" height="${info.height}">`;
    
    rowPositions.forEach(row => {
      // Add horizontal line across the row
      svgOverlay += `<line x1="${dataStartX}" y1="${row.y}" x2="${dataStartX + dataWidth}" y2="${row.y}" stroke="${row.color}" stroke-width="2" opacity="0.7"/>`;
      
      // Add label
      svgOverlay += `<text x="${dataStartX - 10}" y="${row.y + 5}" fill="${row.color}" font-size="12" font-weight="bold" text-anchor="end">${row.name}</text>`;
      
      // Add sample points every few columns
      for (let col = 0; col < 12; col++) {
        const x = dataStartX + (col * Math.floor(dataWidth / 12));
        svgOverlay += `<circle cx="${x}" cy="${row.y}" r="3" fill="${row.color}" opacity="0.8"/>`;
      }
    });
    
    svgOverlay += '</svg>';
    
    // Composite the markers onto the image
    await debugImage
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .png()
      .toBuffer();
    
    // Save debug image (you can save this to inspect visually)
    console.log("[DEBUG] Debug image with sampling markers created");
    
    // Log the row positions being used
    console.log("=== ROW SAMPLING POSITIONS ===");
    rowPositions.forEach(row => {
      console.log(`${row.name}: y=${row.y} (${Math.round((row.y / info.height) * 100)}% from top)`);
    });
    console.log("=== END ROW POSITIONS ===");
    
  } catch (error) {
    console.error("[DEBUG] Failed to create debug image:", error);
  }
}
