/**
 * Enhanced Clear Sky Chart Parser with Precise Coordinate System
 * 
 * User's Specifications:
 * 1. Sample 8x8 pixel areas (center ±4 pixels)
 * 2. Analyze first 24 hours only 
 * 3. Use precise coordinate grid from user measurements
 */

import sharp from 'sharp';
import { LocationConfig } from '@/types/observation';
import { 
  inferChartGenerationTime,
  calculateDynamicObservingWindow,
  getTimingDescription,
  ChartTimeMapping,
  DynamicObservingWindow
} from './chart-time-sync';
import {
  ChartCoordinates,
  ChartGrid,
  SamplingArea,
  generateChartGrid,
  getSamplingArea,
  validateCoordinates
} from './chart-coordinates';

// Interfaces - 5 key factors + legacy compatibility fields
export interface ClearSkyCondition {
  time: string;
  actualTime: Date;
  columnIndex: number;
  cloudCover: number;
  transparency: number;
  seeing: number;
  seeingRating: number; // For API compatibility 
  smoke: number;
  windSpeed: number;
  // Legacy compatibility fields (not actively used)
  temperature: number;
  humidity: number;
}

export interface ClearSkyForecast {
  forecast: ClearSkyCondition[];
  timing: {
    observingWindow: DynamicObservingWindow;
    chartTiming: ChartTimeMapping;
    description: string;
    coverage: { adequate: boolean; missingHours: number; warning?: string };
  };
  metadata: {
    chartUrl: string;
    parsedAt: string;
    totalColumns: number;
    relevantColumns: number;
  };
}



/**
 * Enhanced Clear Sky Chart Parser with User-Defined Coordinate System
 * 
 * Uses precise user-provided coordinates for 8x8 pixel sampling areas
 * Analyzes 24 hours maximum with proper time synchronization
 */
