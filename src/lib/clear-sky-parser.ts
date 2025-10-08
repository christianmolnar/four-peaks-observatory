// Clear Sky Chart parser utilities
import { ClearSkyChartData } from '@/types/observation';

/**
 * Parse Clear Sky Chart URL to extract location info
 */
export function parseClearSkyChartUrl(url: string) {
  // Extract chart ID from URL like https://www.cleardarksky.com/c/MplVllyObWAkey.html
  const match = url.match(/\/c\/([^\/]+)\.html/);
  if (!match) {
    throw new Error('Invalid Clear Sky Chart URL format');
  }
  
  const chartId = match[1];
  return {
    chartId,
    imageUrl: `https://www.cleardarksky.com/c/${chartId}csk.gif`,
    dataUrl: url // We'll scrape this for data
  };
}

/**
 * Fetch and parse Clear Sky Chart data
 * This is a simplified implementation - real parsing would require scraping the chart image
 * or finding an API endpoint
 */
export async function fetchClearSkyChartData(chartUrl: string): Promise<ClearSkyChartData> {
  try {
    // For now, return simulated data based on the chart URL
    // In production, this would scrape the actual chart or use an API
    
    const currentHour = new Date().getHours();
    const times = [];
    
    // Generate 24 hours of data starting from current time
    for (let i = 0; i < 24; i++) {
      const hour = (currentHour + i) % 24;
      times.push(`${hour.toString().padStart(2, '0')}:00`);
    }
    
    // Simulate Clear Sky Chart data based on tonight's conditions
    const chartData: ClearSkyChartData = {
      cloudCover: times.map((time, i) => ({
        time,
        percentage: i < 4 ? Math.random() * 15 : i < 5 ? 50 + Math.random() * 30 : 85 + Math.random() * 15,
        color: i < 4 ? '#000080' : i < 5 ? '#4169E1' : '#FFFFFF'
      })),
      
      transparency: times.map((time, i) => ({
        time,
        condition: i < 4 ? 'above_average' : i < 5 ? 'average' : 'poor',
        color: i < 4 ? '#006400' : i < 5 ? '#32CD32' : '#FFFFFF'
      })),
      
      seeing: times.map((time, i) => ({
        time,
        condition: i < 4 ? 'good' : i < 5 ? 'average' : 'poor',
        rating: i < 4 ? 4 : i < 5 ? 3 : 1,
        color: i < 4 ? '#006400' : i < 5 ? '#32CD32' : '#FFFFFF'
      })),
      
      smoke: times.map(time => ({
        time,
        level: 'none',
        color: '#87CEEB'
      })),
      
      wind: times.map(time => ({
        time,
        speed: 5 + Math.random() * 10,
        color: '#90EE90'
      })),
      
      humidity: times.map(time => ({
        time,
        percentage: 60 + Math.random() * 30,
        color: '#ADD8E6'
      })),
      
      temperature: times.map(time => ({
        time,
        temp: 45 + Math.random() * 15,
        color: '#87CEEB'
      })),
      
      darkness: times.map((time, i) => ({
        time,
        magnitude: i < 2 || i > 20 ? 3.0 : i < 4 || i > 18 ? 5.5 : 6.0,
        color: i < 2 || i > 20 ? '#4169E1' : i < 4 || i > 18 ? '#000080' : '#000000'
      })),
      
      timestamp: new Date().toISOString()
    };
    
    return chartData;
    
  } catch (error) {
    console.error('Error fetching Clear Sky Chart data:', error);
    throw new Error('Failed to fetch Clear Sky Chart data');
  }
}

/**
 * Interpret cloud cover color to percentage
 */
function interpretCloudColor(color: string): number {
  const colorMap: { [key: string]: number } = {
    '#000080': 5,    // Dark blue - clear
    '#4169E1': 15,   // Blue - mostly clear
    '#87CEEB': 25,   // Light blue - partly cloudy
    '#DCDCDC': 50,   // Light gray - mostly cloudy
    '#FFFFFF': 90    // White - overcast
  };
  
  return colorMap[color] || 50;
}

/**
 * Interpret transparency condition from color
 */
function interpretTransparencyColor(color: string): string {
  const colorMap: { [key: string]: string } = {
    '#006400': 'excellent',
    '#32CD32': 'above_average',
    '#90EE90': 'average',
    '#FFFF00': 'below_average',
    '#FFA500': 'poor',
    '#FFFFFF': 'too_cloudy'
  };
  
  return colorMap[color] || 'average';
}

/**
 * Interpret seeing condition from color
 */
function interpretSeeingColor(color: string): { condition: string; rating: number } {
  const colorMap: { [key: string]: { condition: string; rating: number } } = {
    '#006400': { condition: 'excellent', rating: 5 },
    '#32CD32': { condition: 'good', rating: 4 },
    '#90EE90': { condition: 'average', rating: 3 },
    '#FFFF00': { condition: 'poor', rating: 2 },
    '#FFA500': { condition: 'bad', rating: 1 },
    '#FFFFFF': { condition: 'too_cloudy', rating: 0 }
  };
  
  return colorMap[color] || { condition: 'average', rating: 3 };
}

/**
 * Analyze chart data to determine observation quality for time periods
 */
export function analyzeObservingConditions(chartData: ClearSkyChartData, observingStart: string, observingEnd: string) {
  const conditions = [];
  
  for (let i = 0; i < chartData.cloudCover.length; i++) {
    const time = chartData.cloudCover[i].time;
    const cloudCover = chartData.cloudCover[i].percentage;
    const transparency = chartData.transparency[i].condition;
    const seeing = chartData.seeing[i];
    
    let quality: 'excellent' | 'good' | 'dubious' | 'poor' = 'poor';
    
    if (cloudCover <= 10 && transparency === 'above_average' && seeing.rating >= 4) {
      quality = 'excellent';
    } else if (cloudCover <= 25 && transparency !== 'poor' && seeing.rating >= 3) {
      quality = 'good';
    } else if (cloudCover <= 50 && transparency !== 'too_cloudy' && seeing.rating >= 2) {
      quality = 'dubious';
    }
    
    conditions.push({
      time,
      cloudCover,
      transparency,
      seeing: seeing.condition,
      seeingRating: seeing.rating,
      quality,
      reason: generateReasonForCondition(cloudCover, transparency, seeing.condition)
    });
  }
  
  return conditions;
}

function generateReasonForCondition(cloudCover: number, transparency: string, seeing: string): string {
  if (cloudCover > 75) {
    return "Overcast - no observation possible";
  } else if (cloudCover > 50) {
    return "Heavy clouds limit observation";
  } else if (cloudCover > 25) {
    return "Partly cloudy - limited observation";
  } else if (transparency === 'poor' || seeing === 'bad') {
    return "Poor atmospheric conditions";
  } else if (transparency === 'above_average' && seeing === 'excellent') {
    return "Excellent atmospheric conditions";
  } else {
    return "Good observing conditions";
  }
}
