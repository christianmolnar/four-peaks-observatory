import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface SyncResult {
  filename: string;
  action: 'added' | 'updated' | 'skipped';
  category?: string;
  subcategory?: string;
  reason?: string;
}

// Function to scan directory and get missing files
function scanDirectory(dirPath: string, basePath: string = ''): any[] {
  const files: any[] = [];
  
  try {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        const subFiles = scanDirectory(fullPath, path.join(basePath, item));
        files.push(...subFiles);
      } else if (stats.isFile() && /\.(jpg|jpeg|png|gif|webp)$/i.test(item)) {
        const relativePath = basePath ? path.join(basePath, item) : item;
        const fileInfo = {
          filename: item,
          relativePath: relativePath.replace(/\\/g, '/'),
          fullPath,
          size: stats.size,
          lastModified: stats.mtime,
          ...inferCategoryFromPath(relativePath.replace(/\\/g, '/'))
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
  
  if (pathParts.includes('astrophotography')) {
    const result: any = { category: 'astrophotography' };
    
    // Check for subcategories
    if (pathParts.includes('featured')) {
      result.subcategory = 'featured';
    } else if (pathParts.includes('deep-sky')) {
      const deepSkyIndex = pathParts.indexOf('deep-sky');
      if (deepSkyIndex + 1 < pathParts.length) {
        result.subcategory = 'deep-sky/' + pathParts[deepSkyIndex + 1];
      }
    } else if (pathParts.includes('solar-system')) {
      const solarIndex = pathParts.indexOf('solar-system');
      if (solarIndex + 1 < pathParts.length) {
        result.subcategory = 'solar-system/' + pathParts[solarIndex + 1];
      }
    }
    
    return result;
  } else if (pathParts.includes('equipment')) {
    return { category: 'equipment', subcategory: 'equipment' };
  } else if (pathParts.includes('terrestrial')) {
    const result: any = { category: 'terrestrial' };
    const terrestrialIndex = pathParts.indexOf('terrestrial');
    if (terrestrialIndex + 1 < pathParts.length) {
      result.subcategory = pathParts[terrestrialIndex + 1];
    }
    return result;
  }
  
  return {};
}

function createDefaultMetadataEntry(fileInfo: any): any {
  const { filename, category, subcategory } = fileInfo;
  
  // Base entry structure
  const entry: any = {
    protected: false,
    youtubeLink: "",
    youtubeTitle: "",
    category: category || "uncategorized",
  };

  if (subcategory) {
    entry.subcategory = subcategory;
  }

  // Category-specific fields
  if (category === 'astrophotography') {
    entry.catalogDesignation = "";
    entry.objectName = filename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
    entry.dateTaken = "";
    entry.equipment = "";
    entry.exposure = "";
  } else if (category === 'terrestrial') {
    entry.name = filename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
    entry.dateTaken = "";
  } else if (category === 'equipment') {
    entry.equipmentName = filename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
    entry.equipmentInfo = "";
  }

  return entry;
}

export async function POST(request: NextRequest) {
  // Disable admin routes in production Vercel builds to prevent bundle size issues
  if (process.env.VERCEL_ENV === 'production' || (process.env.NODE_ENV as string) === 'production') {
    return NextResponse.json({ 
      error: 'Admin functions disabled in production builds to prevent bundle size issues' 
    }, { status: 503 });
  }

  try {
    let requestBody: any = {};
    try {
      requestBody = await request.json();
    } catch {
      // No body provided, we'll sync all missing files
    }
    
    const { filesToSync, overwriteExisting = false } = requestBody;

    // Load current metadata
    const metadataPath = path.join(process.cwd(), 'src', 'data', 'metadata.json');
    let metadata;
    try {
      const metadataContent = fs.readFileSync(metadataPath, 'utf8');
      metadata = JSON.parse(metadataContent);
    } catch (error) {
      return NextResponse.json({ error: 'Failed to read metadata.json' }, { status: 500 });
    }

    // If no specific files provided, scan and sync all missing files
    let actualFilesToSync = filesToSync;
    if (!actualFilesToSync || !Array.isArray(actualFilesToSync)) {
      // Scan the images directory
      const imagesPath = path.join(process.cwd(), 'public', 'images');
      const scannedFiles = scanDirectory(imagesPath);
      
      // Find files not in metadata, deduplicate by filename
      const filesInMetadata = Object.keys(metadata);
      const uniqueScannedFiles = new Map();
      
      // Use Map to deduplicate by filename, keeping the first occurrence
      for (const file of scannedFiles) {
        if (!uniqueScannedFiles.has(file.filename)) {
          uniqueScannedFiles.set(file.filename, file);
        }
      }
      
      actualFilesToSync = Array.from(uniqueScannedFiles.values()).filter(f => !filesInMetadata.includes(f.filename));
    }

    const results: SyncResult[] = [];
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const fileInfo of actualFilesToSync) {
      const filename = typeof fileInfo === 'string' ? fileInfo : fileInfo.filename;
      
      if (!filename) {
        results.push({
          filename: 'unknown',
          action: 'skipped',
          reason: 'Missing filename'
        });
        skippedCount++;
        continue;
      }

      const existsInMetadata = metadata[filename];
      
      if (existsInMetadata && !overwriteExisting) {
        results.push({
          filename,
          action: 'skipped',
          reason: 'Already exists in metadata'
        });
        skippedCount++;
        continue;
      }

      // Create new metadata entry
      const newEntry = createDefaultMetadataEntry(typeof fileInfo === 'string' ? { filename } : fileInfo);
      
      if (existsInMetadata) {
        metadata[filename] = { ...existsInMetadata, ...newEntry };
        results.push({
          filename,
          action: 'updated',
          category: newEntry.category,
          subcategory: newEntry.subcategory
        });
        updatedCount++;
      } else {
        metadata[filename] = newEntry;
        results.push({
          filename,
          action: 'added',
          category: newEntry.category,
          subcategory: newEntry.subcategory
        });
        addedCount++;
      }
    }

    // Save updated metadata
    try {
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    } catch (error) {
      return NextResponse.json({ error: 'Failed to save metadata.json' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalProcessed: actualFilesToSync.length,
        added: addedCount,
        updated: updatedCount,
        skipped: skippedCount
      },
      results
    });

  } catch (error) {
    console.error('Error in sync-files API:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
