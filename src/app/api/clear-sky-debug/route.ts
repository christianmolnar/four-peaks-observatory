import { NextResponse } from 'next/server';
import { fetchClearSkyChartData } from '@/lib/clear-sky-parser';
import { evaluateObservingCondition } from '@/lib/observation-evaluator';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clearSkyUrl = searchParams.get('url');
    
    if (!clearSkyUrl) {
      return NextResponse.json(
        { success: false, error: 'URL parameter is required' },
        { status: 400 }
      );
    }

    // Get chart data with detailed logging
    const chartData = await fetchClearSkyChartData(clearSkyUrl);
    
    // Create detailed analysis report
    const report = {
      timestamp: new Date().toISOString(),
      url: clearSkyUrl,
      location: chartData.location,
      totalHours: chartData.forecast.length,
      analysis: {
        hourlyBreakdown: [] as any[],
        colorMappingIssues: [] as any[],
        scoringBreakdown: [] as any[],
        weightingAnalysis: {} as any,
        recommendations: [] as any[],
        rawColorData: [] as any[] // NEW: Add raw color data for debugging
      }
    };

    // Define weights (should match user config)
    const cloudWeight = 70;
    const transparencyWeight = 15;
    const seeingWeight = 15;

        // Analyze each hour in detail
    for (let i = 0; i < Math.min(12, chartData.forecast.length); i++) {
      const condition = chartData.forecast[i];
      const evaluation = evaluateObservingCondition(condition);
      
      // Calculate weighted score manually to verify
      // cloudCover is percentage (0-100%) where 0=clear, 100=overcast
      // Convert to 0-1 scale where 1=excellent, 0=poor
      const cloudScore = (100 - condition.cloudCover) / 100; // Convert percentage to 0-1
      const transparencyScore = condition.transparency / 5; // Convert to 0-1
      const seeingScore = condition.seeing / 5; // Convert to 0-1
      
      const weightedScore = (
        (cloudScore * cloudWeight) +
        (transparencyScore * transparencyWeight) +
        (seeingScore * seeingWeight)
      ) / (cloudWeight + transparencyWeight + seeingWeight);
      
      const finalScore = Math.round(weightedScore * 100);
      
      report.analysis.hourlyBreakdown.push({
        hour: i,
        time: condition.time,
        rawData: {
          cloudCover: condition.cloudCover,
          transparency: condition.transparency,
          seeing: condition.seeing
        },
        normalizedScores: {
          cloud: cloudScore,
          transparency: transparencyScore,
          seeing: seeingScore
        },
        weightedCalculation: {
          cloudContribution: cloudScore * cloudWeight,
          transparencyContribution: transparencyScore * transparencyWeight,
          seeingContribution: seeingScore * seeingWeight,
          totalWeighted: (cloudScore * cloudWeight) + (transparencyScore * transparencyWeight) + (seeingScore * seeingWeight),
          totalWeight: cloudWeight + transparencyWeight + seeingWeight,
          finalScore: finalScore
        },
        evaluation: {
          overall: evaluation.overall,
          reason: evaluation.reason,
          details: evaluation.details
        }
      });
    }

    // Add weighting analysis
    report.analysis.weightingAnalysis = {
      configuredWeights: {
        cloudCover: cloudWeight,
        transparency: transparencyWeight,
        seeing: seeingWeight
      },
      explanation: "Score calculation: ((100-cloudCover)/100 * cloudWeight + transparency/5 * transWeight + seeing/5 * seeingWeight) / totalWeights * 100",
      example: "For cloudCover=5%, transparency=4, seeing=3: ((100-5)/100 * 70 + 4/5 * 15 + 3/5 * 15) / 100 = (0.95*70 + 0.8*15 + 0.6*15) / 100 = (66.5+12+9)/100 = 87.5"
    };

    // Save report to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(process.cwd(), 'reports', `clear-sky-analysis-${timestamp}.json`);
    
    // Ensure reports directory exists
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    return NextResponse.json({
      success: true,
      report,
      savedTo: reportPath,
      message: `Analysis complete. Report saved to ${reportPath}`
    });

  } catch (error) {
    console.error('Clear Sky Debug API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to analyze clear sky chart',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
