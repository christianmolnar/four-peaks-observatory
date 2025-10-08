# Quick Setup Checklist for Daily Email Reports

## Completed ✅
- [x] Created Formspree form `mrbyadzk`
- [x] Updated title to use single quotes and observatory name
- [x] Configured email system with your specific form ID
- [x] Updated documentation with your settings

## Next Steps (5-10 minutes)

### 1. Set Environment Variables in Vercel
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your `MapleValleyObservatory` project
3. Go to Settings → Environment Variables
4. Add these three variables:

```
FORMSPREE_FORM_ID = mrbyadzk
DAILY_REPORT_EMAIL = chrismolhome@hotmail.com
EMAIL_ENABLED = true
```

### 2. Deploy to Vercel
```bash
git add .
git commit -m "Configure email reports with Formspree form mrbyadzk"
git push
```

### 3. Test Manual Email (after deployment)
1. Go to your live site
2. Scroll to the "Let's Get Out There Tonight!" section
3. Click "Send Daily Report" button
4. Check your email for the report

### 4. Set Up Automated Daily Emails (choose one)

#### Option A: Cron-job.org (Recommended - Free)
1. Go to https://cron-job.org/
2. Create free account
3. Add new cronjob:
   - **URL**: `https://your-domain.vercel.app/api/send-daily-report`
   - **Method**: POST
   - **Headers**: `Content-Type: application/json`
   - **Request body**: `{"triggerSource": "cron"}`
   - **Schedule**: Daily at 10:00 AM (Pacific Time)

#### Option B: EasyCron.com (Alternative - Free)
1. Go to https://www.easycron.com/
2. Create free account  
3. Add new cron job with same settings as above

## Verification
- [ ] Environment variables set in Vercel
- [ ] Site deployed and accessible
- [ ] Manual email test successful
- [ ] Automated cron job configured
- [ ] First automated email received (next day)

## Support Files Created
- `CRON_SETUP.md` - Detailed cron job setup guide
- `docs/EMAIL_SETUP.md` - Updated with your form ID
- `.env.example` - Updated with your settings

## What Changed
✅ Title now shows: **'Let's Get Out There Tonight!' Forecast for Maple Valley Observatory**  
✅ All configuration files updated with your Formspree form ID `mrbyadzk`  
✅ Email recipient set to `chrismolhome@hotmail.com`  
✅ Ready for production deployment

The system is ready! Just complete the environment variable setup in Vercel and you'll have automated daily observatory forecasts.
