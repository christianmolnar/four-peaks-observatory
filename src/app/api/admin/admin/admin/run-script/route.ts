import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  // Disable admin routes in production Vercel builds to prevent bundle size issues
  if (process.env.VERCEL_ENV === 'production' || (process.env.NODE_ENV as string) === 'production') {
    return NextResponse.json({ 
      error: 'Admin functions disabled in production builds to prevent bundle size issues' 
    }, { status: 503 });
  }

  try {
    // Security check: Require admin token in production environments
    const isProduction = process.env.VERCEL_ENV === 'production' || (process.env.NODE_ENV as string) === 'production';
    if (isProduction) {
      const authHeader = request.headers.get('Authorization');
      const expectedToken = process.env.ADMIN_API_TOKEN;
      
      if (!authHeader || !expectedToken || authHeader !== `Bearer ${expectedToken}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { script } = await request.json();

    // Validate script name (only allow specific metadata scripts)
    const allowedScripts = [
      'analyze-assets',
      'audit-metadata-categories', 
      'cleanup-orphaned',
      'fix-featured-metadata',
      'protect-assets',
      'update-metadata'  // Root-level script for finding new images
    ];

    if (!allowedScripts.includes(script)) {
      return NextResponse.json({ 
        error: `Script '${script}' not allowed. Allowed scripts: ${allowedScripts.join(', ')}` 
      }, { status: 400 });
    }

    // Get the script path - update-metadata is at root level, others in scripts folder
    const scriptPath = script === 'update-metadata' 
      ? path.join(process.cwd(), 'update-metadata.js')
      : path.join(process.cwd(), 'scripts', `${script}.js`);
    
    // Execute the script
    const { stdout, stderr } = await execAsync(`node "${scriptPath}"`, {
      cwd: process.cwd(),
      timeout: 60000 // 60 second timeout
    });

    return NextResponse.json({
      success: true,
      script: script,
      output: stdout,
      errors: stderr || null
    });

  } catch (error: any) {
    console.error('Script execution error:', error);
    
    return NextResponse.json({
      error: error.message || 'Script execution failed',
      details: error.stderr || error.stdout || null
    }, { status: 500 });
  }
}
