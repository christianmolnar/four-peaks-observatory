// AI-powered observation recommendations using OpenAI

import OpenAI from 'openai';
import { ClearSkyCondition } from './clear-sky-parser';
import { ObservationCriteria } from '@/types/observation';

interface MoonData {
  phase: number;
  rise: Date | null;
  set: Date | null;
  altitude: number;
  illumination: number;
}

interface AISentiment {
  overall: 'excellent' | 'good' | 'dubious' | 'poor';
  confidence: number;
  reasoning: string;
  bestTimeWindows: string[];
  warnings: string[];
  opportunities: string[];
}

interface AIRecommendationPayload {
  location: string;
  date: string;
  userPreferences: {
    observationType: string;
    sessionDuration: string;
    moonTolerances: {
      goodPhases: string[];
      dubiousPhases: string[];
      poorPhases: string[];
      altitudeThreshold: number;
    };
    weatherTolerances: {
      minTransparency?: number;
      maxCloudCover?: number;
      minSeeing?: number;
    };
  };
  currentConditions: {
    cloudCover: number[];
    transparency: number[];
    seeing: number[];
    timeLabels: string[];
  };
  moonData: {
    phase: number;
    rise: string | null;
    set: string | null;
    illumination: number;
  };
  observingWindow: {
    start: string;
    end: string;
    totalHours: number;
  };
}

/**
 * Get AI-powered observing recommendation using OpenAI
 */
export async function getAIObservingRecommendation(
  conditions: ClearSkyCondition[],
  criteria: ObservationCriteria,
  moonData: MoonData,
  observingWindow: { start: string; end: string; totalHours: number }
): Promise<AISentiment> {
  
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.log('[AI Recommendations] OpenAI API key not configured, falling back to rule-based analysis');
    return generateRuleBasedRecommendation(conditions, criteria, moonData);
  }

  try {
    const openai = new OpenAI({ apiKey });
    
    // Prepare structured data for AI analysis
    const payload = prepareAIPayload(conditions, criteria, moonData, observingWindow);
    
    const systemPrompt = generateSystemPrompt(criteria);
    const userPrompt = generateUserPrompt(payload);
    
    console.log('[AI Recommendations] Sending request to OpenAI GPT-4...');
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use gpt-4o-mini which supports JSON mode
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3, // Lower temperature for more consistent, factual responses
      max_tokens: 800,
      response_format: { type: "json_object" }
    });

    const response = completion.choices[0]?.message?.content;
    
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    const aiResponse = JSON.parse(response) as AISentiment;
    console.log(`[AI Recommendations] Received recommendation: ${aiResponse.overall} (confidence: ${aiResponse.confidence})`);
    
    return aiResponse;
    
  } catch (error) {
    console.error('[AI Recommendations] OpenAI request failed:', error);
    console.log('[AI Recommendations] Falling back to rule-based analysis');
    return generateRuleBasedRecommendation(conditions, criteria, moonData);
  }
}

/**
 * Prepare structured data payload for AI analysis
 */
function prepareAIPayload(
  conditions: ClearSkyCondition[],
  criteria: ObservationCriteria,
  moonData: MoonData,
  observingWindow: { start: string; end: string; totalHours: number }
): AIRecommendationPayload {
  
  return {
    location: criteria.location.name,
    date: new Date().toISOString().split('T')[0],
    userPreferences: {
      observationType: criteria.seeing.observationType || 'balanced',
      sessionDuration: `${observingWindow.totalHours} hours`,
      moonTolerances: criteria.moonPhase,
      weatherTolerances: {
        minTransparency: typeof criteria.transparency?.good?.[0] === 'number' ? criteria.transparency.good[0] : 3,
        maxCloudCover: criteria.cloudCover?.excellent?.threshold || 20,
        minSeeing: typeof criteria.seeing?.good?.[0] === 'number' ? criteria.seeing.good[0] : 3
      }
    },
    currentConditions: {
      cloudCover: conditions.map(c => c.cloudCover),
      transparency: conditions.map(c => c.transparency),
      seeing: conditions.map(c => c.seeing),
      timeLabels: conditions.map(c => c.time)
    },
    moonData: {
      phase: moonData.phase,
      rise: moonData.rise ? moonData.rise.toISOString() : null,
      set: moonData.set ? moonData.set.toISOString() : null,
      illumination: moonData.illumination
    },
    observingWindow
  };
}

