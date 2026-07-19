#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const exifr = require('exifr');

// Paths
const IMAGES_BASE = '/Users/christian/Repos/FourPeaksObservatory/public/images';
const METADATA_FILE = '/Users/christian/Repos/FourPeaksObservatory/src/data/metadata.json';

// Image folders to scan (matches the global config structure)
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

// Supported image extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.avif', '.webp'];

function findImages() {
  const allImages = [];
  
  SCAN_FOLDERS.forEach(folder => {
    const fullPath = path.join(IMAGES_BASE, folder);
    
    if (fs.existsSync(fullPath)) {
      const files = fs.readdirSync(fullPath);
      
      files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (IMAGE_EXTENSIONS.includes(ext)) {
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

function loadExistingMetadata() {
  try {
    const content = fs.readFileSync(METADATA_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.log('Could not load existing metadata');
    return {};
  }
}

// Convert GPS coordinates to readable location
function formatGPSLocation(latitude, longitude) {
  if (!latitude || !longitude) return '';
  
  const lat = Math.abs(latitude);
  const lon = Math.abs(longitude);
  const latDir = latitude >= 0 ? 'N' : 'S';
  const lonDir = longitude >= 0 ? 'E' : 'W';
  
  return `${lat.toFixed(6)}°${latDir}, ${lon.toFixed(6)}°${lonDir}`;
}

// Try to reverse geocode coordinates to a readable location
// Note: This is a simplified version - you might want to use a real geocoding service
function approximateLocation(latitude, longitude) {
  if (!latitude || !longitude) return '';
  
  // Washington State bounds (approximate)
  if (latitude >= 45.5 && latitude <= 49.0 && longitude >= -124.8 && longitude <= -116.9) {
    // More specific Washington locations
    if (latitude >= 47.4 && latitude <= 47.8 && longitude >= -122.5 && longitude <= -121.5) {
      return 'Greater Seattle Area, WA';
    } else if (latitude >= 47.2 && latitude <= 47.6 && longitude >= -122.0 && longitude <= -121.0) {
      return 'Maple Valley/Ravensdale Area, WA';
    } else if (latitude >= 47.8 && latitude <= 48.2 && longitude >= -121.0 && longitude <= -120.0) {
      return 'Chelan Area, WA';
    }
    return 'Washington State';
  }
  
  // Oregon bounds
  if (latitude >= 42.0 && latitude <= 46.3 && longitude >= -124.6 && longitude <= -116.5) {
    if (latitude >= 45.4 && latitude <= 45.7 && longitude >= -122.8 && longitude <= -122.4) {
      return 'Portland Area, OR';
    }
    return 'Oregon';
  }
  
  // Yellowstone area (Wyoming/Montana/Idaho)
  if (latitude >= 44.1 && latitude <= 45.1 && longitude >= -111.2 && longitude <= -109.8) {
    return 'Yellowstone National Park';
  }
  
  // Grand Teton area
  if (latitude >= 43.6 && latitude <= 44.0 && longitude >= -111.0 && longitude <= -110.6) {
    return 'Grand Teton National Park';
  }
  
  // Mexico (rough bounds)
  if (latitude >= 14.5 && latitude <= 32.7 && longitude >= -118.4 && longitude <= -86.7) {
    return 'Mexico';
  }
  
  return `Unknown (${formatGPSLocation(latitude, longitude)})`;
}

async function extractEXIFLocations() {
  console.log('🔍 Scanning images for EXIF GPS data...');
  
  const allImages = findImages();
  const existingMetadata = loadExistingMetadata();
  const results = [];
  
  for (const image of allImages) {
    try {
      console.log(`📍 Processing: ${image.filename}`);
      
      // Get EXIF data
      const exifData = await exifr.parse(image.fullPath, {
        gps: true,
        pick: ['latitude', 'longitude', 'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef']
      });
      
      let hasGPS = false;
      let latitude = null;
      let longitude = null;
      let gpsString = '';
      let approximateLocationString = '';
      
      if (exifData) {
        // Try different GPS field names
        latitude = exifData.latitude || exifData.GPSLatitude;
        longitude = exifData.longitude || exifData.GPSLongitude;
        
        if (latitude && longitude) {
          hasGPS = true;
          gpsString = formatGPSLocation(latitude, longitude);
          approximateLocationString = approximateLocation(latitude, longitude);
        }
      }
      
      // Get current location from metadata
      const currentLocation = existingMetadata[image.filename]?.location || 'Not in metadata';
      
      results.push({
        filename: image.filename,
        folder: image.folder,
        currentLocation,
        hasGPS,
        gpsCoordinates: gpsString,
        approximateLocation: approximateLocationString
      });
      
    } catch (error) {
      console.log(`   ⚠️  Error reading EXIF for ${image.filename}: ${error.message}`);
      results.push({
        filename: image.filename,
        folder: image.folder,
        currentLocation: existingMetadata[image.filename]?.location || 'Not in metadata',
        hasGPS: false,
        gpsCoordinates: 'Error reading EXIF',
        approximateLocation: 'Error reading EXIF'
      });
    }
  }
  
  return results;
}

function generateMarkdownReport(results) {
  let markdown = `# EXIF GPS Location Analysis Report

Generated on: ${new Date().toISOString()}

## Summary

- **Total Images Analyzed**: ${results.length}
- **Images with GPS Data**: ${results.filter(r => r.hasGPS).length}
- **Images without GPS Data**: ${results.filter(r => !r.hasGPS).length}

## Detailed Results

| Image | Folder | Current Location | Has GPS | GPS Coordinates | Approximate Location |
|-------|--------|------------------|---------|-----------------|---------------------|
`;

  results.forEach(result => {
    const hasGpsIcon = result.hasGPS ? '✅' : '❌';
    const gpsCoords = result.gpsCoordinates || 'No GPS data';
    const approxLocation = result.approximateLocation || 'No GPS data';
    
    markdown += `| ${result.filename} | ${result.folder} | ${result.currentLocation} | ${hasGpsIcon} | ${gpsCoords} | ${approxLocation} |\n`;
  });

  // Add statistics by folder
  markdown += `\n## GPS Data by Folder\n\n`;
  
  const folderStats = {};
  results.forEach(result => {
    if (!folderStats[result.folder]) {
      folderStats[result.folder] = { total: 0, withGPS: 0 };
    }
    folderStats[result.folder].total++;
    if (result.hasGPS) {
      folderStats[result.folder].withGPS++;
    }
  });
  
  markdown += `| Folder | Total Images | With GPS | Percentage |\n`;
  markdown += `|--------|--------------|----------|------------|\n`;
  
  Object.entries(folderStats).forEach(([folder, stats]) => {
    const percentage = stats.total > 0 ? ((stats.withGPS / stats.total) * 100).toFixed(1) : '0';
    markdown += `| ${folder} | ${stats.total} | ${stats.withGPS} | ${percentage}% |\n`;
  });

  // Add images that might benefit from location updates
  const imagesWithGPS = results.filter(r => r.hasGPS && r.approximateLocation !== 'Error reading EXIF');
  if (imagesWithGPS.length > 0) {
    markdown += `\n## Images with GPS Data Available for Location Updates\n\n`;
    markdown += `These images have GPS coordinates that could potentially update their location:\n\n`;
    
    imagesWithGPS.forEach(result => {
      if (result.currentLocation !== result.approximateLocation) {
        markdown += `- **${result.filename}**: Current="${result.currentLocation}" → Suggested="${result.approximateLocation}"\n`;
      }
    });
  }

  return markdown;
}

async function main() {
  try {
    const results = await extractEXIFLocations();
    const markdown = generateMarkdownReport(results);
    
    const reportPath = '/Users/christian/Repos/FourPeaksObservatory/exif-gps-report.md';
    fs.writeFileSync(reportPath, markdown);
    
    console.log(`\n✅ Report generated: ${reportPath}`);
    console.log(`📊 Analyzed ${results.length} images`);
    console.log(`📍 Found GPS data in ${results.filter(r => r.hasGPS).length} images`);
    
  } catch (error) {
    console.error('❌ Error generating report:', error);
    process.exit(1);
  }
}

main();
