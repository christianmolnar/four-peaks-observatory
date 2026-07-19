import { ObservationRecommendation } from '@/types/observation';

/**
 * SMS Service using Twilio for sending observatory forecast texts
 */

interface SMSConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  toNumber: string;
}

interface SMSResult {
  success: boolean;
  messageSid?: string;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Format observation data for SMS message
 */
export function formatSMSContent(
  recommendation: ObservationRecommendation,
  location: string,
  observingWindow: { start: string; end: string; totalHours: number },
  detailsUrl?: string
): string {
  const date = new Date().toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
  
  // Use emoji indicators for quick visual scanning
  const getQualityEmoji = (quality: string) => {
    switch (quality) {
      case 'excellent': return '🌟';
      case 'good': return '✅';
      case 'dubious': return '⚠️';
      case 'poor': return '❌';
      default: return '❓';
    }
  };

  // SMS has 160 character limit per segment, but we can use multiple segments for detailed info
  let message = `🔭 ${location.replace('Four Peaks Observatory, ', 'Fountain Hills ')} ${date}\n`;
  message += `${getQualityEmoji(recommendation.overall)} ${recommendation.overall.toUpperCase()}\n`;
  
  // Add observing window
  message += `🌙 ${observingWindow.start}-${observingWindow.end} (${observingWindow.totalHours}h)\n`;
  
  // Add detailed conditions summary (first 80 chars)
  const shortSummary = recommendation.summary.substring(0, 80).replace('observing conditions', 'conditions');
  if (shortSummary !== recommendation.summary) {
    message += `📋 ${shortSummary}...\n`;
  } else {
    message += `📋 ${shortSummary}\n`;
  }
  
  // Add best time windows if available
  const excellentWindows = recommendation.timeWindows.filter(w => w.quality === 'excellent');
  const goodWindows = recommendation.timeWindows.filter(w => w.quality === 'good');
  
  if (excellentWindows.length > 0) {
    const timeList = excellentWindows.slice(0, 2).map(w => `${w.start}-${w.end}`).join(', ');
    message += `🌟 Best: ${timeList}\n`;
  } else if (goodWindows.length > 0) {
    const timeList = goodWindows.slice(0, 2).map(w => `${w.start}-${w.end}`).join(', ');
    message += `✅ Good: ${timeList}\n`;
  }
  
  // Add specific weather details
  if (recommendation.details.cloudCover && typeof recommendation.details.cloudCover === 'string') {
    if (!recommendation.details.cloudCover.includes('Varies')) {
      message += `☁️ Clouds: ${recommendation.details.cloudCover.substring(0, 30)}\n`;
    }
  }
  
  if (recommendation.details.moonImpact && typeof recommendation.details.moonImpact === 'string') {
    const moonInfo = recommendation.details.moonImpact.substring(0, 40);
    if (moonInfo.includes('%')) {
      message += `🌙 Moon: ${moonInfo}\n`;
    }
  }
  
  // Add critical warnings (keep brief for SMS)
  if (recommendation.details.weatherWarnings && recommendation.details.weatherWarnings.length > 0) {
    const criticalWarnings = recommendation.details.weatherWarnings
      .filter(w => w.includes('Overcast') || w.includes('Poor conditions') || w.includes('Bright moon'))
      .slice(0, 1); // Just the most critical warning
    
    if (criticalWarnings.length > 0) {
      let warning = criticalWarnings[0];
      // Shorten common phrases
      warning = warning.replace('Poor conditions expected during', 'Poor for');
      warning = warning.replace('Overcast conditions during', 'Overcast');
      warning = warning.replace(' hours', 'hrs');
      warning = warning.replace(' - no observation possible', '');
      message += `⚠️ ${warning.substring(0, 50)}\n`;
    }
  }
  
  // Add AI confidence if available and relevant
  if (recommendation.aiConfidence && recommendation.aiConfidence >= 0.7) {
    message += `🤖 AI: ${Math.round(recommendation.aiConfidence * 100)}% confident\n`;
  }
  
  // Add clickable link to detailed forecast
  if (detailsUrl) {
    message += `🔗 Details: ${detailsUrl}`;
  }
  
  return message.trim();
}

/**
 * Send SMS using Twilio
 */
export async function sendSMS(
  message: string,
  config: SMSConfig
): Promise<SMSResult> {
  try {
    // Dynamic import to avoid bundling Twilio in client-side code
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const twilio = require('twilio');
    const client = twilio(config.accountSid, config.authToken);
    
    console.log('[SMS] Attempting to send SMS...');
    console.log('[SMS] Message length:', message.length, 'characters');
    console.log('[SMS] To:', config.toNumber);
    console.log('[SMS] From:', config.fromNumber);
    
    const result = await client.messages.create({
      body: message,
      to: config.toNumber,
      from: config.fromNumber,
    });
    
    console.log('[SMS] SMS sent successfully:', result.sid);
    
    return {
      success: true,
      messageSid: result.sid,
      details: {
        status: result.status,
        direction: result.direction,
        dateCreated: result.dateCreated,
        messagingServiceSid: result.messagingServiceSid
      }
    };
    
  } catch (error: unknown) {
    console.error('[SMS] Failed to send SMS:', error);
    
    const err = error as Record<string, unknown>;
    
    return {
      success: false,
      error: (err.message as string) || 'Unknown SMS error',
      details: {
        code: err.code,
        moreInfo: err.moreInfo,
        status: err.status
      }
    };
  }
}

/**
 * Validate SMS configuration
 */
export function validateSMSConfig(config: Partial<SMSConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!config.accountSid) {
    errors.push('Twilio Account SID is required');
  } else if (!config.accountSid.startsWith('AC')) {
    errors.push('Invalid Twilio Account SID format (should start with "AC")');
  }
  
  if (!config.authToken) {
    errors.push('Twilio Auth Token is required');
  }
  
  if (!config.fromNumber) {
    errors.push('From phone number is required');
  } else if (!config.fromNumber.match(/^\+[1-9]\d{1,14}$/)) {
    errors.push('From number must be in E.164 format (e.g., +1234567890)');
  }
  
  if (!config.toNumber) {
    errors.push('To phone number is required');
  } else if (!config.toNumber.match(/^\+[1-9]\d{1,14}$/)) {
    errors.push('To number must be in E.164 format (e.g., +1234567890)');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get SMS configuration from environment variables
 */
export function getSMSConfigFromEnv(): Partial<SMSConfig> {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
    toNumber: process.env.TWILIO_TO_NUMBER
  };
}

/**
 * Send observatory forecast via SMS
 */
export async function sendObservatoryForecastSMS(
  recommendation: ObservationRecommendation,
  location: string,
  observingWindow: { start: string; end: string; totalHours: number },
  config?: Partial<SMSConfig>,
  detailsUrl?: string
): Promise<SMSResult> {
  // Use provided config or fall back to environment variables
  const smsConfig = config || getSMSConfigFromEnv();
  
  // Validate configuration
  const validation = validateSMSConfig(smsConfig);
  if (!validation.valid) {
    return {
      success: false,
      error: 'SMS configuration invalid: ' + validation.errors.join(', '),
      details: { configErrors: validation.errors }
    };
  }
  
  // Format message content with details URL
  const message = formatSMSContent(recommendation, location, observingWindow, detailsUrl);
  
  // Send SMS
  return await sendSMS(message, smsConfig as SMSConfig);
}
