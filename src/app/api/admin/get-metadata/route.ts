import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  // Disable admin routes in production Vercel builds to prevent bundle size issues
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return NextResponse.json({ 
      error: 'Admin functions disabled in production builds to prevent bundle size issues' 
    }, { status: 503 });
  }

  try {
    const metadataPath = path.join(process.cwd(), 'src', 'data', 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      return NextResponse.json({ error: 'Metadata file not found' }, { status: 404 });
    }
    const content = fs.readFileSync(metadataPath, 'utf8');
    const metadata = JSON.parse(content);
    return NextResponse.json({ metadata });
  } catch (error) {
    console.error('Error reading metadata:', error);
    return NextResponse.json({ error: 'Failed to read metadata' }, { status: 500 });
  }
}
