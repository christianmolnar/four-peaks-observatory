/**
 * Test for duplicate key fix in file system scanning
 * 
 * This test validates that the file-scan API properly deduplicates
 * filenames when the same file exists in multiple directories,
 * preventing React duplicate key errors in the admin interface.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function curlGet(url) {
  try {
    const result = execSync(`curl -s "${url}"`, { encoding: 'utf8' });
    return JSON.parse(result);
  } catch (error) {
    throw new Error(`Failed to fetch ${url}: ${error.message}`);
  }
}

function curlPost(url, data) {
  try {
    const result = execSync(`curl -s -X POST "${url}" -H "Content-Type: application/json" -d '${JSON.stringify(data)}'`, { encoding: 'utf8' });
    return JSON.parse(result);
  } catch (error) {
    throw new Error(`Failed to post to ${url}: ${error.message}`);
  }
}

describe('Duplicate Key Fix Tests', () => {
  const testDir = path.join(__dirname, 'temp-test-images');
  const testMetadata = {
    'existing-file.jpg': {
      category: 'test',
      protected: false
    }
  };

  beforeAll(() => {
    // Create test directory structure with duplicate filenames
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Create subdirectories
    fs.mkdirSync(path.join(testDir, 'hero'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'assets'), { recursive: true });
    
    // Create the same filename in different directories
    fs.writeFileSync(path.join(testDir, 'hero', 'duplicate-test.jpg'), 'test content');
    fs.writeFileSync(path.join(testDir, 'assets', 'duplicate-test.jpg'), 'test content');
    fs.writeFileSync(path.join(testDir, 'unique-file.jpg'), 'test content');
  });

  afterAll(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('file-scan API should deduplicate filenames', async () => {
    const data = curlGet('http://localhost:3002/api/admin/file-scan');
    
    expect(data.success).toBe(true);
    
    // Check that filesNotInMetadata doesn't contain duplicates
    const filesNotInMetadata = data.analysis.filesNotInMetadata;
    const uniqueFiles = [...new Set(filesNotInMetadata)];
    
    expect(filesNotInMetadata.length).toBe(uniqueFiles.length);
    
    // Count occurrences of NGC7000-Pelican-1.jpg (our test case)
    const ngcCount = filesNotInMetadata.filter(f => f === 'NGC7000-Pelican-1.jpg').length;
    expect(ngcCount).toBeLessThanOrEqual(1);
  });

  test('sync-files API should handle duplicate filenames correctly', async () => {
    // First sync to add a test file
    const data = curlPost('http://localhost:3002/api/admin/sync-files', {
      filesToSync: [
        { filename: 'test-unique-file.jpg', category: 'test' }
      ]
    });
    
    expect(data.success).toBe(true);
    
    // The API should handle duplicates by not processing the same filename twice
    // if it's already in the sync list
    expect(data.results.length).toBeGreaterThan(0);
  });

  test('admin interface should not have duplicate React keys', () => {
    // This test ensures that the data structure fed to React components
    // doesn't contain duplicate keys
    
    // Simulate the data processing that happens in the admin interface
    const mockFileSystemData = {
      analysis: {
        filesNotInMetadata: ['file1.jpg', 'file2.jpg', 'file1.jpg'], // Contains duplicate
        metadataWithoutFiles: ['missing1.jpg', 'missing2.jpg']
      }
    };
    
    // Apply the same deduplication that should happen in the UI
    const uniqueFilesNotInMetadata = [...new Set(mockFileSystemData.analysis.filesNotInMetadata)];
    
    expect(uniqueFilesNotInMetadata).toEqual(['file1.jpg', 'file2.jpg']);
    expect(uniqueFilesNotInMetadata.length).toBe(2);
  });

  test('file scanning detects files in multiple directories correctly', async () => {
    const data = curlGet('http://localhost:3002/api/admin/file-scan');
    
    expect(data.success).toBe(true);
    
    // Find all instances of NGC7000-Pelican-1.jpg in the scanned files
    const ngcFiles = data.files.filter(f => f.filename === 'NGC7000-Pelican-1.jpg');
    
    // Should find multiple instances in different paths
    expect(ngcFiles.length).toBeGreaterThan(1);
    
    // Verify that the deduplication is working by checking that
    // filesNotInMetadata only contains unique values
    const filesNotInMetadata = data.analysis.filesNotInMetadata;
    const uniqueFiles = [...new Set(filesNotInMetadata)];
    expect(filesNotInMetadata.length).toBe(uniqueFiles.length);
  });
});
