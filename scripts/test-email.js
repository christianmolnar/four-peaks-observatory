#!/usr/bin/env node

/**
 * Simple Email Test Script
 * Tests email delivery without automation complexity
 */

require('dotenv').config({ path: '.env.local' });

async function testSimpleEmail() {
  try {
    console.log('🧪 Testing Formspree Email Service...');
    console.log('📧 Sending to:', process.env.DAILY_REPORT_EMAIL);
    console.log('🔑 Form ID:', process.env.FORMSPREE_FORM_ID);
    
    const fetch = (await import('node-fetch')).default;
    
    const emailData = {
      email: process.env.DAILY_REPORT_EMAIL,
      subject: `🔭 Test Observatory Email - ${new Date().toLocaleTimeString()}`,
      message: `
🔭 OBSERVATORY EMAIL TEST
========================

This is a test email from your observatory automation system.

Time: ${new Date().toLocaleString()}
System: Working correctly
Email service: Formspree

If you receive this email, your automation is configured correctly!

🌟 Next step: Set up daily automation with the cron job.

Best regards,
Maple Valley Observatory Automation
      `,
      _replyto: process.env.DAILY_REPORT_EMAIL
    };
    
    console.log('📤 Sending email...');
    
    const response = await fetch(`https://formspree.io/f/${process.env.FORMSPREE_FORM_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(emailData),
    });
    
    console.log('📡 Response status:', response.status);
    console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log('📡 Response body:', responseText);
    
    if (response.ok) {
      console.log('✅ Email sent successfully!');
      console.log('📍 Check your email in:');
      console.log('   • Inbox');
      console.log('   • Spam/Junk folder (most likely)');
      console.log('   • Promotions tab');
      console.log('   • May take 1-5 minutes to arrive');
    } else {
      console.log('❌ Email failed to send');
      console.log('💡 Status:', response.status);
      console.log('💡 Response:', responseText);
    }
    
  } catch (error) {
    console.error('💥 Email test failed:', error.message);
  }
}

testSimpleEmail();
