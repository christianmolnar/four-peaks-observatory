import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'src/config/observation-criteria-config.json');

// Default Clear Sky Chart-based configuration
const defaultConfig = {
  cloudCover: {
    excellent: { min: 0, max: 10 },
    dubious: { min: 20, max: 30 },
    poor: { min: 40, max: 100 }
  },
  ecmwfCloud: {
    excellent: { values: ['Clear Sky'] },
    dubious: { values: ['Cloud 25%'] },
    poor: { values: ['Cloud 50%', 'Cloud 75%', 'Overcast'] }
  },
  transparency: {
    excellent: { values: ['Transparent', 'Above average', 'Average'] },
    dubious: { values: ['Below Average'] },
    poor: { values: ['Poor'] }
  },
  seeing: {
    excellent: { values: ['Excellent 5/5', 'Good 4/5', 'Average 3/5'] },
    dubious: { values: ['Poor 2/5'] },
    poor: { values: ['Bad 1/5'] }
  },
  darkness: {
    enabled: false, // Disabled as requested
    excellent: { min: -4, max: 6.4 },
    dubious: { min: -6, max: -4.1 },
    poor: { min: -10, max: -6.1 }
  },
  smoke: {
    excellent: { min: 0, max: 20 },
    dubious: { min: 40, max: 100 },
    poor: { min: 200, max: 500 }
  },
  wind: {
    excellent: { min: 0, max: 11 },
    dubious: { min: 12, max: 16 },
    poor: { min: 17, max: 100 }
  },
  humidity: {
    // Set to be excellent across the whole scale as requested
    excellent: { min: 0, max: 100 },
    dubious: { min: 101, max: 101 }, // Impossible range
    poor: { min: 102, max: 102 } // Impossible range
  },
  temperature: {
    // Set to be excellent across the whole scale as requested
    excellent: { min: -50, max: 120 },
    dubious: { min: 121, max: 121 }, // Impossible range
    poor: { min: 122, max: 122 } // Impossible range
  },
  heuristic: 'floor' // Worst one wins
};

export async function GET() {
  try {
    let config = defaultConfig;
    
    // Try to load existing config
    if (fs.existsSync(CONFIG_PATH)) {
      const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
      config = JSON.parse(configData);
    }
    
    return NextResponse.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Error loading observation criteria config:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load configuration',
        config: defaultConfig // Return default config as fallback
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { config } = await request.json();
    
    // Ensure config directory exists
    const configDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Save the configuration
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    
    return NextResponse.json({
      success: true,
      message: 'Configuration saved successfully'
    });
  } catch (error) {
    console.error('Error saving observation criteria config:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save configuration'
      },
      { status: 500 }
    );
  }
}
