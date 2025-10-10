// Clear Sky Chart parser for real astronomical weather data
import sharp from 'sharp';

export interface ClearSkyCondition {
  time: string;
  cloudCover: number; // 0-100%
  transparency: number; // 1-5 scale
  seeingRating: number; // 1-5 scale
  temperature: number; // Celsius
  humidity: number; // 0-100%
  windSpeed: number; // mph
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
    const chartId = gifMatch[1]; // e.g., "BgNstObTN" from BgNstObTNcsk.gif
    return {
      chartId,
      imageUrl: url, // Use the provided GIF URL directly
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
    // Fetch the actual chart page to get location name
    const pageResponse = await fetch(chartUrl);
    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch chart page: ${pageResponse.status}`);
    }
    
    const html = await pageResponse.text();
    const locationMatch = html.match(/<title>(.+?) Clear Sky Chart/);
    const location = locationMatch ? locationMatch[1] : 'Unknown Location';
    
    // Extract the image URL from the config instead of generating it
    // The config should have the correct image URL with cache parameters
    const { chartId } = parseClearSkyChartUrl(chartUrl);
    const imageUrl = `https://www.cleardarksky.com/c/${chartId}csk.gif?c=774043`;
    
    // Parse the actual chart image
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
    // Get image metadata and pixel data
    const image = sharp(imageBuffer);
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    
    console.log(`[Sharp] Image dimensions: ${info.width}x${info.height}, channels: ${info.channels}`);
    
    // Clear Sky Chart standard layout analysis
    const chartLayout = analyzeChartLayout(info.width, info.height);
    
    // Extract hourly forecast data
    const forecast: ClearSkyCondition[] = [];
    const currentTime = new Date();
    
    // Parse 48 hours of forecast data (standard Clear Sky Chart format)
    for (let hour = 0; hour < 48; hour++) {
      const time = new Date(currentTime.getTime() + (hour * 60 * 60 * 1000));
      const hourString = formatTime(time);
      
      // Calculate column position for this hour
      const columnX = chartLayout.dataStartX + (hour * chartLayout.columnWidth);
      
      // Sample pixels from each parameter row
      const cloudCover = analyzePixelRow(data, info, columnX, chartLayout.cloudCoverRow, chartLayout.rowHeight);
      const transparency = analyzePixelRow(data, info, columnX, chartLayout.transparencyRow, chartLayout.rowHeight);
      const seeing = analyzePixelRow(data, info, columnX, chartLayout.seeingRow, chartLayout.rowHeight);
      
      forecast.push({
        time: hourString,
        cloudCover: mapCloudCoverColor(cloudCover),
        transparency: mapTransparencyColor(transparency),
        seeingRating: mapSeeingColor(seeing),
        temperature: 10, // Default value - not available in chart
        humidity: 50,    // Default value - not available in chart  
        windSpeed: 5     // Default value - not available in chart
      });
    }
    
    return forecast;
    
  } catch (error) {
    throw new Error(`Sharp image analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Analyze the layout structure of a Clear Sky Chart
 */
function analyzeChartLayout(width: number, height: number) {
  // Standard Clear Sky Chart layout (approximate values)
  return {
    dataStartX: Math.floor(width * 0.08),        // ~8% from left edge
    dataWidth: Math.floor(width * 0.84),         // ~84% of total width  
    columnWidth: Math.floor(width * 0.84 / 48),  // 48 columns for 48 hours
    
    cloudCoverRow: Math.floor(height * 0.32),    // ~32% from top
    transparencyRow: Math.floor(height * 0.42),  // ~42% from top
    seeingRow: Math.floor(height * 0.52),        // ~52% from top
    rowHeight: Math.floor(height * 0.08),        // ~8% row height
  };
}

/**
 * Analyze pixel colors in a specific row and column
 */
function analyzePixelRow(
  pixelData: Buffer, 
  info: { width: number; height: number; channels: number }, 
  columnX: number, 
  rowY: number, 
  rowHeight: number
): { r: number; g: number; b: number } {
  
  // Sample multiple pixels in the cell and average the color
  const samples: { r: number; g: number; b: number }[] = [];
  const sampleCount = 5;
  
  for (let i = 0; i < sampleCount; i++) {
    const x = Math.floor(columnX + (i * 2)); // Sample across column width
    const y = Math.floor(rowY + (rowHeight / 2)); // Sample middle of row
    
    // Ensure we don't go out of bounds
    if (x >= 0 && x < info.width && y >= 0 && y < info.height) {
      const pixelIndex = (y * info.width + x) * info.channels;
      
      samples.push({
        r: pixelData[pixelIndex] || 0,
        g: pixelData[pixelIndex + 1] || 0,
        b: pixelData[pixelIndex + 2] || 0
      });
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
 * Map cloud cover pixel color to percentage (0-100%)
 */
export function mapCloudCoverColor(color: { r: number; g: number; b: number }): number {
  const { r, g, b } = color;
  
  // Clear Sky Chart cloud cover color mapping
  if (isColorMatch(r, g, b, 0, 0, 128)) return 0;      // Dark blue = clear (0%)
  if (isColorMatch(r, g, b, 64, 128, 255)) return 15;  // Light blue = 10-25%
  if (isColorMatch(r, g, b, 128, 192, 255)) return 35; // Lighter blue = 25-50%
  if (isColorMatch(r, g, b, 255, 255, 255)) return 65; // White = 50-75%
  if (isColorMatch(r, g, b, 192, 192, 192)) return 85; // Light gray = 75-90%
  if (isColorMatch(r, g, b, 128, 128, 128)) return 95; // Dark gray = 90-100%
  
  // Default based on brightness
  const brightness = (r + g + b) / 3;
  return Math.round((brightness / 255) * 100);
}

/**
 * Map transparency pixel color to 1-5 scale
 */
export function mapTransparencyColor(color: { r: number; g: number; b: number }): number {
  const { r, g, b } = color;
  
  // Clear Sky Chart transparency color mapping (reverse of cloud cover)
  if (isColorMatch(r, g, b, 255, 255, 255)) return 1;  // White = too cloudy (1)
  if (isColorMatch(r, g, b, 224, 224, 224)) return 2;  // Light gray = poor (2)
  if (isColorMatch(r, g, b, 160, 160, 160)) return 2;  // Med gray = below avg (2)
  if (isColorMatch(r, g, b, 64, 128, 255)) return 3;   // Light blue = average (3)
  if (isColorMatch(r, g, b, 0, 64, 255)) return 4;     // Med blue = above avg (4)
  if (isColorMatch(r, g, b, 0, 0, 128)) return 5;      // Dark blue = excellent (5)
  
  // Default based on blue intensity (more blue = better transparency)
  const blueRatio = b / Math.max(r + g + b, 1);
  return Math.max(1, Math.min(5, Math.round(1 + (blueRatio * 4))));
}

/**
 * Map seeing pixel color to 1-5 scale
 */
export function mapSeeingColor(color: { r: number; g: number; b: number }): number {
  const { r, g, b } = color;
  
  // Clear Sky Chart seeing color mapping (same as transparency)
  if (isColorMatch(r, g, b, 255, 255, 255)) return 1;  // White = too cloudy (1)
  if (isColorMatch(r, g, b, 224, 224, 224)) return 1;  // Light gray = bad (1)
  if (isColorMatch(r, g, b, 160, 160, 160)) return 2;  // Med gray = poor (2)
  if (isColorMatch(r, g, b, 64, 128, 255)) return 3;   // Light blue = average (3)
  if (isColorMatch(r, g, b, 0, 64, 255)) return 4;     // Med blue = good (4)
  if (isColorMatch(r, g, b, 0, 0, 128)) return 5;      // Dark blue = excellent (5)
  
  // Default based on blue intensity
  const blueRatio = b / Math.max(r + g + b, 1);
  return Math.max(1, Math.min(5, Math.round(1 + (blueRatio * 4))));
}

/**
 * Check if color matches target with tolerance
 */
function isColorMatch(r: number, g: number, b: number, targetR: number, targetG: number, targetB: number, tolerance: number = 30): boolean {
  return Math.abs(r - targetR) <= tolerance && 
         Math.abs(g - targetG) <= tolerance && 
         Math.abs(b - targetB) <= tolerance;
}

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
