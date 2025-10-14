// Clear Sky Chart parser with adaptive coordinate detection
import sharp from 'sharp';
import { mapRgbToSeeingRating } from './clear-sky-color-scale';

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
 * Auto-detect Clear Sky Chart structure and coordinates
 */
async function detectChartCoordinates(imageBuffer: Buffer): Promise<any> {
  const image = sharp(imageBuffer);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  
  console.log(`[Chart Detection] Analyzing ${info.width}x${info.height} image`);
  
  // Find chart boundaries
  let chartTop = 0, chartBottom = info.height, chartLeft = 0, chartRight = info.width;
  
  // Find top boundary (skip header)
  for (let y = 0; y < info.height; y++) {
    let colorfulPixels = 0;
    for (let x = Math.floor(info.width * 0.2); x < Math.floor(info.width * 0.8); x += 10) {
      const pixel = getPixelColor(data, info, x, y);
      if (isColorful(pixel)) colorfulPixels++;
    }
    if (colorfulPixels > 3) {
      chartTop = y;
      break;
    }
  }
  
  // Find bottom boundary
  for (let y = info.height - 1; y >= 0; y--) {
    let colorfulPixels = 0;
    for (let x = Math.floor(info.width * 0.2); x < Math.floor(info.width * 0.8); x += 10) {
      const pixel = getPixelColor(data, info, x, y);
      if (isColorful(pixel)) colorfulPixels++;
    }
    if (colorfulPixels > 3) {
      chartBottom = y;
      break;
    }
  }
  
  const chartHeight = chartBottom - chartTop;
  
  // Detect column spacing
  const sampleY = chartTop + Math.floor(chartHeight * 0.3);
  const transitions = [];
  let lastSignificantX = chartLeft;
  
  for (let x = chartLeft; x < chartRight; x++) {
    const pixel = getPixelColor(data, info, x, sampleY);
    if (x > chartLeft) {
      const prevPixel = getPixelColor(data, info, x - 1, sampleY);
      const colorDiff = Math.abs(pixel.r - prevPixel.r) + Math.abs(pixel.g - prevPixel.g) + Math.abs(pixel.b - prevPixel.b);
      
      if (colorDiff > 80 && x - lastSignificantX > 5) {
        transitions.push({ x, width: x - lastSignificantX });
        lastSignificantX = x;
      }
    }
  }
  
  const widths = transitions.map(t => t.width).filter(w => w > 8 && w < 50);
  const avgWidth = widths.length > 0 ? Math.round(widths.reduce((sum, w) => sum + w, 0) / widths.length) : 14;
  
  // Find first hour column
  let firstHourX = chartLeft + 20;
  for (let x = chartLeft; x < chartLeft + 200; x++) {
    let colorfulVertical = 0;
    for (let y = chartTop + 20; y < chartBottom - 20; y += 5) {
      const pixel = getPixelColor(data, info, x, y);
      if (isColorful(pixel)) colorfulVertical++;
    }
    if (colorfulVertical > 8) {
      firstHourX = x;
      break;
    }
  }
  
  // Parameter rows based on analysis of Albuquerque chart
  const parameterRows = {
    cloudCover: { x: firstHourX, y: chartTop + Math.floor(chartHeight * 0.15) },
    transparency: { x: firstHourX, y: chartTop + Math.floor(chartHeight * 0.35) },
    seeing: { x: firstHourX, y: chartTop + Math.floor(chartHeight * 0.45) },
    smoke: { x: firstHourX, y: chartTop + Math.floor(chartHeight * 0.65) },
    wind: { x: firstHourX, y: chartTop + Math.floor(chartHeight * 0.75) }
  };
  
  console.log(`[Chart Detection] First hour: x=${firstHourX}, spacing: ${avgWidth}px`);
  console.log(`[Chart Detection] Chart bounds: ${chartLeft},${chartTop} to ${chartRight},${chartBottom}`);
  
  return {
    parameters: parameterRows,
    hourlySpacing: avgWidth,
    maxHours: 48,
    chartBounds: { top: chartTop, bottom: chartBottom, left: chartLeft, right: chartRight }
  };
}

