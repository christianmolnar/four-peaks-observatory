# SMS Observatory Alerts Setup Guide

This guide will help you set up automated SMS text message alerts for your observatory forecasts using Twilio.

## 🚀 Quick Start

### 1. Prerequisites

- Twilio account (free trial includes $15 credit)
- Phone number to receive alerts
- Observatory application running

### 2. Twilio Setup

1. **Sign up for Twilio**
   - Go to [https://www.twilio.com/](https://www.twilio.com/)
   - Click "Sign up for free"
   - Complete the verification process

You're all verified!
If you lose your phone, or don’t have access to your verification device, this code is your failsafe to access your account.
FEDHZCYLEK2DHE4LGWY54ACD

2. **Get your credentials**
   - Go to the [Twilio Console](https://console.twilio.com/)
   - **Account SID**: Found in your Twilio Console dashboard
   - **Auth Token**: Found in your Twilio Console dashboard
   - Keep these secret!

3. **Get a phone number**
   - In the Twilio Console, go to Phone Numbers > Manage > Buy a number
   - Choose a local or toll-free number
   - For trial accounts: verify your personal phone number

### 3. Environment Configuration

Add these variables to your `.env.local` file:

```bash
# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+1234567890  # Your Twilio number
TWILIO_TO_NUMBER=+1234567890    # Your phone number
```

**Important:** Phone numbers must be in E.164 format (`+1234567890`)

### 4. Test SMS Functionality

1. Start your development server: `npm run dev`
2. Go to [http://localhost:3000/admin/asset-manager](http://localhost:3000/admin/asset-manager)
3. Click the "📱 SMS Alerts" tab
4. Click "Send Test SMS"

## 📱 SMS Features

### What You'll Receive

Your SMS alerts will include:

- **🌟 Overall Conditions**: Excellent, Good, Dubious, or Poor
- **🌙 Observing Window**: Tonight's optimal viewing times
- **✅ Best Time Windows**: Specific hours with excellent conditions
- **⚠️ Weather Warnings**: Critical alerts (overcast, bright moon)
- **🤖 AI Confidence**: When AI analysis is available

### Sample SMS Message

```
🔭 Four Peaks Observatory Dec 10
🌟 EXCELLENT
🌙 21:00-05:00 (8h)
🌟 Best: 22:00-02:00, 03:00-05:00
🤖 AI: 92% confident
```

## 🤖 Automation Options

### Option 1: Manual Testing

Use the admin interface to send SMS alerts manually:
- Great for testing and occasional use
- Full control over when alerts are sent
- Can send custom messages

### Option 2: Cron Job Automation

Set up daily automated alerts using cron:

```bash
# Generate cron entry
node scripts/sms-automation.js --cron

# Install the cron job
crontab -e
# Paste the generated line
```

This will send daily SMS alerts at 10:00 AM with current conditions.

### Option 3: Conditional Automation

Only send SMS for good observing conditions:

```bash
# Set environment variable
SMS_ONLY_GOOD_CONDITIONS=true

# Run automation script
node scripts/sms-automation.js --automated
```

### Option 4: Webhook Integration

For cloud deployments, you can trigger SMS via API calls:

```bash
# Send SMS via API
curl -X POST http://your-domain.com/api/send-sms-report \
  -H "Content-Type: application/json" \
  -d '{"recipient": "+1234567890"}'
```

## 🔧 Advanced Configuration

### Custom Recipients

Send SMS to different numbers:

```javascript
// Via automation script
node scripts/sms-automation.js --recipient=+1234567890

// Via API
fetch('/api/send-sms-report', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ recipient: '+1234567890' })
});
```

### Custom Messages

Send custom alerts:

```javascript
// Via automation script
node scripts/sms-automation.js --message="Clear skies tonight! 🌟"

// Via admin interface
// Use the "Send Custom Message" section in the SMS tab
```

### Smart Filtering

Configure when to send alerts:

```bash
# Only send for good/excellent conditions
SMS_ONLY_GOOD_CONDITIONS=true

# Enable debug logging
SMS_DEBUG=true
```

## 📊 Cost Considerations

### Twilio Pricing (as of 2024)

- **SMS sending**: ~$0.0075 per message (less than 1¢)
- **Trial credit**: $15 (covers ~2000 messages)
- **Monthly usage**: Daily alerts = ~$2.25/year

### Cost Optimization Tips

1. **Use conditional sending**: Only send for good conditions
2. **Combine with email**: Use SMS for urgent alerts only
3. **Choose local numbers**: Slightly cheaper than toll-free
4. **Monitor usage**: Check Twilio console regularly

## 🔍 Troubleshooting

### Common Issues

**SMS not received:**
- Check phone number format (must include country code)
- Verify phone number is verified (for trial accounts)
- Check Twilio console for delivery status

**Authentication errors:**
- Verify Account SID and Auth Token are correct
- Check for typos in environment variables
- Ensure credentials are from the same Twilio project

**Rate limiting:**
- Twilio has default rate limits
- For high volume, contact Twilio support
- Space out automated messages

### Debug Commands

```bash
# Test SMS with debug logging
SMS_DEBUG=true node scripts/sms-automation.js --test

# Check environment variables
node -e "console.log(process.env.TWILIO_ACCOUNT_SID)"

# Verify API endpoint
curl -X GET http://localhost:3000/api/observation-evaluate
```

### Getting Help

1. **Check Twilio Console**: View message logs and delivery status
2. **Observatory Logs**: Check browser console and server logs
3. **Twilio Support**: Free support for technical issues
4. **Community**: Observatory GitHub issues for app-specific problems

## 🌟 Pro Tips

### Best Practices

1. **Test thoroughly**: Always test SMS before automation
2. **Monitor costs**: Set up Twilio usage alerts
3. **Keep it concise**: SMS has character limits
4. **Use emojis**: Quick visual scanning of conditions
5. **Time zone aware**: Automation respects your local time

### Integration Ideas

- **Weather apps**: Combine with weather API data
- **Calendar events**: SMS before planned observing sessions
- **Equipment monitoring**: Alerts for telescope readiness
- **Community sharing**: Send group alerts to astronomy club

### Security

- **Keep credentials secret**: Never commit .env files
- **Rotate tokens**: Regularly update Auth Tokens
- **Limit access**: Use Twilio subaccounts for different purposes
- **Monitor usage**: Watch for unexpected SMS activity

## 📚 API Reference

### SMS Endpoints

#### Send Observatory Forecast
```
POST /api/send-sms-report
Content-Type: application/json

{
  "recipient": "+1234567890",        // Optional: override default
  "customClearSkyUrl": "https://...", // Optional: custom chart
  "includeDetails": true             // Optional: detailed analysis
}
```

#### Send Custom Message
```
POST /api/send-sms-report
Content-Type: application/json

{
  "recipient": "+1234567890",
  "customMessage": "Custom alert text"
}
```

### Response Format

```json
{
  "success": true,
  "messageSid": "SM1234567890abcdef",
  "message": "Observatory forecast SMS sent successfully",
  "recommendation": {
    "overall": "excellent",
    "summary": "Excellent observing conditions...",
    "aiConfidence": 0.92
  },
  "smsData": {
    "to": "+1234567890",
    "from": "+0987654321",
    "messageLength": 156
  },
  "timestamp": "2024-12-10T17:00:00.000Z",
  "location": "Four Peaks Observatory",
  "observingWindow": {
    "start": "21:00",
    "end": "05:00",
    "totalHours": 8
  }
}
```

---

## 🎯 Next Steps

1. **Complete Twilio setup** using the steps above
2. **Test SMS functionality** in the admin interface
3. **Set up automation** using cron or webhooks
4. **Customize alerts** based on your observing preferences
5. **Monitor and optimize** costs and delivery

Happy stargazing! 🔭✨
