#!/usr/bin/env node

/**
 * Daily Observatory Automation Script
 * 
 * Sends daily observatory forecasts via email and SMS
 * Can be run manually or scheduled with cron
 */

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const path = require('path');
const fs = require('fs');

// Configuration
const CONFIG = {
  // API endpoint - use production URL for cron jobs
  API_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3002',
  
  // Email settings from .env.local
  EMAIL_ENABLED: process.env.EMAIL_ENABLED === 'true',
  FORMSPREE_FORM_ID: process.env.FORMSPREE_FORM_ID,
  DAILY_REPORT_EMAIL: process.env.DAILY_REPORT_EMAIL,
  
  // SMS settings from .env.local
  SMS_ENABLED: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_FROM_NUMBER && process.env.TWILIO_FROM_NUMBER !== 'YOUR_NEW_TWILIO_NUMBER',
  
  // Notification settings
  ENABLE_GOOD_CONDITIONS_ONLY: process.env.DAILY_ONLY_GOOD_CONDITIONS === 'true',
  ENABLE_DEBUG_LOGGING: process.env.DAILY_DEBUG === 'true',
  
  // Schedule settings
  DEFAULT_CRON_TIME: '0 10 * * *', // 10:00 AM daily
  MORNING_CRON_TIME: '0 7 * * *',   // 7:00 AM daily
  EVENING_CRON_TIME: '0 17 * * *',  // 5:00 PM daily
  TIMEZONE: 'America/Los_Angeles'
};

/**
 * Get current observatory forecast
 */
async function getObservatoryForecast() {
  try {
    console.log('📡 Fetching observatory forecast...');
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/observation-evaluate`);
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Failed to fetch observatory forecast:', error.message);
    return null;
  }
}

/**
 * Send daily email report
 */
async function sendEmailReport(forecast) {
  if (!CONFIG.EMAIL_ENABLED || !CONFIG.FORMSPREE_FORM_ID || !CONFIG.DAILY_REPORT_EMAIL) {
    console.log('📧 Email not configured, skipping...');
    return { success: false, reason: 'Email not configured' };
  }

  try {
    console.log('📧 Sending daily email report...');
    
    const emailContent = formatEmailContent(forecast);
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`https://formspree.io/f/${CONFIG.FORMSPREE_FORM_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: CONFIG.DAILY_REPORT_EMAIL,
        subject: `🔭 Daily Observatory Report - ${new Date().toLocaleDateString()}`,
        message: emailContent,
        _replyto: CONFIG.DAILY_REPORT_EMAIL
      })
    });

    if (response.ok) {
      console.log('✅ Email sent successfully!');
      return { success: true };
    } else {
      throw new Error(`Email service responded with status: ${response.status}`);
    }
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send daily SMS report
 */