export async function fetchClearSkyChartDataEnhanced(
  chartUrl: string,
  location: LocationConfig,
  coordinates: ChartCoordinates,
  currentTime: Date = new Date(),
  startOffset: number = 60,
  endOffset: number = 60
): Promise<ClearSkyForecast> {
  try {
    console.log(`[Enhanced Parser] Fetching Clear Sky Chart: ${chartUrl}`);
    
    // Generate coordinate grid from user input
    const grid = generateChartGrid(coordinates);
    console.log(`[Enhanced Parser] Generated grid for ${coordinates.maxHours} hours with ${coordinates.hourlySpacing}px spacing`);
    
    // Determine chart generation time and column mapping
    const chartTiming = inferChartGenerationTime(chartUrl, currentTime);
    console.log(`[Enhanced Parser] Chart generated at: ${chartTiming.generatedAt.toISOString()}`);
    console.log(`[Enhanced Parser] Chart age: ${Math.round(chartTiming.chartAgeHours * 10) / 10} hours`);
    
    // Calculate dynamic observing window
    const observingWindow = calculateDynamicObservingWindow(currentTime, location, startOffset, endOffset);
    console.log(`[Enhanced Parser] Observing window: ${observingWindow.start.toISOString()} to ${observingWindow.end.toISOString()}`);
    
    // Fetch and process chart image
    const response = await fetch(chartUrl.replace('.html', 'csk.gif'));
    if (!response.ok) {
      throw new Error(`Failed to fetch chart image: ${response.status}`);
    }
    
    const imageBuffer = await response.arrayBuffer();
    const image = sharp(Buffer.from(imageBuffer));
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    
    // Validate coordinates against image dimensions
    const validation = validateCoordinates(coordinates, info.width, info.height);
    if (!validation.valid) {
      console.warn(`[Enhanced Parser] Coordinate validation warnings:`, validation.errors);
    }
    
    // Determine relevant hours for analysis
    const relevantHours = determineRelevantHours(chartTiming, observingWindow, coordinates.maxHours);
    console.log(`[Enhanced Parser] Analyzing hours: ${relevantHours.join(', ')} (${relevantHours.length} of ${coordinates.maxHours} total)`);
    
    // Parse conditions for relevant hours only
    const forecast: ClearSkyCondition[] = [];
    
    for (const hour of relevantHours) {
      const actualTime = new Date(chartTiming.firstColumnTime.getTime() + (hour * 60 * 60 * 1000));
      
      // Sample each parameter using 6x6 areas (center ± 3 pixels) - 5 key factors
      const condition: ClearSkyCondition = {
        time: actualTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        actualTime,
        columnIndex: hour,
        cloudCover: await sampleParameter(data, info, grid, 'cloudCover', hour),
        transparency: await sampleParameter(data, info, grid, 'transparency', hour),
        seeing: await sampleParameter(data, info, grid, 'seeing', hour),
        seeingRating: await sampleParameter(data, info, grid, 'seeing', hour), // Duplicate for API compatibility
        smoke: await sampleParameter(data, info, grid, 'smoke', hour),
        windSpeed: await sampleParameter(data, info, grid, 'wind', hour),
        // Legacy compatibility fields with default values
        temperature: 45,  // Default temperature
        humidity: 60      // Default humidity
      };
      
      forecast.push(condition);
    }
    
    // Calculate coverage and timing
    const coverage = {
      adequate: relevantHours.length > 0,
      missingHours: Math.max(0, observingWindow.totalHours - relevantHours.length),
      warning: relevantHours.length === 0 ? 'No chart data available for observing window' : undefined
    };
    
    const timingDescription = getTimingDescription(observingWindow, chartTiming, relevantHours.length);
    
    console.log(`[Enhanced Parser] Successfully parsed ${forecast.length} conditions using 8x8 pixel sampling`);
    
    return {
      forecast,
      timing: {
        observingWindow,
        chartTiming,
        description: timingDescription,
        coverage
      },
      metadata: {
        chartUrl,
        parsedAt: new Date().toISOString(),
        totalColumns: coordinates.maxHours,
        relevantColumns: relevantHours.length
      }
    };
    
  } catch (error) {
    console.error('[Enhanced Parser] Error:', error);
    throw new Error(`Failed to parse Clear Sky Chart: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Determine which hours from the 24-hour grid are relevant for the observing window
 */
function determineRelevantHours(
  chartTiming: ChartTimeMapping, 
  observingWindow: DynamicObservingWindow, 
  maxHours: number
): number[] {
  const relevantHours: number[] = [];
  
  for (let hour = 0; hour < maxHours; hour++) {
    const hourTime = new Date(chartTiming.firstColumnTime.getTime() + (hour * 60 * 60 * 1000));
    
    // Check if this hour falls within the observing window
    if (hourTime >= observingWindow.start && hourTime <= observingWindow.end) {
      relevantHours.push(hour);
    }
  }
  
  return relevantHours;
}

/**
 * Sample RGB values from 8x8 pixel area and return averaged result
 */
async function sampleArea8x8(data: Buffer, info: any, area: SamplingArea): Promise<{ r: number; g: number; b: number }> {
  const channels = info.channels;
  const width = info.width;
  
  let totalR = 0, totalG = 0, totalB = 0;
  let pixelCount = 0;
  
  // Sample all pixels in the 8x8 area
  for (let y = area.bounds.minY; y <= area.bounds.maxY; y++) {
    for (let x = area.bounds.minX; x <= area.bounds.maxX; x++) {
      // Ensure coordinates are within image bounds
      if (x >= 0 && x < width && y >= 0 && y < info.height) {
        const pixelIndex = (y * width + x) * channels;
        
        totalR += data[pixelIndex];
        totalG += data[pixelIndex + 1];
        totalB += data[pixelIndex + 2];
        pixelCount++;
      }
    }
  }
  
  // Return averaged RGB values
  return {
    r: pixelCount > 0 ? Math.round(totalR / pixelCount) : 0,
    g: pixelCount > 0 ? Math.round(totalG / pixelCount) : 0,
    b: pixelCount > 0 ? Math.round(totalB / pixelCount) : 0
  };
}

/**
 * Sample a parameter that returns a numeric value
 */
async function sampleParameter(
  data: Buffer, 
  info: any, 
  grid: ChartGrid, 
  parameter: string, 
  hour: number
): Promise<number> {
  const samplingArea = getSamplingArea(grid, parameter, hour);
  if (!samplingArea) {
    console.warn(`[Enhanced Parser] No sampling area for ${parameter} at hour ${hour}`);
    return 0;
  }
  
  const rgb = await sampleArea8x8(data, info, samplingArea);
  
  // Convert RGB to parameter value using real color analysis - 5 key factors only
  switch (parameter) {
    case 'cloudCover':
      // Convert to percentage (0-100%) - darker = more clouds
      const gray = (rgb.r + rgb.g + rgb.b) / 3;
      return Math.round(((255 - gray) / 255) * 100);
      
    case 'transparency':
      // Clear Sky Chart transparency: Blue tones indicate good transparency
      // Higher blue values = better transparency, convert to 0-100 scale
      const transparencyValue = Math.round((rgb.b / 255) * 100);
      return Math.max(0, Math.min(100, transparencyValue));
      
    case 'seeing':
      // Clear Sky Chart seeing: Green tones indicate good seeing
      // Higher green values = better seeing, convert to 1-5 scale  
      const seeingValue = Math.round(1 + ((rgb.g / 255) * 4));
      return Math.max(1, Math.min(5, seeingValue));
      
    case 'smoke':
      // Smoke scale: Red tones often indicate smoke/haze
      const smokeValue = Math.round((rgb.r / 255) * 100);
      return Math.max(0, Math.min(100, smokeValue));
      
    case 'wind':
      // Wind speed: Convert RGB to reasonable wind speed range
      const windGray = (rgb.r + rgb.g + rgb.b) / 3;
      return Math.round((windGray / 255) * 30); // 0-30 mph range
      
    default:
      return 0;
  }
}
