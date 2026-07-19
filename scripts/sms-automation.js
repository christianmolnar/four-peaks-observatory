#!/usr/bin/env node

/**
 * SMS Automation Setup Script
 * 
 * This script helps set up automated SMS alerts for the observatory.
 * It can be used with cron jobs, webhooks, or other scheduling systems.
 */

const { spawn } = require('child_process');
const path = require('path');

// Configuration
const CONFIG = {
  // API endpoint for sending SMS
  SMS_API_URL: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3002',
  
  // Default schedule (daily at 10:00 AM)
  DEFAULT_CRON_TIME: '0 10 * * *',
  
  // Notification settings
  ENABLE_GOOD_CONDITIONS_ONLY: process.env.SMS_ONLY_GOOD_CONDITIONS === 'true',
  ENABLE_DEBUG_LOGGING: process.env.SMS_DEBUG === 'true'
};

/**
 * Send SMS notification
 */
async function sendSMSNotification(options = {}) {
  try {
    console.log('🔭 [SMS Automation] Checking observatory conditions...');
    
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch(`${CONFIG.SMS_API_URL}/api/send-sms-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: options.recipient,
        includeDetails: true,
        ...options
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ [SMS Automation] SMS sent successfully!');
      console.log(`📱 Message ID: ${data.messageSid}`);
      console.log(`🌟 Conditions: ${data.recommendation?.overall?.toUpperCase()}`);
      console.log(`⏰ Sent at: ${new Date().toLocaleString()}`);
      
      // Log additional details if debug mode
      if (CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('📊 [DEBUG] Full response:', JSON.stringify(data, null, 2));
      }
      
      return { success: true, data };
    } else {
      const errorData = await response.json();
      console.error('❌ [SMS Automation] Failed to send SMS:', errorData.error);
      return { success: false, error: errorData.error };
    }
    
  } catch (error) {
    console.error('💥 [SMS Automation] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Check if conditions are good enough to send notification
 */
async function shouldSendNotification() {
  if (!CONFIG.ENABLE_GOOD_CONDITIONS_ONLY) {
    return true; // Always send if filtering is disabled
  }
  
  try {
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch(`${CONFIG.SMS_API_URL}/api/observation-evaluate`);
    
    if (response.ok) {
      const data = await response.json();
      const overall = data.recommendation?.overall;
      
      // Only send for good or excellent conditions
      return overall === 'good' || overall === 'excellent';
    }
    
    return true; // Send by default if we can't check conditions
  } catch (error) {
    console.warn('⚠️ [SMS Automation] Could not check conditions, sending anyway:', error.message);
    return true;
  }
}

/**
 * Generate cron job entry
 */
function generateCronEntry(cronTime = CONFIG.DEFAULT_CRON_TIME) {
  const scriptPath = path.resolve(__filename);
  const nodeCmd = process.execPath;
  
  return `# Four Peaks Observatory SMS Alerts (daily at 10:00 AM)
${cronTime} ${nodeCmd} "${scriptPath}" --automated
`;
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  const isAutomated = args.includes('--automated');
  const recipient = args.find(arg => arg.startsWith('--recipient='))?.split('=')[1];
  const customMessage = args.find(arg => arg.startsWith('--message='))?.split('=')[1];
  
  console.log('🔭 Four Peaks Observatory SMS Automation');
  console.log('===========================================');
  
  if (args.includes('--help')) {
    console.log(`
Usage: node sms-automation.js [options]

Options:
  --automated           Run in automated mode (for cron jobs)
  --recipient=+1234567890  Send to specific recipient
  --message="text"      Send custom message
  --cron                Generate cron job entry
  --test                Send test SMS immediately
  --help                Show this help message

Environment Variables:
  NEXT_PUBLIC_BASE_URL         Base URL for API calls (default: http://localhost:3000)
  SMS_ONLY_GOOD_CONDITIONS     Only send SMS for good/excellent conditions (default: false)
  SMS_DEBUG                    Enable debug logging (default: false)

Examples:
  node sms-automation.js --test
  node sms-automation.js --recipient=+1234567890 --message="Custom alert"
  node sms-automation.js --cron
    `);
    return;
  }
  
  if (args.includes('--cron')) {
    console.log('📅 Cron job entry for daily SMS alerts:');
    console.log('');
    console.log(generateCronEntry());
    console.log('To install, run: crontab -e');
    console.log('Then paste the above line into your crontab.');
    return;
  }
  
  // Check if we should send notification (for automated mode)
  if (isAutomated) {
    const shouldSend = await shouldSendNotification();
    if (!shouldSend) {
      console.log('🌫️ [SMS Automation] Conditions not suitable for notification, skipping SMS');
      return;
    }
  }
  
  // Send SMS
  const options = {};
  if (recipient) options.recipient = recipient;
  if (customMessage) options.customMessage = customMessage;
  
  const result = await sendSMSNotification(options);
  
  if (!result.success) {
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 [SMS Automation] Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  sendSMSNotification,
  shouldSendNotification,
  generateCronEntry
};
