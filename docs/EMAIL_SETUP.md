# 📧 Daily Ob## Environment Variables

The following environment variables need to be configured in your deployment platform (Vercel):

```bash
FORMSPREE_FORM_ID=mrbyadzk
DAILY_REPORT_EMAIL=chrismolhome@hotmail.com
EMAIL_ENABLED=true
```

### Vercel Configuration:
1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Add each variable aboverts

This feature allows the Four Peaks Observatory to send automated daily observation reports via email using Formspree.io.

## 🚀 Quick Setup

### 1. Create Formspree Account
1. Visit [formspree.io](https://formspree.io) and sign up for a free account
2. The free plan includes 50 submissions per month (perfect for daily reports)

### 2. Create a New Form
1. In your Formspree dashboard, click "New Form"
2. Choose any name (e.g., "Observatory Daily Reports")
3. Copy your form ID (it will look like `xrgnqjyk`)

### 3. Configure Environment Variables
1. Copy `.env.example` to `.env.local` in your project root
2. Add your Formspree configuration:

```bash
# Required: Your Formspree form ID
FORMSPREE_FORM_ID=your_form_id_here

# Required: Email address to receive daily reports  
DAILY_REPORT_EMAIL=your@email.com

# Optional: Enable/disable email functionality
EMAIL_ENABLED=true

# Optional: Time to send daily reports (24-hour format)
DAILY_REPORT_TIME=10:00
```

### 4. Test the Setup
1. Go to your observatory website
2. Navigate to the observation forecast section
3. Click the "📧 Send Daily Report" button
4. If environment variables are configured, it will send automatically
5. If not configured, it will prompt for email and form ID

## 📋 What's Included in Daily Reports

Each daily report contains:

- **Overall Assessment**: Excellent/Good/Dubious/Poor rating
- **Observing Window**: Sunset+1hr to Sunrise-1hr times
- **Sun Times**: Exact sunset and sunrise times
- **Moon Conditions**: Phase, brightness, rise/set times
- **Hourly Forecast**: Time-by-time observing quality breakdown
- **Summary**: Key highlights and recommendations
- **Location Info**: Observatory details and Clear Sky Chart link

### Sample Email Content
```
🌟 MAPLE VALLEY OBSERVATORY DAILY OBSERVATION REPORT
Tuesday, October 8, 2024

OVERALL ASSESSMENT: ⚠️ DUBIOUS

OBSERVING WINDOW: 6:24 PM to 5:25 AM
Total observing time: 11 hours

SUN TIMES:
🌅 Sunset: 5:24 PM
🌄 Sunrise: 6:25 AM

MOON CONDITIONS:
🌙 Phase: 96% illuminated
💡 Brightness: 96%
🌅 Rise: 6:02 PM
🌇 Set: N/A

TONIGHT'S CONDITIONS BY TIME:
⭐ 18:00 - 21:00 (4 hours): EXCELLENT
   Clear skies with good transparency
⚠️ 22:00 - 05:00 (7 hours): DUBIOUS  
   Moderate conditions - cloudCover may obstruct targets

SUMMARY:
Dubious observing conditions throughout the 11-hour window...
```

## ⚙️ Manual Testing

### Via Web Interface
1. Visit the observation forecast page
2. Click "📧 Send Daily Report" 
3. Follow prompts if environment variables aren't set

### Via API Directly
```bash
# With environment variables configured
curl -X POST https://your-domain.com/api/send-daily-report \
  -H "Content-Type: application/json" \
  -d '{"triggerSource": "manual"}'

# With custom recipient/form ID
curl -X POST https://your-domain.com/api/send-daily-report \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "test@example.com",
    "formspreeId": "your_form_id",
    "triggerSource": "manual"
  }'
```

## 🔄 Automated Scheduling

### Option 1: Cron Job (Linux/Mac)
Add to your crontab (`crontab -e`):
```bash
# Send daily report at 10:00 AM
0 10 * * * curl -X POST https://your-domain.com/api/send-daily-report
```

### Option 2: Vercel Cron Jobs
Add to your `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/send-daily-report",
      "schedule": "0 10 * * *"
    }
  ]
}
```

### Option 3: GitHub Actions
Create `.github/workflows/daily-report.yml`:
```yaml
name: Daily Observatory Report
on:
  schedule:
    - cron: '0 10 * * *'  # 10:00 AM UTC
jobs:
  send-report:
    runs-on: ubuntu-latest
    steps:
      - name: Send Daily Report
        run: |
          curl -X POST ${{ secrets.SITE_URL }}/api/send-daily-report
```

## 🛠️ Configuration Options

### Environment Variables
- `FORMSPREE_FORM_ID`: Your Formspree form ID (required)
- `DAILY_REPORT_EMAIL`: Default recipient email (required) 
- `EMAIL_ENABLED`: Enable/disable email functionality (optional, default: true)
- `DAILY_REPORT_TIME`: Time to send reports in HH:MM format (optional, default: 10:00)

### Formspree Settings
In your Formspree dashboard, you can:
- Customize email templates
- Set up auto-responses
- Add multiple recipients
- Configure spam filtering
- Set up webhooks for integrations

## 📊 Monitoring & Analytics

### Formspree Dashboard
- View submission history
- See delivery status
- Monitor bounce rates  
- Export submission data

### Application Logs
The API endpoint logs:
- Email send attempts
- Success/failure status
- Recipient information
- Trigger source (manual/automated)

## 🔒 Security & Privacy

- Email addresses are only sent to Formspree.io
- No sensitive data is stored locally
- Formspree complies with GDPR and privacy regulations
- Free plan includes spam filtering

## 🆘 Troubleshooting

### Common Issues

**"Missing required parameters" error**
- Check that `FORMSPREE_FORM_ID` and `DAILY_REPORT_EMAIL` are set in `.env.local`
- Restart your development server after adding environment variables

**Email not received**
- Check spam/junk folder
- Verify form ID in Formspree dashboard
- Check Formspree submission logs
- Ensure recipient email is correct

**"Failed to send via Formspree" error**  
- Verify your form ID is correct
- Check Formspree dashboard for error details
- Ensure you haven't exceeded free plan limits (50/month)

**Astronomical data errors**
- Check Clear Sky Chart URL in observation criteria
- Verify location coordinates are correct
- Check for network connectivity issues

### Getting Help
1. Check the Formspree dashboard for delivery status
2. Review browser console for JavaScript errors
3. Check application logs for API errors
4. Verify environment variables are loaded correctly

## 💡 Tips & Best Practices

- Test email delivery before setting up automation
- Monitor Formspree usage to stay within free plan limits
- Set up multiple recipients by configuring them in Formspree
- Use descriptive subject lines for better email organization
- Consider setting up email filters for automatic filing

## 🔄 Future Enhancements

Possible improvements:
- Multiple recipient support
- Custom email templates
- Weekend/holiday scheduling options
- Integration with calendar systems
- SMS notifications via additional services
- Webhook integrations for Slack/Discord notifications