/**
 * Generate system prompt for AI astronomical advisor
 */
function generateSystemPrompt(criteria: ObservationCriteria): string {
  return `You are an expert astronomical observing advisor with decades of experience helping amateur astronomers plan optimal observation sessions.

ROLE: Analyze current and forecasted sky conditions to provide intelligent observing recommendations.

EXPERTISE:
- Clear Sky Chart interpretation and analysis
- Moon phase impacts on different types of observation
- Equipment considerations (telescopes, cameras, filters)
- Weather pattern recognition and forecasting
- Optimal timing for various celestial targets

OBSERVATION TYPES:
- Deep Sky Objects: Galaxies, nebulae, star clusters (prefer dark skies, low moon)
- Planetary: Jupiter, Saturn, Mars (can tolerate moonlight, need good seeing)
- Lunar: Moon observation and photography (need moon present)
- Solar: Sun observation with proper filters (daytime only)
- Astrophotography: Long exposure imaging (very sensitive to conditions)

RESPONSE FORMAT: Return valid JSON with this exact structure:
{
  "overall": "excellent" | "good" | "dubious" | "poor",
  "confidence": 0.85,
  "reasoning": "Clear explanation of the rating",
  "bestTimeWindows": ["20:00-23:00", "01:00-04:00"],
  "warnings": ["Moon rises at 23:30, will interfere with deep sky"],
  "opportunities": ["Great conditions for planetary observation before moonrise"]
}

LOCATION: ${criteria.location.name}
USER PREFERENCES: Observing type preference is "${criteria.seeing.observationType || 'balanced'}"`;
}

/**
 * Generate user prompt with current conditions
 */
function generateUserPrompt(payload: AIRecommendationPayload): string {
  const conditions = payload.currentConditions;
  const moon = payload.moonData;
  
  return `Please analyze tonight's observing conditions and provide a recommendation.

OBSERVING SESSION:
- Date: ${payload.date}
- Location: ${payload.location}
- Planned Duration: ${payload.userPreferences.sessionDuration}
- Observing Window: ${payload.observingWindow.start} to ${payload.observingWindow.end}

CURRENT CONDITIONS (hourly forecast):
Times: ${conditions.timeLabels.join(', ')}
Cloud Cover (%): ${conditions.cloudCover.join(', ')}
Transparency (1-5): ${conditions.transparency.join(', ')}
Seeing (1-5): ${conditions.seeing.join(', ')}

MOON INFORMATION:
- Phase: ${(moon.phase * 100).toFixed(0)}% illuminated
- Moonrise: ${moon.rise ? new Date(moon.rise).toLocaleTimeString() : 'No moonrise'}
- Moonset: ${moon.set ? new Date(moon.set).toLocaleTimeString() : 'No moonset'}

USER PREFERENCES:
- Observation Type: ${payload.userPreferences.observationType}
- Maximum Cloud Cover: ${payload.userPreferences.weatherTolerances.maxCloudCover}%
- Minimum Transparency: ${payload.userPreferences.weatherTolerances.minTransparency}/5
- Minimum Seeing: ${payload.userPreferences.weatherTolerances.minSeeing}/5

Please provide your expert analysis considering:
1. Overall observing quality for the planned session
2. Best time windows within the observing period
3. Any warnings about changing conditions
4. Opportunities for specific types of observation
5. Impact of moon phase and timing on different targets

Return your analysis as JSON following the specified format.`;
}

/**
 * Fallback rule-based recommendation when AI is unavailable
 */
