import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface FileInfo {
  filename: string;
  relativePath: string;
  fullPath: string;
  category?: string;
  subcategory?: string;
  size?: number;
  lastModified?: Date;
}

function scanDirectory(dirPath: string, relativePath: string = ''): FileInfo[] {
  const files: FileInfo[] = [];
  
  try {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      // Skip hidden files and system files
      if (item.startsWith('.') || item === 'README.md') continue;
      
      const fullPath = path.join(dirPath, item);
      const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        // Recursively scan subdirectories
        files.push(...scanDirectory(fullPath, itemRelativePath));
      } else if (stats.isFile() && /\.(jpg|jpeg|png|gif|bmp|tiff|webp|mp4|mov|avi|webm)$/i.test(item)) {
        // Include image and video files
        const fileInfo: FileInfo = {
          filename: item,
          relativePath: itemRelativePath,
          fullPath,
          size: stats.size,
          lastModified: stats.mtime,
          ...inferCategoryFromPath(itemRelativePath)
        };
        files.push(fileInfo);
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dirPath}:`, error);
  }
  
  return files;
}

function inferCategoryFromPath(relativePath: string): { category?: string; subcategory?: string } {
  const pathParts = relativePath.split('/');
  
  // Determine category from top-level directory
  if (pathParts[0] === 'astrophotography') {
    const category = 'astrophotography';
    
    // Determine subcategory from subdirectory structure
    if (pathParts[1] === 'featured') {
      return { category, subcategory: 'featured' };
    } else if (pathParts[1] === 'deep-sky') {
      if (pathParts[2] === 'galaxies') return { category, subcategory: 'deep-sky/galaxies' };
      if (pathParts[2] === 'nebulas') return { category, subcategory: 'deep-sky/nebulas' };
      if (pathParts[2] === 'star-clusters') return { category, subcategory: 'deep-sky/star-clusters' };
      if (pathParts[2] === 'wide-field') return { category, subcategory: 'deep-sky/wide-field' };
      if (pathParts[2] === 'hubble-palette') return { category, subcategory: 'deep-sky/hubble-palette' };
    } else if (pathParts[1] === 'solar-system') {
      if (pathParts[2] === 'solar') return { category, subcategory: 'solar-system/solar' };
      if (pathParts[2] === 'lunar') return { category, subcategory: 'solar-system/lunar' };
      if (pathParts[2] === 'planets') return { category, subcategory: 'solar-system/planets' };
    } else if (pathParts[1] === 'events') {
      return { category, subcategory: 'solar-eclipses' };
    } else if (['galaxies', 'nebulas', 'star-clusters', 'solar', 'lunar', 'planets'].includes(pathParts[1])) {
      // Handle legacy directory structure
      if (pathParts[1] === 'galaxies') return { category, subcategory: 'deep-sky/galaxies' };
      if (pathParts[1] === 'nebulas') return { category, subcategory: 'deep-sky/nebulas' };
      if (pathParts[1] === 'star-clusters') return { category, subcategory: 'deep-sky/star-clusters' };
      if (pathParts[1] === 'solar') return { category, subcategory: 'solar-system/solar' };
      if (pathParts[1] === 'lunar') return { category, subcategory: 'solar-system/lunar' };
      if (pathParts[1] === 'planets') return { category, subcategory: 'solar-system/planets' };
    }
    
    return { category };
  } else if (pathParts[0] === 'terrestrial') {
    const category = 'terrestrial';
    
    if (pathParts[1] === 'yellowstone') return { category, subcategory: 'yellowstone' };
    if (pathParts[1] === 'grand-tetons') return { category, subcategory: 'grand-tetons' };
    
    return { category };
  } else if (pathParts[0] === 'equipment') {
    return { category: 'equipment', subcategory: 'equipment' };
  }
  
  return {};
}

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

    const { searchParams } = new URL(request.url);
    const includeMetadata = searchParams.get('includeMetadata') !== 'false'; // Default to true
    
    // Scan the images directory
    const imagesPath = path.join(process.cwd(), 'public', 'images');
    const scannedFiles = scanDirectory(imagesPath);
    
    // Load existing metadata if requested
    let metadata = {};
    if (includeMetadata) {
      try {
        const metadataPath = path.join(process.cwd(), 'src', 'data', 'metadata.json');
        const metadataContent = fs.readFileSync(metadataPath, 'utf8');
        metadata = JSON.parse(metadataContent);
      } catch (error) {
        console.error('Error loading metadata:', error);
      }
    }
    
    // Compare files with metadata
    const filesInMetadata = Object.keys(metadata);
    const filesInFileSystem = [...new Set(scannedFiles.map(f => f.filename))]; // Deduplicate filenames
    
    const analysis = {
      totalFiles: scannedFiles.length,
      totalMetadataEntries: filesInMetadata.length,
      filesNotInMetadata: filesInFileSystem.filter(f => !filesInMetadata.includes(f)),
      metadataWithoutFiles: filesInMetadata.filter(f => !filesInFileSystem.includes(f)),
      categorizedFiles: scannedFiles.filter(f => f.category).length,
      uncategorizedFiles: scannedFiles.filter(f => !f.category).length
    };
    
    return NextResponse.json({
      success: true,
      files: scannedFiles,
      metadata: includeMetadata ? metadata : undefined,
      analysis
    });
    
  } catch (error) {
    console.error('Error in file-scan API:', error);
    return NextResponse.json({ 
      error: 'Failed to scan file system',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
