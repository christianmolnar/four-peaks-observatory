// Clear Sky Chart parser using universal coordinates
import sharp from 'sharp';
import { mapRgbToSeeingRating } from './clear-sky-color-scale';
import { inferChartGenerationTime } from './chart-time-sync';
import { DEFAULT_CHART_CONFIG } from './chart-config';

export interface ClearSkyCondition {
  time: string;
  cloudCover: number; // 1-5 scale (5=excellent, 1=poor)
  transparency: number; // 1-5 scale (5=excellent, 1=poor)
  seeingRating: number; // 1-5 scale (5=excellent, 1=poor)
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
  const gifMatch = url.match(/\/c\/([^\/\?]+)csk\.gif/);
  if (gifMatch) {
    const chartId = gifMatch[1];
    return {
      chartId,
      imageUrl: url.split('?')[0],
      dataUrl: `https://www.cleardarksky.com/c/${chartId}key.html`
    };
  }
  
  const htmlMatch = url.match(/\/c\/([^\/]+)\.html/);
  if (htmlMatch) {
    const fullId = htmlMatch[1];
    const chartId = fullId.replace(/key$/, '');
    return {
      chartId,
      imageUrl: `https://www.cleardarksky.com/c/${chartId}csk.gif`,
      dataUrl: url
    };
  }
  
  throw new Error('Invalid Clear Sky Chart URL format');
}

/**
 * Fetch Clear Sky Chart data using universal coordinates
 */
export async function fetchClearSkyChartData(chartUrl: string): Promise<ClearSkyForecastData> {
  try {
    const { chartId, imageUrl, dataUrl } = parseClearSkyChartUrl(chartUrl);
    
    let location = 'Unknown Location';
    
    // Try to get location name from HTML page
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
      location = chartId.replace(/([A-Z])/g, ' $1').trim() || 'Observatory Location';
    }
    
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
 * Parse the Clear Sky Chart image using universal coordinates
 */
async function parseClearSkyChartImage(imageUrl: string): Promise<ClearSkyCondition[]> {
  try {
    console.log(`[Clear Sky Parser] Starting analysis of ${imageUrl}`);
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch chart image: ${response.status} ${response.statusText}`);
    }
    
    const imageBuffer = await response.arrayBuffer();
    console.log(`[Clear Sky Parser] Fetched ${imageBuffer.byteLength} bytes`);
    
    // Use universal coordinates for ALL charts
    const forecast = await analyzeImageWithCoordinates(Buffer.from(imageBuffer), DEFAULT_CHART_CONFIG, imageUrl);
    
    console.log(`[Clear Sky Parser] Successfully parsed ${forecast.length} hourly conditions`);
    return forecast;
    
  } catch (error) {
    console.error(`[Clear Sky Parser] Failed: ${error}`);
    throw new Error(`Clear Sky Chart parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Analyze Clear Sky Chart image using universal coordinates
 */
async function analyzeImageWithCoordinates(imageBuffer: Buffer, config: any, imageUrl: string): Promise<ClearSkyCondition[]> {
  const image = sharp(imageBuffer);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  
  console.log(`[Universal Parser] Using universal coordinates:`);
  console.log(`  Cloud Cover: (${config.parameters.cloudCover.x}, ${config.parameters.cloudCover.y})`);
  console.log(`  Transparency: (${config.parameters.transparency.x}, ${config.parameters.transparency.y})`);
  console.log(`  Seeing: (${config.parameters.seeing.x}, ${config.parameters.seeing.y})`);
  console.log(`  Smoke: (${config.parameters.smoke.x}, ${config.parameters.smoke.y})`);
  console.log(`  Wind: (${config.parameters.wind.x}, ${config.parameters.wind.y})`);
  console.log(`  Spacing: ${config.hourlySpacing}px`);
  
  const forecast: ClearSkyCondition[] = [];
  
  // Parse chart header to get the actual first hour from HTML "last updated" time
  const chartTimeMapping = await inferChartGenerationTime(imageUrl);
  
  for (let hour = 0; hour < 48; hour++) {
    // Use actual chart timing from HTML page
    const actualTime = chartTimeMapping.columnHours[hour];
    const hourString = `${actualTime.getHours().toString().padStart(2, '0')}:00`;
    
    const hourX = config.parameters.cloudCover.x + (hour * config.hourlySpacing);
    
    // Stop after max hours configured
    if (hour >= config.maxHours) break;
    
    // Sample each parameter row
    const cloudCover = analyzePixelArea(data, info, hourX, config.parameters.cloudCover.y, 3);
    const transparency = analyzePixelArea(data, info, hourX, config.parameters.transparency.y, 3);
    const seeing = analyzePixelArea(data, info, hourX, config.parameters.seeing.y, 3);
    
    // Log first few hours for debugging
    if (hour <= 2) {
      console.log(`[Hour ${hour}] RGB values:`);
      console.log(`  Cloud: RGB(${cloudCover.r},${cloudCover.g},${cloudCover.b})`);
      console.log(`  Trans: RGB(${transparency.r},${transparency.g},${transparency.b})`);
      console.log(`  Seeing: RGB(${seeing.r},${seeing.g},${seeing.b})`);
    }
    
    // Convert to 1-5 ratings
    const cloudRating = mapRgbToSeeingRating(cloudCover);
    const transparencyRating = mapRgbToSeeingRating(transparency);
    const seeingRating = mapRgbToSeeingRating(seeing);
    
    if (hour <= 3) {
      console.log(`[Hour ${hour}] Ratings: Cloud=${cloudRating}/5, Trans=${transparencyRating}/5, Seeing=${seeingRating}/5`);
    }
    
    forecast.push({
      time: hourString,
      cloudCover: cloudRating,
      transparency: transparencyRating,
      seeingRating: seeingRating
    });
  }
  
  return forecast;
}

/**
 * Sample pixels in an area around the target coordinates
 */
function analyzePixelArea(
  data: Buffer, 
  info: { width: number; height: number; channels: number }, 
  centerX: number, 
  centerY: number, 
  radius: number
): { r: number; g: number; b: number } {
  
  const samples: { r: number; g: number; b: number }[] = [];
  
  // Sample a 3x3 grid around the center point
  for (let dy = -radius; dy <= radius; dy += 2) {
    for (let dx = -radius; dx <= radius; dx += 2) {
      const x = Math.floor(centerX + dx);
      const y = Math.floor(centerY + dy);
      
      if (x >= 0 && x < info.width && y >= 0 && y < info.height) {
        const pixelIndex = (y * info.width + x) * info.channels;
        
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
  
  if (samples.length === 0) return { r: 255, g: 255, b: 255 };
  
  // Return average color
  const avgR = Math.round(samples.reduce((sum, s) => sum + s.r, 0) / samples.length);
  const avgG = Math.round(samples.reduce((sum, s) => sum + s.g, 0) / samples.length);
  const avgB = Math.round(samples.reduce((sum, s) => sum + s.b, 0) / samples.length);
  
  return { r: avgR, g: avgG, b: avgB };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    hour12: false 
  }).split(':')[0] + ':00'; // Remove minutes, show only hour
}