async function sendSMSReport(forecast) {
  if (!CONFIG.SMS_ENABLED) {
    console.log('📱 SMS not configured, skipping...');
    return { success: false, reason: 'SMS not configured' };
  }

  try {
    console.log('📱 Sending daily SMS report...');
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/send-sms-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        includeDetails: true,
        customClearSkyUrl: CONFIG.API_BASE_URL // Link to home page for detailed forecast
      })
    });

    if (!response.ok) {
      throw new Error(`SMS API responded with status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success) {
      console.log('✅ SMS sent successfully!');
      console.log(`📱 Message ID: ${data.messageSid}`);
      return { success: true, data };
    } else {
      throw new Error(data.error || 'Unknown SMS error');
    }
  } catch (error) {
    console.error('❌ Failed to send SMS:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Format email content with time-aware context
 */
function formatEmailContent(forecast) {
  const { recommendation, location, observingWindow, timestamp } = forecast;
  
  // Determine timing context
  const currentTime = new Date();
  const isPartialNight = observingWindow?.isPartialNight || false;
  let timingContext = '';
  
  if (isPartialNight) {
    timingContext = 'REST OF TONIGHT';
  } else if (currentTime.getHours() >= 17 || currentTime.getHours() <= 6) {
    timingContext = 'TONIGHT';
  } else {
    timingContext = 'NEXT NIGHT';
  }
  
  let content = `🔭 MAPLE VALLEY OBSERVATORY DAILY REPORT\\n`;
  content += `📅 ${new Date(timestamp).toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })}\\n\\n`;
  
  // Time-aware header
  content += `🌙 FORECAST FOR ${timingContext}\\n\\n`;
  
  // Overall conditions
  const conditionEmoji = {
    'excellent': '🌟',
    'good': '👍',
    'dubious': '⚠️',
    'poor': '❌'
  };
  
  content += `${conditionEmoji[recommendation.overall] || '❓'} OVERALL CONDITIONS: ${recommendation.overall.toUpperCase()}\\n\\n`;
  
  // Observing window with timing context
  if (observingWindow) {
    if (isPartialNight) {
      const hoursRemaining = observingWindow.totalHours;
      content += `⏰ REMAINING TIME: ${observingWindow.start} - ${observingWindow.end} (${hoursRemaining}h left tonight)\\n\\n`;
    } else {
      content += `🌙 OBSERVING WINDOW: ${observingWindow.start} - ${observingWindow.end} (${observingWindow.totalHours}h total)\\n\\n`;
    }
  }
  
  // Enhanced summary with timing info
  let summary = recommendation.summary;
  if (recommendation.details?.timingInfo) {
    summary = `${recommendation.details.timingInfo} ${summary}`;
  }
  content += `📋 SUMMARY:\\n${summary}\\n\\n`;
  
  // Time windows with better formatting
  if (recommendation.timeWindows && recommendation.timeWindows.length > 0) {
    content += `🕐 TIME PERIODS:\\n`;
    recommendation.timeWindows.forEach(window => {
      const emoji = conditionEmoji[window.quality] || '❓';
      content += `${emoji} ${window.start}-${window.end}: ${window.quality.toUpperCase()}\\n`;
    });
    content += `\\n`;
  }
  
  // Weather warnings
  if (recommendation.details?.weatherWarnings?.length > 0) {
    content += `⚠️ WARNINGS:\\n`;
    recommendation.details.weatherWarnings.forEach(warning => {
      content += `• ${warning}\\n`;
    });
    content += `\\n`;
  }
  
  // AI analysis with confidence
  if (recommendation.aiConfidence) {
    content += `🤖 AI ANALYSIS (${Math.round(recommendation.aiConfidence * 100)}% confidence):\\n`;
    if (recommendation.aiSuggestions?.bestTimeWindows?.length > 0) {
      content += `Best periods: ${recommendation.aiSuggestions.bestTimeWindows.join(', ')}\\n`;
    }
    if (recommendation.aiSuggestions?.warnings?.length > 0) {
      content += `Warnings: ${recommendation.aiSuggestions.warnings.join(', ')}\\n`;
    }
    content += `\\n`;
  }
  
  // Chart timing info if available
  if (forecast.chartTiming) {
    const ageHours = Math.round(forecast.chartTiming.ageHours * 10) / 10;
    content += `📊 CHART DATA: Generated ${ageHours}h ago`;
    if (!forecast.chartTiming.coverage?.adequate) {
      content += ` (${forecast.chartTiming.coverage.warning})`;
    }
    content += `\\n\\n`;
  }
  
  // Links
  content += `🔗 DETAILED FORECAST: ${CONFIG.API_BASE_URL}/admin/asset-manager\\n`;
  content += `🌐 CLEAR SKY CHART: http://cleardarksky.com/c/MplVllyWAkey.html\\n\\n`;
  
  content += `📍 Location: ${location}\\n`;
  content += `⏰ Generated: ${new Date(timestamp).toLocaleString()}`;
  
  return content;
}

