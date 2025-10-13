/**
 * Proxy endpoint for Clear Sky Chart images
 * 
 * Fetches Clear Sky Chart images and serves them to bypass CORS restrictions
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const chartUrl = searchParams.get('url');

  if (!chartUrl) {
    return NextResponse.json(
      { error: 'Missing chart URL parameter' },
      { status: 400 }
    );
  }

  try {
    // Validate that it's a Clear Sky Chart URL
    if (!chartUrl.includes('cleardarksky.com')) {
      return NextResponse.json(
        { error: 'Invalid chart URL - must be from cleardarksky.com' },
        { status: 400 }
      );
    }

    // Fetch the image
    const response = await fetch(chartUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch chart: ${response.status} ${response.statusText}`);
    }

    const imageBuffer = await response.arrayBuffer();

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        'Access-Control-Allow-Origin': '*'
      },
    });

  } catch (error) {
    console.error('Chart proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chart image', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
