#!/usr/bin/env node
/**
 * Orphaned Metadata Cleanup Utility
 * 
 * This script helps identify and clean up orphaned metadata entries
 * (metadata entries that reference non-existent files)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getOrphanedFiles() {
  try {
    const result = execSync('curl -s http://localhost:3002/api/admin/file-scan', { encoding: 'utf8' });
    const scanData = JSON.parse(result);
    return scanData.analysis.metadataWithoutFiles;
  } catch (error) {
    throw new Error(`Failed to fetch scan data: ${error.message}`);
  }
}

async function cleanupOrphanedMetadata() {
  try {
    // Load current metadata
    const metadataPath = path.join(process.cwd(), 'src', 'data', 'metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    
    console.log('🧹 ORPHANED METADATA CLEANUP');
    console.log('=============================');
    
    // Get list of orphaned entries from the API
    const orphanedFiles = getOrphanedFiles();
    
    if (orphanedFiles.length === 0) {
      console.log('✅ No orphaned metadata entries found!');
      return;
    }
    
    console.log(`Found ${orphanedFiles.length} orphaned metadata entries:\n`);
    
    const recommendations = [];
    
    for (const filename of orphanedFiles) {
      const metadataEntry = metadata[filename];
      
      // Check if it's a test file
      const isTestFile = filename.includes('test-') || filename.includes('test_');
      
      // Check if it's a video file that might legitimately exist
      const isVideoFile = /\.(mp4|mov|avi|webm)$/i.test(filename);
      
      if (isTestFile) {
        console.log(`🗑️  ${filename} - TEST FILE - Safe to delete`);
        recommendations.push({
          filename,
          action: 'DELETE',
          reason: 'Test file',
          safe: true
        });
      } else if (isVideoFile) {
        console.log(`📹 ${filename} - VIDEO FILE - Check if file exists elsewhere`);
        recommendations.push({
          filename,
          action: 'INVESTIGATE',
          reason: 'Video file might exist but not detected by scanner',
          safe: false
        });
      } else {
        console.log(`⚠️  ${filename} - IMAGE FILE - Verify before deleting`);
        recommendations.push({
          filename,
          action: 'VERIFY',
          reason: 'Image file missing from file system',
          safe: false
        });
      }
    }
    
    console.log('\n🛠️  RECOMMENDED ACTIONS');
    console.log('=======================');
    
    const safeToDelete = recommendations.filter(r => r.safe);
    const needInvestigation = recommendations.filter(r => !r.safe);
    
    if (safeToDelete.length > 0) {
      console.log('\n✅ SAFE TO DELETE (Test files):');
      for (const item of safeToDelete) {
        console.log(`   - ${item.filename}`);
      }
      
      console.log('\n💡 To delete these test files:');
      console.log('1. Go to admin interface: http://localhost:3002/admin/asset-manager');
      console.log('2. In the File System Integration panel, click "Select for Deletion" next to test files');
      console.log('3. Use bulk operations to delete selected items');
      console.log('4. Or run the auto-cleanup script below');
    }
    
    if (needInvestigation.length > 0) {
      console.log('\n🔍 NEED INVESTIGATION:');
      for (const item of needInvestigation) {
        console.log(`   - ${item.filename} (${item.reason})`);
      }
      
      console.log('\n💡 For video files:');
      console.log('   The file scanner was just updated to detect video files.');
      console.log('   Re-run the file scan to see if they are now detected.');
    }
    
  } catch (error) {
    console.error('❌ Error analyzing orphaned metadata:', error.message);
  }
}

// Add auto-cleanup function
async function autoCleanupTestFiles() {
  try {
    const metadataPath = path.join(process.cwd(), 'src', 'data', 'metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    
    const orphanedFiles = getOrphanedFiles();
    
    const testFiles = orphanedFiles.filter(f => f.includes('test-') || f.includes('test_'));
    
    if (testFiles.length === 0) {
      console.log('✅ No test files to clean up');
      return;
    }
    
    console.log(`🧹 Auto-cleaning ${testFiles.length} test files...`);
    
    // Backup original file
    const backupPath = metadataPath + '.backup.' + Date.now();
    fs.copyFileSync(metadataPath, backupPath);
    console.log(`💾 Backup created: ${path.basename(backupPath)}`);
    
    // Remove test files from metadata
    for (const filename of testFiles) {
      if (metadata[filename]) {
        delete metadata[filename];
        console.log(`✅ Removed: ${filename}`);
      }
    }
    
    // Save updated metadata
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log('✅ Metadata cleaned successfully!');
    
  } catch (error) {
    console.error('❌ Error during auto-cleanup:', error.message);
  }
}

// Check command line arguments
const args = process.argv.slice(2);
if (args.includes('--auto-cleanup')) {
  autoCleanupTestFiles();
} else {
  cleanupOrphanedMetadata();
  console.log('\n🚀 To auto-cleanup test files, run:');
  console.log('   node scripts/cleanup-orphaned.js --auto-cleanup');
}
