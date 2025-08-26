#!/usr/bin/env node
/**
 * Asset Protection Utility
 * 
 * This script helps identify and properly categorize files in the /assets/ directory
 * that should be marked as protected (excluded from galleries)
 */

const fs = require('fs');
const path = require('path');

async function identifyAssetFiles() {
  try {
    // Load current metadata
    const metadataPath = path.join(process.cwd(), 'src', 'data', 'metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    
    // Get files in assets directory
    const assetsPath = path.join(process.cwd(), 'public', 'images', 'assets');
    const assetFiles = fs.readdirSync(assetsPath).filter(f => f.match(/\.(jpg|jpeg|png|gif|webp)$/i));
    
    console.log('🔍 ASSET FILE ANALYSIS');
    console.log('========================');
    console.log(`Found ${assetFiles.length} image files in /assets/ directory:\n`);
    
    const recommendations = [];
    
    for (const filename of assetFiles) {
      const metadataEntry = metadata[filename];
      
      if (!metadataEntry) {
        console.log(`❌ ${filename} - NOT FOUND in metadata`);
        recommendations.push({
          filename,
          action: 'ADD_TO_METADATA',
          recommended: 'Add as protected asset'
        });
      } else {
        const isProtected = metadataEntry.protected;
        const category = metadataEntry.category;
        
        if (isProtected) {
          console.log(`✅ ${filename} - Already protected (${category})`);
        } else {
          console.log(`⚠️  ${filename} - Unprotected ${category} - SHOULD BE PROTECTED`);
          recommendations.push({
            filename,
            action: 'MARK_PROTECTED',
            current: category,
            recommended: 'Mark as protected to exclude from galleries'
          });
        }
      }
    }
    
    if (recommendations.length > 0) {
      console.log('\n🛠️  RECOMMENDED ACTIONS');
      console.log('=======================');
      
      for (const rec of recommendations) {
        console.log(`📝 ${rec.filename}:`);
        console.log(`   Action: ${rec.action}`);
        console.log(`   ${rec.recommended}`);
        if (rec.current) console.log(`   Current: ${rec.current}`);
        console.log('');
      }
      
      console.log('💡 TO FIX THESE ISSUES:');
      console.log('1. Go to your admin interface: http://localhost:3002/admin/asset-manager');
      console.log('2. For each file listed above:');
      console.log('   - Find the file in the table');
      console.log('   - Set "Protected" to true (✓)');
      console.log('   - Set "Category" to "assets" or "ui"');
      console.log('3. Save changes');
      console.log('');
      console.log('Or use the bulk operations to select multiple files and mark them as protected.');
    } else {
      console.log('\n✅ All asset files are properly configured!');
    }
    
  } catch (error) {
    console.error('Error analyzing asset files:', error.message);
  }
}

// Run the analysis
identifyAssetFiles();
