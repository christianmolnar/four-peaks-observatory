/**
 * Clear Sky Chart Annotation Generator
 * 
 * Creates an annotated version of a Clear Sky Chart showing exactly where
 * our analysis system samples each factor and time column.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_CHART_CONFIG } from '@/lib/chart-config';

// Use dynamic import for canvas to handle potential server-side issues
async function createAnnotatedChart(chartUrl: string, config: any) {
  const { createCanvas, loadImage } = await import('canvas');
  
  try {
    // Load the original chart image
    const originalImage = await loadImage(chartUrl);
    
    // Create canvas with same dimensions
    const canvas = createCanvas(originalImage.width, originalImage.height);
    const ctx = canvas.getContext('2d');
    
    // Draw the original chart
    ctx.drawImage(originalImage, 0, 0);
    
    // Factor information with colors and labels
    const factors = [
      { name: 'cloudCover', label: 'Cloud Cover', color: '#FF0000', coords: config.parameters.cloudCover },
      { name: 'transparency', label: 'Transparency', color: '#00FF00', coords: config.parameters.transparency },
      { name: 'seeing', label: 'Seeing', color: '#0000FF', coords: config.parameters.seeing },
      { name: 'smoke', label: 'Smoke', color: '#FF8C00', coords: config.parameters.smoke },
      { name: 'wind', label: 'Wind', color: '#8A2BE2', coords: config.parameters.wind }
    ];
    
    // Draw sampling dots for each factor and hour
    for (let hour = 0; hour < Math.min(config.maxHours, 48); hour++) {
      for (const factor of factors) {
        const centerX = factor.coords.x + (hour * config.hourlySpacing);
        const centerY = factor.coords.y;
        
        // Skip if coordinates are off the chart
        if (centerX >= originalImage.width - 10 || centerY >= originalImage.height - 10) continue;
        
        // Draw 6x6 sampling area outline (our actual sampling area)
        ctx.strokeStyle = factor.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(centerX - 3, centerY - 3, 6, 6);
        
        // Draw center dot (bright and noticeable)
        ctx.fillStyle = factor.color;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 2, 0, 2 * Math.PI);
        ctx.fill();
        
        // Add white outline to make it more visible
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 2, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
    
    // Add legend showing what each color represents
    const legendX = 10;
    const legendY = 10;
    const legendWidth = 220;
    const legendHeight = factors.length * 25 + 30;
    
    // Draw legend background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
    
    // Draw legend border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
    
    // Draw legend title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('5-Factor Sampling Points:', legendX + 10, legendY + 20);
    
    // Draw legend entries
    ctx.font = '12px Arial';
    factors.forEach((factor, index) => {
      const entryY = legendY + 40 + (index * 22);
      
      // Draw color sample dot
      ctx.fillStyle = factor.color;
      ctx.beginPath();
      ctx.arc(legendX + 18, entryY - 2, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(legendX + 18, entryY - 2, 4, 0, 2 * Math.PI);
      ctx.stroke();
      
      // Draw label
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(factor.label, legendX + 30, entryY + 2);
      
      // Show coordinates
      ctx.fillStyle = '#CCCCCC';
      ctx.font = '10px Arial';
      ctx.fillText(`(${factor.coords.x}, ${factor.coords.y})`, legendX + 30, entryY + 14);
      ctx.font = '12px Arial';
    });
    
    // Add technical details box
    const techX = legendX + legendWidth + 10;
    const techY = legendY;
    const techWidth = 180;
    const techHeight = 100;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(techX, techY, techWidth, techHeight);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(techX, techY, techWidth, techHeight);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('Configuration:', techX + 10, techY + 20);
    
    ctx.font = '11px Arial';
    ctx.fillText(`• 6×6 pixel sampling areas`, techX + 10, techY + 38);
    ctx.fillText(`• ${config.hourlySpacing}px spacing between hours`, techX + 10, techY + 52);
    ctx.fillText(`• Analyzing ${config.maxHours} hours`, techX + 10, techY + 66);
    ctx.fillText(`• 5 key factors only`, techX + 10, techY + 80);
    
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Canvas rendering error:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const chartUrl = searchParams.get('chartUrl') || 'https://www.cleardarksky.com/c/FourPksObcsk.gif';

  try {
    const buffer = await createAnnotatedChart(chartUrl, DEFAULT_CHART_CONFIG);
    
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Disposition': 'inline; filename="annotated-clear-sky-chart.png"'
      },
    });
    
  } catch (error) {
    console.error('Chart annotation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate annotated chart', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { chartUrl, customConfig } = await request.json();
    
    // If custom config provided, use it instead of default
    const config = customConfig || DEFAULT_CHART_CONFIG;
    
    const buffer = await createAnnotatedChart(chartUrl, config);
    
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
    });
    
  } catch (error) {
    console.error('Custom chart annotation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate custom annotated chart', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