function getPixelColor(data: Buffer, info: any, x: number, y: number) {
  if (x < 0 || x >= info.width || y < 0 || y >= info.height) return { r: 0, g: 0, b: 0 };
  const index = (y * info.width + x) * info.channels;
  return {
    r: data[index] || 0,
    g: data[index + 1] || 0,
    b: data[index + 2] || 0
  };
}

function isColorful(pixel: { r: number; g: number; b: number }): boolean {
  const { r, g, b } = pixel;
  const total = r + g + b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max > 0 ? (max - min) / max : 0;
  
  return total > 50 && total < 700 && (saturation > 0.2 || (r > 100 && g > 100 && b > 100));
}

/**
 * Fetch Clear Sky Chart data by parsing the actual chart image
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
 * Parse the Clear Sky Chart image with adaptive coordinate detection
 */
async function parseClearSkyChartImage(imageUrl: string): Promise<ClearSkyCondition[]> {
  try {
    console.log(`[Clear Sky Parser] Starting adaptive analysis of ${imageUrl}`);
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch chart image: ${response.status} ${response.statusText}`);
    }
    
    const imageBuffer = await response.arrayBuffer();
    console.log(`[Clear Sky Parser] Fetched ${imageBuffer.byteLength} bytes`);
    
    // Auto-detect chart coordinates
    const detectedConfig = await detectChartCoordinates(Buffer.from(imageBuffer));
    
    // Analyze with detected coordinates
    const forecast = await analyzeImageWithDetectedCoordinates(Buffer.from(imageBuffer), detectedConfig);
    
    console.log(`[Clear Sky Parser] Successfully parsed ${forecast.length} hourly conditions`);
    return forecast;
    
  } catch (error) {
    console.error(`[Clear Sky Parser] Failed: ${error}`);
    throw new Error(`Clear Sky Chart parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Analyze Clear Sky Chart image using detected coordinates
 */
async function analyzeImageWithDetectedCoordinates(imageBuffer: Buffer, config: any): Promise<ClearSkyCondition[]> {
  const image = sharp(imageBuffer);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  
  console.log(`[Adaptive Parser] Using detected coordinates:`);
  console.log(`  Cloud Cover: (${config.parameters.cloudCover.x}, ${config.parameters.cloudCover.y})`);
  console.log(`  Transparency: (${config.parameters.transparency.x}, ${config.parameters.transparency.y})`);
  console.log(`  Spacing: ${config.hourlySpacing}px`);
  
  const forecast: ClearSkyCondition[] = [];
  const currentTime = new Date();
  
  for (let hour = 0; hour < 48; hour++) {
    const time = new Date(currentTime.getTime() + (hour * 60 * 60 * 1000));
    const hourString = formatTime(time);
    
    const hourX = config.parameters.cloudCover.x + (hour * config.hourlySpacing);
    
    // Stop if we go beyond chart boundaries
    if (hourX >= config.chartBounds.right - 10) break;
    
    // Sample each parameter row
    const cloudCover = analyzePixelArea(data, info, hourX, config.parameters.cloudCover.y, 3);
    const transparency = analyzePixelArea(data, info, hourX, config.parameters.transparency.y, 3);
    const seeing = analyzePixelArea(data, info, hourX, config.parameters.seeing.y, 3);
    const smoke = analyzePixelArea(data, info, hourX, config.parameters.smoke.y, 3);
    const wind = analyzePixelArea(data, info, hourX, config.parameters.wind.y, 3);
    
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
    const smokeRating = mapRgbToSeeingRating(smoke);
    const windRating = mapRgbToSeeingRating(wind);
    
    if (hour <= 3) {
      console.log(`[Hour ${hour}] Ratings: Cloud=${cloudRating}/5, Trans=${transparencyRating}/5, Seeing=${seeingRating}/5`);
    }
    
    forecast.push({
      time: hourString,
      cloudCover: cloudRating,
      transparency: transparencyRating,
      seeingRating: seeingRating,
      smoke: smokeRating,
      windSpeed: windRating,
      temperature: 4,
      humidity: 4
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
    minute: '2-digit', 
    hour12: false 
  });
}
