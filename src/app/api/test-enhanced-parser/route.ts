import { NextResponse } from 'next/server';
import { fetchClearSkyChartDataEnhanced } from '@/lib/enhanced-clear-sky-parser';
import { DEFAULT_CHART_CONFIG } from '@/lib/chart-config';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const testTime = searchParams.get('testTime');
    
    // Load location config
    const configPath = path.join(process.cwd(), 'src/config/observation-criteria.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    const criteria = JSON.parse(configData);
    
    // Use test time if provided, otherwise current time
    const currentTime = testTime ? new Date(testTime) : new Date();
    
    console.log(`[Enhanced Parser Test] Testing at: ${currentTime.toISOString()}`);
    
    // Test the enhanced parser
    const result = await fetchClearSkyChartDataEnhanced(
      criteria.location.clearSkyChartUrl,
      criteria.location,
      DEFAULT_CHART_CONFIG, // Use user-provided coordinate measurements
      currentTime,
      criteria.observingWindow.startOffset,
      criteria.observingWindow.endOffset
    );
    
    return NextResponse.json({
      success: true,
      testTime: currentTime.toISOString(),
      result: {
        timing: result.timing,
        metadata: result.metadata,
        forecastSample: result.forecast.slice(0, 3), // First 3 conditions for brevity
        totalConditions: result.forecast.length
      }
    });
    
  } catch (error) {
    console.error('[Enhanced Parser Test] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
