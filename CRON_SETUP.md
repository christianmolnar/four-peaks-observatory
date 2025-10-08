# Daily Email Report Cron Job Setup

This guide explains how to set up automated daily email reports for the observatory forecast system using your Formspree form `mrbyadzk`.

## Prerequisites

1. ✅ Formspree account created and form ID `mrbyadzk` available
2. ✅ Environment variables configured in Vercel
3. ✅ Email system implemented and tested manually

## Environment Variables Setup

### In Vercel Dashboard:
1. Go to your project → Settings → Environment Variables
2. Add the following variables:

```bash
FORMSPREE_FORM_ID=mrbyadzk
DAILY_REPORT_EMAIL=chrismolhome@hotmail.com
EMAIL_ENABLED=true
```

### In Local Development (.env.local):
```bash
FORMSPREE_FORM_ID=mrbyadzk
DAILY_REPORT_EMAIL=chrismolhome@hotmail.com
EMAIL_ENABLED=true
```

## Cron Job Options

### Option 1: Vercel Cron Jobs (Recommended)

Vercel Pro plans include cron job functionality. Since this is likely a personal project, this might not be available, but here's how it would work:

1. Create `vercel.json` in project root:
```json
{
  "crons": [
    {
      "path": "/api/send-daily-report",
      "schedule": "0 17 * * *"
    }
  ]
}
```

2. The schedule `"0 17 * * *"` means 5:00 PM UTC daily (10:00 AM PST/11:00 AM PDT)

### Option 2: External Cron Service (Free Alternative)

Since Vercel cron requires a paid plan, use a free external service:

#### A. EasyCron (Free tier: 1 job)
1. Go to https://www.easycron.com/
2. Create free account
3. Add new cron job:
   - **URL**: `https://your-domain.vercel.app/api/send-daily-report`
   - **Method**: POST
   - **Headers**: `Content-Type: application/json`
   - **Body**: `{"triggerSource": "cron"}`
   - **Schedule**: `0 10 * * *` (10:00 AM daily)
   - **Timezone**: America/Los_Angeles

#### B. Cron-job.org (Free tier: 2 jobs)
1. Go to https://cron-job.org/
2. Create free account
3. Add new cronjob:
   - **URL**: `https://your-domain.vercel.app/api/send-daily-report`
   - **Method**: POST
   - **Headers**: `Content-Type: application/json`
   - **Request body**: `{"triggerSource": "cron"}`
   - **Schedule**: Daily at 10:00 AM (Pacific Time)

#### C. UptimeRobot (Free monitoring with cron-like behavior)
1. Go to https://uptimerobot.com/
2. Create free account
3. Add HTTP(s) monitor:
   - **URL**: `https://your-domain.vercel.app/api/send-daily-report`
   - **Monitoring Interval**: Every 24 hours
   - **Request Headers**: `Content-Type: application/json`
   - **POST Value**: `{"triggerSource": "cron"}`

### Option 3: GitHub Actions (Free)

Create `.github/workflows/daily-email.yml`:

```yaml
name: Daily Observatory Report
on:
  schedule:
    - cron: '0 17 * * *'  # 5:00 PM UTC = 10:00 AM PST
  workflow_dispatch:  # Allow manual trigger

jobs:
  send-report:
    runs-on: ubuntu-latest
    steps:
      - name: Send Daily Report
        run: |
          curl -X POST https://your-domain.vercel.app/api/send-daily-report \
            -H "Content-Type: application/json" \
            -d '{"triggerSource": "github-actions"}'
```

## Current Setup Status

✅ **Email API Endpoint**: `/api/send-daily-report` - Ready  
✅ **Formspree Integration**: Configured for form `mrbyadzk`  
✅ **Manual Trigger**: Available via admin interface  
⏳ **Environment Variables**: Need to be set in Vercel  
⏳ **Cron Job**: Choose and implement one of the options above  

## Testing

### Manual Test via Admin Interface:
1. Go to `/admin/asset-manager`
2. Click "Email Reports" tab
3. Click "Send Test Report" button

### Manual Test via API:
```bash
curl -X POST https://your-domain.vercel.app/api/send-daily-report \
  -H "Content-Type: application/json" \
  -d '{"triggerSource": "manual-test"}'
```

### Manual Test via Home Page:
1. Go to home page
2. Scroll to "Let's Get Out There Tonight!" section
3. Click "Send Daily Report" button

## Recommended Implementation Steps

1. **Set Environment Variables in Vercel** (5 minutes)
2. **Choose External Cron Service** - Cron-job.org or EasyCron (10 minutes)
3. **Test Manual Trigger** (2 minutes)
4. **Set up Cron Job** (5 minutes)
5. **Monitor for First Automated Email** (next day)

## Troubleshooting

### Email Not Sending:
- Check Vercel function logs
- Verify environment variables are set
- Test manual trigger first
- Check Formspree submission logs

### Cron Not Triggering:
- Verify external service is active
- Check service logs/status
- Test URL manually
- Confirm timezone settings

### Email Content Issues:
- Check Clear Sky Chart API availability
- Verify observatory coordinates in config
- Test `/api/observation-evaluate` endpoint separately

## Support

For issues with:
- **Formspree**: https://help.formspree.io/
- **Vercel**: https://vercel.com/docs
- **External Cron Services**: Check their respective documentation

## Next Steps

1. Choose your preferred cron solution from the options above
2. Set the environment variables in Vercel
3. Test the manual trigger
4. Set up the automated schedule
5. Monitor the first few deliveries

The system is ready for automation once you complete the environment variable setup and choose a cron solution!
