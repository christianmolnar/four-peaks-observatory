import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { ObservationCriteria } from '@/types/observation';

const CONFIG_PATH = path.join(process.cwd(), 'src/config/observation-criteria.json');

export async function GET() {
  try {
    const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config: ObservationCriteria = JSON.parse(configData);
    
    return NextResponse.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Error loading observation config:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load configuration' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const config: ObservationCriteria = await request.json();
    
    // Validate the configuration structure
    if (!config.moonPhase || !config.moonTiming || !config.cloudCover) {
      return NextResponse.json(
        { success: false, error: 'Invalid configuration structure' },
        { status: 400 }
      );
    }
    
    // Save the configuration
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    
    return NextResponse.json({
      success: true,
      message: 'Configuration saved successfully'
    });
  } catch (error) {
    console.error('Error saving observation config:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save configuration' },
      { status: 500 }
    );
  }
}
