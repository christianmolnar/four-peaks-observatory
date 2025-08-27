import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { revalidatePath } from 'next/cache';

export async function POST(request: NextRequest) {
  // Disable admin routes in production Vercel builds to prevent bundle size issues
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    return NextResponse.json({ 
      error: 'Admin functions disabled in production builds to prevent bundle size issues' 
    }, { status: 503 });
  }

  try {

    // Developer mode restriction removed. Allow saving in all environments.

    const body = await request.json();
    const changedEntries = body.metadata;
    console.log('DEBUG: [API] Received changed entries payload:', JSON.stringify(changedEntries, null, 2));

    if (!changedEntries || typeof changedEntries !== 'object' || Array.isArray(changedEntries) || Object.keys(changedEntries).length === 0) {
      console.log('DEBUG: [API] Invalid or empty changed entries payload:', changedEntries);
      return NextResponse.json({ error: 'Changed entries are required and must be a non-empty object' }, { status: 400 });
    }

    // Path to the metadata file
    const metadataPath = path.join(process.cwd(), 'src', 'data', 'metadata.json');
    console.log('DEBUG: [API] metadataPath:', metadataPath);
    let metadata: Record<string, any> = {};
    if (fs.existsSync(metadataPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      } catch (e) {
        console.error('DEBUG: [API] Failed to parse existing metadata.json:', e);
        metadata = {};
      }
    }
    // Merge changed entries into metadata (preserve all previous entries)
    Object.entries(changedEntries).forEach(([key, value]) => {
      metadata[key] = value;
    });
    // Write the merged metadata
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    console.log('DEBUG: [API] Metadata file written:', metadataPath);

    // Try to revalidate paths that use the metadata
    try {
      revalidatePath('/admin/asset-manager');
      revalidatePath('/gallery');
      revalidatePath('/');
      console.log('DEBUG: [API] Cache revalidation attempted');
    } catch (revalidateError) {
      console.log('DEBUG: [API] Cache revalidation failed (normal in development):', revalidateError);
    }

    // Always return only the updated entry/entries
    const entryKeys = Object.keys(changedEntries);
    let updatedKey = null;
    let updatedValue = null;
    if (entryKeys.length === 1) {
      updatedKey = entryKeys[0];
      updatedValue = changedEntries[updatedKey];
    } else {
      updatedKey = entryKeys;
      updatedValue = entryKeys.map(k => changedEntries[k]);
    }
    return NextResponse.json({ success: true, message: 'Metadata saved successfully', updatedKey, updatedValue });
  } catch (error) {
    console.error('Error saving metadata:', error);
    return NextResponse.json({ error: 'Failed to save metadata' }, { status: 500 });
  }
}
