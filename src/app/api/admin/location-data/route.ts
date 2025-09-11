// Location Data API - Admin endpoint for location metadata management
// Disabled in production to reduce bundle size

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Disable admin routes in production builds to prevent bundle size issues
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return NextResponse.json({ 
      error: 'Admin functions disabled in production builds to prevent bundle size issues' 
    }, { status: 503 });
  }

  // Development functionality placeholder
  return NextResponse.json({ 
    message: 'Location data endpoint - development in progress',
    data: []
  });
}

export async function POST(request: NextRequest) {
  // Disable admin routes in production builds to prevent bundle size issues  
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return NextResponse.json({ 
      error: 'Admin functions disabled in production builds to prevent bundle size issues' 
    }, { status: 503 });
  }

  // Development functionality placeholder
  return NextResponse.json({ 
    message: 'Location data update - development in progress'
  });
}