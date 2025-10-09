// Clear Sky Chart parser for real astronomical weather data

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
  // Extract chart ID from URL like https://www.cleardarksky.com/c/MplVllyObWAkey.html
  const match = url.match(/\/c\/([^\/]+)\.html/);
  if (!match) {
    throw new Error('Invalid Clear Sky Chart URL format');
  }
  
  const fullId = match[1]; // e.g., "MplVllyObWAkey"
  // Remove the "key" suffix to get the base chart ID
  const chartId = fullId.replace(/key$/, ''); // e.g., "MplVllyObWA"
  
  return {
    chartId,
    imageUrl: `https://www.cleardarksky.com/c/${chartId}csk.gif`,
    dataUrl: url // We'll scrape this for data
  };
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
    // Fetch the image to validate it exists
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch chart image: ${response.status} ${response.statusText} from ${imageUrl}`);
    }
    
    const imageBuffer = await response.arrayBuffer();
    
    // For now, throw an error with clear instructions about what needs to be implemented
    throw new Error(`Clear Sky Chart image parsing not yet implemented. 

REQUIRED: Need to implement pixel color analysis for the fetched ${imageBuffer.byteLength} byte image.

The image contains colored blocks representing:
- Cloud Cover: Dark blue (clear) to white (overcast)
- Transparency: White (too cloudy) to dark blue (transparent)  
- Seeing: White (too cloudy) to dark blue (excellent 5/5)

Image URL: ${imageUrl}

This should parse the actual colored pixels according to the Clear Sky Chart legend 
and return hourly ClearSkyCondition data for the next 48 hours.`);
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('parsing not yet implemented')) {
      throw error; // Re-throw the implementation message
    }
    throw new Error(`Clear Sky Chart image access failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
