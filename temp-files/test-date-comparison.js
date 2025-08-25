#!/usr/bin/env node

const exifr = require('exifr');
const fs = require('fs');
const path = require('path');

// Test EXIF vs current stored dates for a few specific images
const metadata = JSON.parse(fs.readFileSync('/Users/christian/Repos/MapleValleyObservatory/src/data/metadata.json', 'utf8'));

const testImages = [
  {
    file: 'Mammoth Hot Springs1.jpg',
    path: '/Users/christian/Repos/MapleValleyObservatory/public/images/terrestrial/yellowstone/Mammoth Hot Springs1.jpg'
  },
  {
    file: 'NGC7000.jpg', 
    path: '/Users/christian/Repos/MapleValleyObservatory/public/images/astrophotography/deep-sky/nebulas/NGC7000.jpg'
  },
  {
    file: 'Cocoon Nebula Tight.jpg',
    path: '/Users/christian/Repos/MapleValleyObservatory/public/images/astrophotography/deep-sky/nebulas/Cocoon Nebula Tight.jpg'
  }
];

async function compareDates() {
  console.log('🔍 Comparing current stored dates vs EXIF dates...\n');
  
  for (const image of testImages) {
    console.log(`📸 ${image.file}`);
    
    // Current stored date
    const currentDate = metadata[image.file]?.dateTaken || 'No date stored';
    console.log(`   Current stored: ${currentDate}`);
    
    // EXIF date
    try {
      const exifData = await exifr.parse(image.path);
      
      if (exifData) {
        const dateFields = [
          'DateTimeOriginal',
          'CreateDate', 
          'DateTime',
          'DateTimeDigitized',
          'ModifyDate'
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
        
        if (bestDate) {
          const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
          ];
          
          const month = monthNames[bestDate.getMonth()];
          const year = bestDate.getFullYear();
          const exifDateFormatted = `${month}, ${year}`;
          
          console.log(`   EXIF ${bestField}: ${exifDateFormatted}`);
          
          if (currentDate !== exifDateFormatted) {
            console.log(`   🔄 DIFFERENT! Should update from "${currentDate}" to "${exifDateFormatted}"`);
          } else {
            console.log(`   ✅ Matches current stored date`);
          }
        } else {
          console.log(`   ❌ No EXIF date found`);
        }
      } else {
        console.log(`   ❌ No EXIF data`);
      }
    } catch (error) {
      console.log(`   ❌ Error reading EXIF: ${error.message}`);
    }
    
    console.log('');
  }
}

compareDates().catch(console.error);
