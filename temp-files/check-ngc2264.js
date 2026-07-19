#!/usr/bin/env node

const exifr = require('exifr');
const fs = require('fs');

async function checkProblemImage() {
  const imagePath = '/Users/christian/Repos/FourPeaksObservatory/public/images/astrophotography/deep-sky/nebulas/NGC2264.jpg';
  
  console.log('🔍 Checking NGC2264.jpg for EXIF data...\n');
  
  if (!fs.existsSync(imagePath)) {
    console.log('❌ File does not exist');
    return;
  }
  
  // Check file system dates
  const stats = fs.statSync(imagePath);
  console.log('📁 File system info:');
  console.log(`   Birth time: ${stats.birthtime}`);
  console.log(`   Modified time: ${stats.mtime}`);
  
  // Check EXIF data
  try {
    const exifData = await exifr.parse(imagePath);
    
    if (exifData) {
      console.log('\n📸 EXIF data found:');
      
      const dateFields = [
        'DateTimeOriginal',
        'CreateDate',
        'DateTime', 
        'DateTimeDigitized',
        'ModifyDate'
      ];
      
      let hasAnyDate = false;
      dateFields.forEach(field => {
        if (exifData[field]) {
          console.log(`   ${field}: ${exifData[field]}`);
          hasAnyDate = true;
        }
      });
      
      if (!hasAnyDate) {
        console.log('   ❌ No date fields found in EXIF');
      }
      
      // Show other metadata
      console.log('\n📝 Other EXIF fields:');
      Object.keys(exifData).slice(0, 10).forEach(key => {
        if (!dateFields.includes(key)) {
          console.log(`   ${key}: ${exifData[key]}`);
        }
      });
    } else {
      console.log('\n❌ No EXIF data found at all');
    }
  } catch (error) {
    console.log(`\n❌ Error reading EXIF: ${error.message}`);
  }
}

checkProblemImage().catch(console.error);