function generateRuleBasedRecommendation(
  conditions: ClearSkyCondition[],
  criteria: ObservationCriteria,
  moonData: MoonData
): AISentiment {
  
  // Analyze average conditions
  const avgCloudCover = conditions.reduce((sum, c) => sum + c.cloudCover, 0) / conditions.length;
  const avgTransparency = conditions.reduce((sum, c) => sum + c.transparency, 0) / conditions.length;
  const avgSeeing = conditions.reduce((sum, c) => sum + c.seeing, 0) / conditions.length;
  
  // Determine overall quality (1-5 scale ratings)
  let overall: 'excellent' | 'good' | 'dubious' | 'poor';
  let confidence = 0.7; // Lower confidence for rule-based
  
  if (avgCloudCover >= 4 && avgTransparency >= 4 && avgSeeing >= 4) {
    overall = 'excellent';
    confidence = 0.9;
  } else if (avgCloudCover >= 3 && avgTransparency >= 3 && avgSeeing >= 3) {
    overall = 'good';
    confidence = 0.8;
  } else if (avgCloudCover >= 2 && avgTransparency >= 2) {
    overall = 'dubious';
  } else {
    overall = 'poor';
  }
  
  // Generate time windows
  const bestTimeWindows: string[] = [];
  const warnings: string[] = [];
  const opportunities: string[] = [];
  
  // Find good consecutive hours (using 1-5 rating scale)
  for (let i = 0; i < conditions.length - 1; i++) {
    const current = conditions[i];
    const next = conditions[i + 1];
    
    if (current.cloudCover >= 3 && current.transparency >= 3) {
      if (next.cloudCover >= 3 && next.transparency >= 3) {
        bestTimeWindows.push(`${current.time}-${next.time}`);
      }
    }
  }
  
  // Moon warnings
  if (moonData.illumination > 0.75) {
    warnings.push('Bright moon will interfere with deep sky observations');
    opportunities.push('Excellent conditions for lunar and planetary observation');
  }
  
  // Cloud warnings (1-5 scale: 1=very cloudy, 5=clear)
  if (avgCloudCover <= 2) {
    warnings.push('Significant cloud cover expected');
  }
  
  // Poor transparency warnings
  if (avgTransparency <= 2) {
    warnings.push('Poor atmospheric transparency expected');
  }
  
  // Poor seeing warnings  
  if (avgSeeing <= 2) {
    warnings.push('Poor seeing conditions expected - avoid high magnification');
  }
  
  const reasoning = `Rule-based analysis: ${avgCloudCover.toFixed(1)}/5 cloud rating, ${avgTransparency.toFixed(1)}/5 transparency, ${avgSeeing.toFixed(1)}/5 seeing. ${moonData.illumination > 0.5 ? `Moon ${Math.round(moonData.illumination * 100)}% illuminated.` : ''}`;
  
  return {
    overall,
    confidence,
    reasoning,
    bestTimeWindows: bestTimeWindows.slice(0, 3), // Top 3 windows
    warnings,
    opportunities
  };
}

/**
 * Format AI recommendation for display
 */
export function formatAIRecommendation(sentiment: AISentiment): string {
  let message = `**${sentiment.overall.toUpperCase()}** observing conditions (${Math.round(sentiment.confidence * 100)}% confidence)\n\n`;
  
  message += `${sentiment.reasoning}\n\n`;
  
  if (sentiment.bestTimeWindows.length > 0) {
    message += `**Best Time Windows:**\n${sentiment.bestTimeWindows.map(w => `• ${w}`).join('\n')}\n\n`;
  }
  
  if (sentiment.opportunities.length > 0) {
    message += `**Opportunities:**\n${sentiment.opportunities.map(o => `• ${o}`).join('\n')}\n\n`;
  }
  
  if (sentiment.warnings.length > 0) {
    message += `**Warnings:**\n${sentiment.warnings.map(w => `• ${w}`).join('\n')}`;
  }
  
  return message;
}
