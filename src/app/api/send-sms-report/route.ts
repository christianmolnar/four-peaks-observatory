import { NextResponse } from 'next/server';
import { ObservationRecommendation, ObservationCriteria } from '@/types/observation';
import { calculateSunTimes, calculateObservingWindow, formatTime, calculateMoonData } from '@/lib/astronomical-calculations';
import { fetchClearSkyChartData } from '@/lib/clear-sky-parser';
import { evaluateObservingCondition } from '@/lib/observation-evaluator';
import { getAIObservingRecommendation, formatAIRecommendation } from '@/lib/ai-recommendations';
import { sendObservatoryForecastSMS, getSMSConfigFromEnv, validateSMSConfig } from '@/lib/sms-service';
import fs from 'fs';
import path from 'path';

interface SMSRequestBody {
  recipient?: string;
  customMessage?: string;
  includeDetails?: boolean;
  customClearSkyUrl?: string;
}

export async function POST(request: Request) {
  try {
    const body: SMSRequestBody = await request.json();
    const { 
      recipient, 
      customMessage,
      customClearSkyUrl 
    } = body;
    
    console.log('[SMS API] Processing SMS request...');
    
    // Get SMS configuration from environment or request
    const smsConfig = getSMSConfigFromEnv();
    
    // Override recipient if provided in request
    if (recipient) {
      smsConfig.toNumber = recipient;
    }
    
    // Validate SMS configuration
    const validation = validateSMSConfig(smsConfig);
    if (!validation.valid) {
      return NextResponse.json({
        success: false,
        error: 'SMS configuration invalid',
        details: validation.errors,
        hint: 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, and TWILIO_TO_NUMBER in environment variables or pass recipient in request body'
      }, { status: 400 });
    }
    
    // If custom message provided, send it directly
    if (customMessage) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const twilio = require('twilio');
      const client = twilio(smsConfig.accountSid, smsConfig.authToken);
      
      const result = await client.messages.create({
        body: customMessage,
        to: smsConfig.toNumber,
        from: smsConfig.fromNumber,
      });
      
      return NextResponse.json({
        success: true,
        messageSid: result.sid,
        message: 'Custom SMS sent successfully',
        details: {
          to: smsConfig.toNumber,
          from: smsConfig.fromNumber,
          messageLength: customMessage.length
        }
      });
    }
    
    // Load observatory configuration
    const configPath = path.join(process.cwd(), 'src/config/observation-criteria.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    const criteria: ObservationCriteria = JSON.parse(configData);
    
    // Use custom Clear Sky URL if provided
    if (customClearSkyUrl) {
      criteria.location.clearSkyChartUrl = customClearSkyUrl;
    }
    
    const today = new Date();
    
    console.log('[SMS API] Calculating astronomical data...');
    
    // Calculate sun times and observing window
    const sunTimes = calculateSunTimes(today, criteria.location);
    const observingWindow = calculateObservingWindow(
      sunTimes, 
      criteria.observingWindow.startOffset, 
      criteria.observingWindow.endOffset
    );
    
    // Get moon data
    const moonData = await calculateMoonData(today, criteria.location);
    
    console.log('[SMS API] Fetching Clear Sky Chart data...');
    
    // Fetch Clear Sky Chart data
    const chartData = await fetchClearSkyChartData(criteria.location.clearSkyChartUrl);
    
    if (!chartData || !chartData.forecast || chartData.forecast.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch Clear Sky Chart data for SMS generation'
      }, { status: 500 });
    }
    
    console.log('[SMS API] Analyzing observing conditions...');
    
    // Convert legacy format and analyze conditions
    const conditions = chartData.forecast.map(condition => {
      const evaluation = evaluateObservingCondition(condition);
      
      return {
        time: condition.time,
        quality: evaluation.overall,
        reason: evaluation.reason,
        cloudCover: condition.cloudCover,
        transparency: condition.transparency,
        seeing: condition.seeing
      };
    });

    // Filter conditions to observing window
    const filteredConditions = conditions.filter(condition => {
      const [hours] = condition.time.split(':').map(Number);
      
      const conditionTimeToday = new Date(today);
      conditionTimeToday.setHours(hours, 0, 0, 0);
      
      const conditionTimeTomorrow = new Date(today);
      conditionTimeTomorrow.setDate(conditionTimeTomorrow.getDate() + 1);
      conditionTimeTomorrow.setHours(hours, 0, 0, 0);
      
      const conditionEndToday = new Date(conditionTimeToday);
      conditionEndToday.setHours(hours + 1, 0, 0, 0);
      
      const conditionEndTomorrow = new Date(conditionTimeTomorrow);
      conditionEndTomorrow.setHours(hours + 1, 0, 0, 0);
      
      const overlapToday = (conditionTimeToday < observingWindow.end) && (conditionEndToday > observingWindow.start);
      const overlapTomorrow = (conditionTimeTomorrow < observingWindow.end) && (conditionEndTomorrow > observingWindow.start);
      
      return overlapToday || overlapTomorrow;
    });
    
    // Determine overall rating using same logic as main API
    const excellentHours = filteredConditions.filter(c => c.quality === 'excellent').length;
    const goodHours = filteredConditions.filter(c => c.quality === 'good').length;
    const totalHours = filteredConditions.length;
    
    const goodRatio = totalHours > 0 ? (excellentHours + goodHours) / totalHours : 0;
    
    let overallRating: 'excellent' | 'good' | 'dubious' | 'poor';
    if (excellentHours >= totalHours * 0.6) overallRating = 'excellent';
    else if (goodRatio >= 0.6) overallRating = 'good';
    else if (goodRatio >= 0.3) overallRating = 'dubious';
    else overallRating = 'poor';
    
    // Group consecutive good conditions into time windows (simplified for SMS)
    const timeWindows = [];
    let currentWindow = null;
    
    for (const condition of filteredConditions) {
      if (!currentWindow || currentWindow.quality !== condition.quality) {
        if (currentWindow) timeWindows.push(currentWindow);
        currentWindow = {
          start: condition.time,
          end: condition.time,
          quality: condition.quality,
          reason: `${condition.quality} conditions`
        };
      } else {
        currentWindow.end = condition.time;
      }
    }
    if (currentWindow) timeWindows.push(currentWindow);
    
    // Generate weather warnings
    const warnings = [];
    const poorPeriods = filteredConditions.filter(c => c.quality === 'poor');
    const overcastPeriods = filteredConditions.filter(c => c.cloudCover > 75);
    
    if (poorPeriods.length > 0) {
      const hourText = poorPeriods.length === 1 ? 'hour' : 'hours';
      const timeframe = poorPeriods.length > 24 ? 'next 48 hours' : `night (${poorPeriods.length} ${hourText})`;
      warnings.push(`Poor conditions expected during the ${timeframe}`);
    }
    
    if (overcastPeriods.length > 0) {
      const hourText = overcastPeriods.length === 1 ? 'hour' : 'hours';
      const timeframe = overcastPeriods.length > 24 ? 'next 48 hours' : `${overcastPeriods.length} ${hourText}`;
      warnings.push(`Overcast conditions during ${timeframe} - no observation possible`);
    }
    
    if (moonData.illumination > 0.8) {
      warnings.push(`Bright moon (${Math.round(moonData.illumination * 100)}% illuminated) will wash out faint deep sky objects`);
    }
    
    // Try to get AI recommendation
    let aiRecommendation = null;
    try {
      console.log('[SMS API] Requesting AI recommendation...');
      aiRecommendation = await getAIObservingRecommendation(
        chartData.forecast,
        criteria,
        moonData,
        {
          start: formatTime(observingWindow.start),
          end: formatTime(observingWindow.end),
          totalHours: observingWindow.totalHours
        }
      );
      console.log('[SMS API] AI recommendation received successfully');
    } catch (error) {
      console.warn('[SMS API] AI recommendation failed, continuing with rule-based analysis:', error);
    }
    
    // Build recommendation object
    const recommendation: ObservationRecommendation = {
      overall: (aiRecommendation && aiRecommendation.confidence >= 0.8) ? aiRecommendation.overall : overallRating,
      timeWindows,
      summary: `${overallRating} observing conditions for ${observingWindow.totalHours}-hour window from ${formatTime(observingWindow.start)} to ${formatTime(observingWindow.end)}`,
      details: {
        cloudCover: `Varies throughout night`,
        transparency: `Based on Clear Sky Chart analysis`,
        seeing: `Variable conditions`,
        moonImpact: `${Math.round(moonData.illumination * 100)}% illuminated`,
        weatherWarnings: warnings
      },
      aiReasoning: aiRecommendation ? formatAIRecommendation(aiRecommendation) : 'Rule-based analysis',
      aiConfidence: aiRecommendation?.confidence,
      aiSuggestions: aiRecommendation ? {
        bestTimeWindows: aiRecommendation.bestTimeWindows,
        warnings: aiRecommendation.warnings,
        opportunities: aiRecommendation.opportunities
      } : undefined
    };
    
    console.log('[SMS API] Sending observatory forecast SMS...');
    
    // Generate details URL - send to home page for better user experience
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3002'}`;
    const detailsUrl = baseUrl; // Home page has the main forecast
    
    // Send SMS
    const smsResult = await sendObservatoryForecastSMS(
      recommendation,
      criteria.location.name,
      {
        start: formatTime(observingWindow.start),
        end: formatTime(observingWindow.end),
        totalHours: observingWindow.totalHours
      },
      smsConfig,
      detailsUrl
    );
    
    if (!smsResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to send SMS',
        details: smsResult.error,
        smsError: smsResult.details
      }, { status: 500 });
    }
    
    console.log('[SMS API] SMS sent successfully:', smsResult.messageSid);
    
    return NextResponse.json({
      success: true,
      messageSid: smsResult.messageSid,
      message: 'Observatory forecast SMS sent successfully',
      recommendation: {
        overall: recommendation.overall,
        summary: recommendation.summary,
        aiConfidence: recommendation.aiConfidence
      },
      smsData: {
        to: smsConfig.toNumber,
        from: smsConfig.fromNumber,
        messageLength: smsResult.details?.messageLength || 'unknown'
      },
      timestamp: new Date().toISOString(),
      location: criteria.location.name,
      observingWindow: {
        start: formatTime(observingWindow.start),
        end: formatTime(observingWindow.end),
        totalHours: observingWindow.totalHours
      }
    });
    
  } catch (error) {
    console.error('[SMS API] Error sending SMS report:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to send SMS report',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
