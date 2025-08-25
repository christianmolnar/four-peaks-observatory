#!/usr/bin/env node

const exifr = require('exifr');
const fs = require('fs');
const path = require('path');

// Force update all dateTaken fields with EXIF data
const METADATA_FILE = '/Users/christian/Repos/MapleValleyObservatory/src/data/metadata.json';
const IMAGES_BASE = '/Users/christian/Repos/MapleValleyObservatory/public/images';

const SCAN_FOLDERS = [
  'astrophotography/featured',
  'astrophotography/deep-sky/galaxies',
  'astrophotography/deep-sky/nebulas',
  'astrophotography/deep-sky/star-clusters',
  'astrophotography/deep-sky/wide-field',
  'astrophotography/deep-sky/Hubble-Palette',
  'astrophotography/solar-system/solar',
  'astrophotography/solar-system/lunar',
  'astrophotography/solar-system/planets',
  'astrophotography/solar-system/events',
  'astrophotography/solar-system/events/total-eclipse-2017',
  'terrestrial/yellowstone',
  'terrestrial/grand-tetons',
  'equipment'
];

const MEDIA_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.avif', '.webp', '.mp4', '.mov', '.avi', '.webm'];

function findImages() {
  const allImages = [];
  
  SCAN_FOLDERS.forEach(folder => {
    const fullPath = path.join(IMAGES_BASE, folder);
    
    if (fs.existsSync(fullPath)) {
      const files = fs.readdirSync(fullPath);
      
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (MEDIA_EXTENSIONS.includes(ext)) {
          allImages.push({
            filename: file,
            folder: folder,
            fullPath: path.join(fullPath, file)
          });
        }
      });
    }
  });
  
  return allImages;
}

async function getDateFromExif(filePath) {
  try {
    // Don't try to read EXIF from video files
    const ext = path.extname(filePath).toLowerCase();
    if (['.mp4', '.mov', '.avi', '.webm'].includes(ext)) {
      return null;
    }
    
    const exifData = await exifr.parse(filePath);
    
    if (exifData) {
      const dateFields = [
        'DateTimeOriginal',
        'CreateDate',
        'DateTime', 
        'DateTimeDigitized',
        'ModifyDate'
      ];
      
      for (const field of dateFields) {
        if (exifData[field]) {
          const date = new Date(exifData[field]);
          if (!isNaN(date.getTime())) {
            const monthNames = [
              'January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'
            ];
            
            const month = monthNames[date.getMonth()];
            const year = date.getFullYear();
            
            return {
              date: `${month}, ${year}`,
              field: field,
              originalDate: exifData[field]
            };
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.warn(`⚠️  Error reading EXIF for ${path.basename(filePath)}: ${error.message}`);
    return null;
  }
}

function getImageType(folder) {
  if (folder.startsWith('terrestrial/')) {
    return 'terrestrial';
  } else if (folder === 'equipment') {
    return 'equipment';
  } else if (folder.includes('events')) {
    return 'celestial-events';
  } else {
    return 'astrophotography';
  }
}

async function forceUpdateDates() {
  console.log('🔄 Force updating all dateTaken fields with EXIF data...\n');
  
  const allImages = findImages();
  const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
  
  let updatedCount = 0;
  let noExifCount = 0;
  let skipCount = 0;
  
  for (const image of allImages) {
    const imageType = getImageType(image.folder);
    
    // Skip equipment images - they don't need dates
    if (imageType === 'equipment') {
      skipCount++;
      continue;
    }
    
    // Skip if no metadata entry exists
    if (!metadata[image.filename]) {
      console.log(`⚠️  No metadata entry for: ${image.filename}`);
      continue;
    }
    
    console.log(`📸 Processing: ${image.filename}`);
    
    const exifResult = await getDateFromExif(image.fullPath);
    
    if (exifResult) {
      const currentDate = metadata[image.filename].dateTaken;
      
      if (currentDate !== exifResult.date) {
        console.log(`   🔄 Updating: "${currentDate}" → "${exifResult.date}" (from ${exifResult.field})`);
        metadata[image.filename].dateTaken = exifResult.date;
        updatedCount++;
      } else {
        console.log(`   ✅ Already correct: ${exifResult.date}`);
      }
    } else {
      console.log(`   ❌ No EXIF date found, keeping current: ${metadata[image.filename].dateTaken || 'none'}`);
      noExifCount++;
    }
  }
  
  // Write updated metadata
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
  
  console.log(`\n📊 Summary:`);
  console.log(`   Images processed: ${allImages.length}`);
  console.log(`   Dates updated with EXIF: ${updatedCount}`);
  console.log(`   No EXIF date found: ${noExifCount}`);
  console.log(`   Equipment images skipped: ${skipCount}`);
  console.log(`\n✅ Metadata file updated!`);
}

forceUpdateDates().catch(console.error);
