#!/usr/bin/env node
/**
 * Quick Asset Protection Script
 * 
 * This script automatically marks files in the /assets/ directory as protected
 * so they don't appear in photo galleries
 */

const fs = require('fs');
const path = require('path');

async function protectAssetFiles() {
  try {
    // Load current metadata
    const metadataPath = path.join(process.cwd(), 'src', 'data', 'metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    
    // Files in assets directory that should be protected
    const assetFiles = [
      'M33.jpg',
      'MVO-Favicon.jpg', 
      'Mauna-Kea-1.jpg',
      'Mauna-Kea-2.jpg',
      'NGC2070-Finished.jpg',
      'NGC7000-Pelican-1.jpg'
    ];
    
    console.log('🛡️  PROTECTING ASSET FILES');
    console.log('===========================');
    
    let modified = false;
    
    for (const filename of assetFiles) {
      if (metadata[filename]) {
        if (!metadata[filename].protected) {
          console.log(`✅ Protecting: ${filename}`);
          metadata[filename].protected = true;
          metadata[filename].category = 'assets';
          modified = true;
        } else {
          console.log(`✓  Already protected: ${filename}`);
        }
      } else {
        console.log(`❌ Not found in metadata: ${filename}`);
      }
    }
    
    if (modified) {
      // Backup original file
      const backupPath = metadataPath + '.backup.' + Date.now();
      fs.copyFileSync(metadataPath, backupPath);
      console.log(`\n💾 Backup created: ${path.basename(backupPath)}`);
      
      // Save updated metadata
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      console.log('✅ Metadata updated successfully!');
      console.log('\n🎯 RESULT: Asset files are now protected from galleries');
    } else {
      console.log('\n✅ No changes needed - all assets already properly protected');
    }
    
  } catch (error) {
    console.error('❌ Error protecting asset files:', error.message);
  }
}

// Run the protection script
protectAssetFiles();
