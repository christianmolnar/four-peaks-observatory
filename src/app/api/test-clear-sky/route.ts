import { NextRequest, NextResponse } from 'next/server';
import { fetchClearSkyChartData } from '@/lib/clear-sky-parser';
import { evaluateObservingCondition, convertLegacyCondition } from '@/lib/observation-evaluator';

/**
 * Test Clear Sky Chart Analysis API
 * Accepts a Clear Sky Chart URL and returns parsed data and analysis
 */
export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json(
        { error: 'Clear Sky Chart URL is required' },
        { status: 400 }
      );
    }

    console.log(`[Clear Sky Test] Testing URL: ${url}`);
    
    // Fetch and parse the Clear Sky Chart
    const chartData = await fetchClearSkyChartData(url);
    
    console.log(`[Clear Sky Test] Parsed ${chartData.forecast.length} conditions for ${chartData.location}`);
    
    // Analyze each condition
    const analyzedConditions = chartData.forecast.map(condition => {
      const converted = convertLegacyCondition(condition);
      const evaluation = evaluateObservingCondition(converted);
      
      return {
        time: condition.time,
        cloudCover: condition.cloudCover,
        transparency: condition.transparency,
        seeingRating: condition.seeingRating,
        quality: evaluation.overall,
        reason: evaluation.reason
      };
    });
    
    // Determine overall assessment
    const qualityCounts = analyzedConditions.reduce((acc, condition) => {
      acc[condition.quality] = (acc[condition.quality] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const totalConditions = analyzedConditions.length;
    const excellentPercent = (qualityCounts.excellent || 0) / totalConditions;
    const goodPercent = (qualityCounts.good || 0) / totalConditions;
    const poorPercent = (qualityCounts.poor || 0) / totalConditions;
    
    let overall: string;
    let reasoning: string;
    
    if (excellentPercent >= 0.6) {
      overall = 'excellent';
      reasoning = `Excellent conditions throughout most of the period (${Math.round(excellentPercent * 100)}% excellent)`;
    } else if (excellentPercent + goodPercent >= 0.7) {
      overall = 'good';
      reasoning = `Good conditions overall (${Math.round((excellentPercent + goodPercent) * 100)}% good or better)`;
    } else if (poorPercent >= 0.6) {
      overall = 'poor';
      reasoning = `Poor conditions dominate (${Math.round(poorPercent * 100)}% poor conditions)`;
    } else {
      overall = 'dubious';
      reasoning = 'Mixed conditions throughout the period';
    }
    
    // Find best time windows
    const bestTimeWindows = analyzedConditions
      .filter(c => c.quality === 'excellent' || c.quality === 'good')
      .map(c => `${c.time}: ${c.quality} (${c.reason})`);
    
    // Generate warnings
    const warnings = [];
    if (poorPercent > 0.3) {
      warnings.push(`${Math.round(poorPercent * 100)}% of the period has poor conditions`);
    }
    
    const avgCloudCover = analyzedConditions.reduce((sum, c) => sum + c.cloudCover, 0) / totalConditions;
    if (avgCloudCover > 50) {
      warnings.push(`High cloud cover average: ${Math.round(avgCloudCover)}%`);
    }
    
    const avgSeeing = analyzedConditions.reduce((sum, c) => sum + c.seeingRating, 0) / totalConditions;
    if (avgSeeing < 3) {
      warnings.push(`Poor seeing conditions (average ${avgSeeing.toFixed(1)}/5)`);
    }
    
    return NextResponse.json({
      success: true,
      location: chartData.location,
      overall,
      reasoning,
      confidence: 0.85,
      bestTimeWindows,
      warnings,
      opportunities: overall === 'excellent' || overall === 'good' ? ['Good conditions for most astronomical observations'] : [],
      rawData: {
        forecast: chartData.forecast,
        analyzedConditions,
        qualityCounts
      },
      analysis: {
        totalHours: totalConditions,
        excellentHours: qualityCounts.excellent || 0,
        goodHours: qualityCounts.good || 0,
        dubiousHours: qualityCounts.dubious || 0,
        poorHours: qualityCounts.poor || 0,
        averageCloudCover: Math.round(avgCloudCover),
        averageSeeing: Math.round(avgSeeing * 10) / 10
      }
    });
    
  } catch (error) {
    console.error('Clear Sky Chart test error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to analyze Clear Sky Chart',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