/**
 * Check if conditions meet sending criteria
 */
function shouldSendNotification(forecast) {
  if (!CONFIG.ENABLE_GOOD_CONDITIONS_ONLY) {
    return true;
  }
  
  const overall = forecast.recommendation.overall.toLowerCase();
  return overall === 'excellent' || overall === 'good';
}

/**
 * Generate cron job entries for dual daily alerts
 */
function generateCronEntry() {
  const scriptPath = path.resolve(__filename);
  const scriptDir = path.dirname(scriptPath);
  const scriptName = path.basename(scriptPath);
  
  const morningEntry = `${CONFIG.MORNING_CRON_TIME} cd ${scriptDir} && node ${scriptName} --automated`;
  const eveningEntry = `${CONFIG.EVENING_CRON_TIME} cd ${scriptDir} && node ${scriptName} --automated`;
  
  console.log('📅 Generated Cron Entries for Dual Daily Alerts:');
  console.log('Copy these lines to your crontab (run: crontab -e)\\n');
  
  console.log('# Morning observatory report (7:00 AM Pacific)');
  console.log(morningEntry);
  console.log('');
  console.log('# Evening observatory report (5:00 PM Pacific)');
  console.log(eveningEntry);
  
  console.log('\\n📌 This will send observatory reports twice daily:');
  console.log('   🌅 7:00 AM - Morning conditions for tonight');
  console.log('   🌆 5:00 PM - Evening update for tonight');
  console.log('💡 Both reports will be sent rain or shine (DAILY_ONLY_GOOD_CONDITIONS=false)');
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  const isTest = args.includes('--test');
  const isAutomated = args.includes('--automated');
  const generateCron = args.includes('--cron');
  
  console.log('🔭 Maple Valley Observatory Daily Automation');
  console.log('=============================================');
  
  if (generateCron) {
    generateCronEntry();
    return;
  }
  
  // Get forecast
  const forecast = await getObservatoryForecast();
  if (!forecast) {
    console.error('💥 Failed to get forecast, aborting...');
    process.exit(1);
  }
  
  // Check if we should send (for automated runs)
  if (isAutomated && !shouldSendNotification(forecast)) {
    console.log(`⏭️ Conditions are ${forecast.recommendation.overall}, skipping notification (DAILY_ONLY_GOOD_CONDITIONS=true)`);
    process.exit(0);
  }
  
  console.log(`🌟 Current conditions: ${forecast.recommendation.overall.toUpperCase()}`);
  
  // Send notifications
  const results = {
    email: await sendEmailReport(forecast),
    sms: await sendSMSReport(forecast)
  };
  
  // Summary
  console.log('\\n📋 DAILY AUTOMATION SUMMARY:');
  console.log(`📧 Email: ${results.email.success ? '✅ Sent' : '❌ Failed'} ${results.email.reason || results.email.error || ''}`);
  console.log(`📱 SMS: ${results.sms.success ? '✅ Sent' : '❌ Failed'} ${results.sms.reason || results.sms.error || ''}`);
  
  if (CONFIG.ENABLE_DEBUG_LOGGING) {
    console.log('\\n🔍 DEBUG INFO:');
    console.log('Email config:', { enabled: CONFIG.EMAIL_ENABLED, hasFormspree: !!CONFIG.FORMSPREE_FORM_ID, hasRecipient: !!CONFIG.DAILY_REPORT_EMAIL });
    console.log('SMS config:', { enabled: CONFIG.SMS_ENABLED });
    console.log('Forecast summary:', forecast.recommendation.summary);
  }
  
  // Exit with appropriate code
  const anySuccess = results.email.success || results.sms.success;
  process.exit(anySuccess ? 0 : 1);
}

// Handle command line arguments
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Automation failed:', error);
    process.exit(1);
  });
}

module.exports = { main, getObservatoryForecast, sendEmailReport, sendSMSReport };
