#!/usr/bin/env node

const exifr = require('exifr');
const fs = require('fs');
const path = require('path');

// Test a few sample images to see what EXIF data is available
const sampleImages = [
  '/Users/christian/Repos/MapleValleyObservatory/public/images/astrophotography/featured/M31.jpg',
  '/Users/christian/Repos/MapleValleyObservatory/public/images/astrophotography/deep-sky/nebulas/M42 The Orion Nebula.jpg',
  '/Users/christian/Repos/MapleValleyObservatory/public/images/terrestrial/yellowstone/Mammoth Hot Springs1.jpg',
  '/Users/christian/Repos/MapleValleyObservatory/public/images/astrophotography/deep-sky/nebulas/NGC7000.jpg'
];

async function testExifData() {
  console.log('🔍 Testing EXIF data extraction from sample images...\n');
  
  for (const imagePath of sampleImages) {
    console.log(`📸 Testing: ${path.basename(imagePath)}`);
    
    if (!fs.existsSync(imagePath)) {
      console.log('   ❌ File does not exist\n');
      continue;
    }
    
    try {
      // Read EXIF data
      const exifData = await exifr.parse(imagePath);
      
      if (exifData) {
        console.log('   ✅ EXIF data found:');
        
        // Look for date-related fields
        const dateFields = [
          'DateTimeOriginal',
          'DateTime', 
          'CreateDate',
          'DateTimeDigitized',
          'ModifyDate'
        ];
        
        let foundDates = false;
        dateFields.forEach(field => {
          if (exifData[field]) {
            console.log(`      ${field}: ${exifData[field]}`);
            foundDates = true;
          }
        });
        
        if (!foundDates) {
          console.log('      ⚠️  No date fields found in EXIF');
        }
        
        // Show a few other interesting fields
        const otherFields = ['Make', 'Model', 'Software', 'ExposureTime', 'ISO'];
        otherFields.forEach(field => {
          if (exifData[field]) {
            console.log(`      ${field}: ${exifData[field]}`);
          }
        });
        
      } else {
        console.log('   ❌ No EXIF data found');
      }
    } catch (error) {
      console.log(`   ❌ Error reading EXIF: ${error.message}`);
    }
    
    console.log('');
  }
}

testExifData().catch(console.error);
