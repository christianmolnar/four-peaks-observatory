#!/usr/bin/env node

const exifr = require('exifr');
const fs = require('fs');

// Test the improved getDateTaken function
async function getDateTaken(filePath) {
  try {
    // First try to get EXIF data from the image
    const exifData = await exifr.parse(filePath);
    
    if (exifData) {
      // Look for the best date field in order of preference
      const dateFields = [
        'DateTimeOriginal',  // Best - actual capture time
        'CreateDate',        // Good - creation time  
        'DateTime',          // OK - file datetime
        'DateTimeDigitized', // OK - digitization time
        'ModifyDate'         // Last resort - modification time (processing date)
      ];
      
      let bestDate = null;
      let bestField = null;
      
      for (const field of dateFields) {
        if (exifData[field]) {
          bestDate = new Date(exifData[field]);
          bestField = field;
          break;
        }
      }
      
      if (bestDate && !isNaN(bestDate.getTime())) {
        // Validate that the date is reasonable for photography
        const year = bestDate.getFullYear();
        const currentYear = new Date().getFullYear();
        
        // Reject dates that are clearly unreasonable:
        // - Before 1995 (before digital photography was common)
        // - More than 1 year in the future
        if (year < 1995 || year > currentYear + 1) {
          console.log(`   ⚠️  Rejecting unreasonable EXIF date: ${year} (from ${bestField})`);
        } else {
          // Format as "Month, Year" (e.g., "February, 2024")
          const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
          ];
          
          const month = monthNames[bestDate.getMonth()];
          
          console.log(`   📅 Date from EXIF ${bestField}: ${month}, ${year}`);
          return `${month}, ${year}`;
        }
      }
    }
    
    // Fallback to file system dates if no EXIF data
    console.log(`   ⚠️  No EXIF date found, checking file system date`);
    const stats = fs.statSync(filePath);
    const fileDate = stats.birthtime || stats.mtime;
    
    // Validate file system date is reasonable
    const year = fileDate.getFullYear();
    const currentYear = new Date().getFullYear();
    
    if (year < 1995 || year > currentYear + 1) {
      console.log(`   ❌ File system date ${year} is unreasonable, leaving date blank`);
      return '';
    }
    
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const month = monthNames[fileDate.getMonth()];
    
    console.log(`   📁 Using file system date: ${month}, ${year}`);
    return `${month}, ${year}`;
  } catch (error) {
    console.warn(`⚠️  Could not read date for ${filePath}: ${error.message}`);
    return '';
  }
}

async function testImprovedValidation() {
  console.log('🧪 Testing improved date validation...\n');
  
  const testImages = [
    '/Users/christian/Repos/MapleValleyObservatory/public/images/astrophotography/deep-sky/nebulas/NGC2264.jpg',
    '/Users/christian/Repos/MapleValleyObservatory/public/images/terrestrial/yellowstone/Mammoth Hot Springs1.jpg'
  ];
  
  for (const imagePath of testImages) {
    console.log(`📸 Testing: ${imagePath.split('/').pop()}`);
    const result = await getDateTaken(imagePath);
    console.log(`   Result: "${result}"`);
    console.log('');
  }
}

testImprovedValidation().catch(console.error);
