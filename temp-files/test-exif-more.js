#!/usr/bin/env node

const exifr = require('exifr');
const fs = require('fs');
const path = require('path');

// Test more astrophotography images to see EXIF patterns
const IMAGES_BASE = '/Users/christian/Repos/MapleValleyObservatory/public/images';

async function testMoreImages() {
  console.log('🔍 Testing EXIF data from various folders...\n');
  
  const testFolders = [
    'astrophotography/featured',
    'astrophotography/deep-sky/nebulas',
    'terrestrial/yellowstone'
  ];
  
  for (const folder of testFolders) {
    console.log(`📁 Testing folder: ${folder}`);
    const fullPath = path.join(IMAGES_BASE, folder);
    
    if (fs.existsSync(fullPath)) {
      const files = fs.readdirSync(fullPath)
        .filter(file => /\.(jpg|jpeg|png|avif)$/i.test(file))
        .slice(0, 3); // Test first 3 images only
      
      for (const file of files) {
        const filePath = path.join(fullPath, file);
        console.log(`   📸 ${file}`);
        
        try {
          const exifData = await exifr.parse(filePath);
          
          if (exifData) {
            // Look for the best date field in order of preference
            const dateFields = [
              'DateTimeOriginal',  // Best - actual capture time
              'CreateDate',        // Good - creation time
              'DateTime',          // OK - file datetime
              'DateTimeDigitized', // OK - digitization time
              'ModifyDate'         // Last resort - modification time
            ];
            
            let bestDate = null;
            let bestField = null;
            
            for (const field of dateFields) {
              if (exifData[field]) {
                bestDate = exifData[field];
                bestField = field;
                break;
              }
            }
            
            if (bestDate) {
              const date = new Date(bestDate);
              const monthNames = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
              ];
              const formattedDate = `${monthNames[date.getMonth()]}, ${date.getFullYear()}`;
              console.log(`      ✅ ${bestField}: ${formattedDate} (${bestDate})`);
            } else {
              console.log(`      ❌ No date fields found`);
            }
          } else {
            console.log(`      ❌ No EXIF data`);
          }
        } catch (error) {
          console.log(`      ❌ Error: ${error.message}`);
        }
      }
    }
    console.log('');
  }
}

testMoreImages().catch(console.error);
