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
    // Security check: Require admin token in production
    if (process.env.NODE_ENV === 'production') {
      const authHeader = request.headers.get('authorization');
      const adminToken = process.env.ADMIN_API_TOKEN;
      
      if (!adminToken || !authHeader || authHeader !== `Bearer ${adminToken}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Load existing metadata
    let metadata: Record<string, any> = {};
    try {
      const metadataPath = path.join(process.cwd(), 'src', 'data', 'metadata.json');
      const metadataContent = fs.readFileSync(metadataPath, 'utf8');
      metadata = JSON.parse(metadataContent);
    } catch (error) {
      console.error('Error loading metadata:', error);
      return NextResponse.json({ error: 'Failed to read metadata.json' }, { status: 500 });
    }

    // Analyze metadata (no file system scanning)
    const filesInMetadata = Object.keys(metadata);
    const analysis = {
      totalMetadataEntries: filesInMetadata.length,
      categorizedFiles: filesInMetadata.filter(filename => metadata[filename].category).length,
      uncategorizedFiles: filesInMetadata.filter(filename => !metadata[filename].category).length,
      categories: [...new Set(filesInMetadata.map(filename => metadata[filename].category).filter(Boolean))],
      subcategories: [...new Set(filesInMetadata.map(filename => metadata[filename].subcategory).filter(Boolean))]
    };

    // Convert metadata to file-like structure for compatibility
    const files = filesInMetadata.map(filename => ({
      filename,
      category: metadata[filename].category,
      subcategory: metadata[filename].subcategory,
      relativePath: metadata[filename]._fileSystemPath || filename,
      // Add other metadata fields
      ...metadata[filename]
    }));

    return NextResponse.json({
      success: true,
      files,
      metadata,
      analysis,
      note: 'This scan uses metadata only - no file system access required'
    });
    
  } catch (error) {
    console.error('Error in metadata-scan API:', error);
    return NextResponse.json({ 
      error: 'Failed to scan metadata',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
