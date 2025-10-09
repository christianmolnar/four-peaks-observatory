import { NextResponse } from 'next/server';

export async function GET() {
  const envCheck = {
    FORMSPREE_FORM_ID: process.env.FORMSPREE_FORM_ID ? 'Set' : 'Not Set',
    DAILY_REPORT_EMAIL: process.env.DAILY_REPORT_EMAIL ? 'Set' : 'Not Set',
    EMAIL_ENABLED: process.env.EMAIL_ENABLED ? 'Set' : 'Not Set',
    actualValues: {
      FORMSPREE_FORM_ID: process.env.FORMSPREE_FORM_ID || 'undefined',
      DAILY_REPORT_EMAIL: process.env.DAILY_REPORT_EMAIL || 'undefined',
      EMAIL_ENABLED: process.env.EMAIL_ENABLED || 'undefined'
    }
  };

  return NextResponse.json(envCheck);
}
