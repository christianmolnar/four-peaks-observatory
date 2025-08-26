import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { filenames, deleteFiles = false } = await request.json();
    
    if (!filenames || !Array.isArray(filenames)) {
      return NextResponse.json({ error: 'Invalid filenames array' }, { status: 400 });
    }

    // Path to metadata.json (corrected path)
    const metadataPath = path.join(process.cwd(), 'src', 'data', 'metadata.json');
    
    // Read current metadata
    let metadata;
    try {
      const metadataContent = fs.readFileSync(metadataPath, 'utf8');
      metadata = JSON.parse(metadataContent);
    } catch (error) {
      return NextResponse.json({ error: 'Failed to read metadata.json' }, { status: 500 });
    }

    // Track results
    const deletedFromMetadata: string[] = [];
    const deletedFromFileSystem: string[] = [];
    const notFoundInMetadata: string[] = [];
    const notFoundInFileSystem: string[] = [];
    const errors: string[] = [];
    
    for (const filename of filenames) {
      // Remove from metadata
      if (metadata[filename]) {
        const fileSystemPath = metadata[filename]._fileSystemPath;
        delete metadata[filename];
        deletedFromMetadata.push(filename);
        
        // Optionally delete actual file
        if (deleteFiles) {
          try {
            // Try to find and delete the actual file
            const possiblePaths = [
              path.join(process.cwd(), 'public', 'images', filename),
              path.join(process.cwd(), 'public', 'images', 'astrophotography', filename),
              path.join(process.cwd(), 'public', 'images', 'terrestrial', filename),
              path.join(process.cwd(), 'public', 'images', 'equipment', filename)
            ];
            
            // If we have file system path from metadata, try that first
            if (fileSystemPath) {
              possiblePaths.unshift(path.join(process.cwd(), 'public', 'images', fileSystemPath));
            }
            
            let fileDeleted = false;
            for (const filePath of possiblePaths) {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                deletedFromFileSystem.push(filename);
                fileDeleted = true;
                break;
              }
            }
            
            if (!fileDeleted) {
              notFoundInFileSystem.push(filename);
            }
          } catch (error) {
            errors.push(`Failed to delete file ${filename}: ${error}`);
          }
        }
      } else {
        notFoundInMetadata.push(filename);
      }
    }

    // Write updated metadata back to file
    try {
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    } catch (error) {
      return NextResponse.json({ error: 'Failed to update metadata.json' }, { status: 500 });
    }

    const response: any = { 
      success: true, 
      deletedFromMetadata: deletedFromMetadata.length,
      metadataFiles: deletedFromMetadata
    };
    
    if (deleteFiles) {
      response.deletedFromFileSystem = deletedFromFileSystem.length;
      response.fileSystemFiles = deletedFromFileSystem;
      response.notFoundInFileSystem = notFoundInFileSystem.length > 0 ? notFoundInFileSystem : undefined;
    }
    
    if (notFoundInMetadata.length > 0) {
      response.notFoundInMetadata = notFoundInMetadata;
    }
    
    if (errors.length > 0) {
      response.errors = errors;
    }
    
    response.message = deleteFiles 
      ? `Deleted ${deletedFromMetadata.length} from metadata, ${deletedFromFileSystem.length} from file system`
      : `Successfully deleted ${deletedFromMetadata.length} image(s) from metadata`;

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in delete-images API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
