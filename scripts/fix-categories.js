#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Paths
const METADATA_FILE = '/Users/christian/Repos/MapleValleyObservatory/src/data/metadata.json';
const IMAGES_BASE = '/Users/christian/Repos/MapleValleyObservatory/public/images';

// Category mapping for automatic detection from file paths
const CATEGORY_MAPPINGS = {
  // Astrophotography categories
  'astrophotography/deep-sky/nebulas': { category: 'astrophotography', subcategory: 'deep-sky/nebulas' },
  'astrophotography/deep-sky/galaxies': { category: 'astrophotography', subcategory: 'deep-sky/galaxies' },
  'astrophotography/deep-sky/star-clusters': { category: 'astrophotography', subcategory: 'deep-sky/star-clusters' },
  'astrophotography/deep-sky/wide-field': { category: 'astrophotography', subcategory: 'deep-sky/wide-field' },
  'astrophotography/deep-sky/hubble-palette': { category: 'astrophotography', subcategory: 'deep-sky/hubble-palette' },
  'astrophotography/solar-system/solar': { category: 'astrophotography', subcategory: 'solar-system/solar' },
  'astrophotography/solar-system/lunar': { category: 'astrophotography', subcategory: 'solar-system/lunar' },
  'astrophotography/solar-system/planets': { category: 'astrophotography', subcategory: 'solar-system/planets' },
  'astrophotography/solar-system/events/total-eclipse-2017': { category: 'astrophotography', subcategory: 'solar-eclipses' },
  'astrophotography/solar-system/events': { category: 'astrophotography', subcategory: 'solar-system/events' },
  'astrophotography/featured': { category: 'astrophotography', subcategory: 'featured' },
  
  // Terrestrial categories
  'terrestrial/yellowstone': { category: 'terrestrial', subcategory: 'yellowstone' },
  'terrestrial/grand-tetons': { category: 'terrestrial', subcategory: 'grand-tetons' },
  
  // Equipment category
  'equipment': { category: 'equipment', subcategory: 'equipment' }
};

// Image folders to scan
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
  'astrophotography/solar-system/events/total-eclipse-2017',
  'terrestrial/yellowstone',
  'terrestrial/grand-tetons',
  'equipment'
];

// Find all images
function findImages() {
  const allImages = [];
  
  for (const folder of SCAN_FOLDERS) {
    const folderPath = path.join(IMAGES_BASE, folder);
    
    if (!fs.existsSync(folderPath)) {
      console.log(`⚠️  Folder not found: ${folderPath}`);
      continue;
    }
    
    const files = fs.readdirSync(folderPath);
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.avif', '.webp', '.mp4', '.mov', '.avi', '.webm'].includes(ext);
    });
    
    for (const file of imageFiles) {
      allImages.push({
        filename: file,
        folder: folder,
        fullPath: path.join(folderPath, file)
      });
    }
  }
  
  return allImages;
}

// Helper function to detect category from file path
function detectCategoryFromPath(folderPath) {
  const normalizedPath = folderPath.replace(/\\/g, '/').toLowerCase();
  
  for (const [pathPattern, categoryInfo] of Object.entries(CATEGORY_MAPPINGS)) {
    if (normalizedPath === pathPattern.toLowerCase()) {
      return {
        category: categoryInfo.category,
        subcategory: categoryInfo.subcategory
      };
    }
  }
  
  // Fallback for unmapped paths
  console.log(`Warning: Unmapped folder path: ${folderPath}`);
  return {
    category: 'astrophotography', // default
    subcategory: 'uncategorized'
  };
}

// Load existing metadata
function loadExistingMetadata() {
  if (!fs.existsSync(METADATA_FILE)) {
    console.log('No existing metadata file found. Creating new one.');
    return {};
  }
  
  try {
    const content = fs.readFileSync(METADATA_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading metadata file:', error);
    return {};
  }
}

async function fixCategorySubcategory() {
  console.log('🔧 Fixing missing category and subcategory fields...');
  
  const allImages = findImages();
  const metadata = loadExistingMetadata();
  
  let updatedCount = 0;
  
  for (const image of allImages) {
    const entry = metadata[image.filename];
    
    if (entry) {
      const categoryInfo = detectCategoryFromPath(image.folder);
      let needsUpdate = false;
      
      if (!entry.category) {
        entry.category = categoryInfo.category;
        needsUpdate = true;
      }
      
      if (!entry.subcategory) {
        entry.subcategory = categoryInfo.subcategory;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        console.log(`🏷️  Fixed: ${image.filename} -> ${categoryInfo.category}/${categoryInfo.subcategory}`);
        updatedCount++;
      }
    }
  }
  
  if (updatedCount > 0) {
    // Sort metadata alphabetically
    const sortedMetadata = {};
    Object.keys(metadata).sort().forEach(key => {
      sortedMetadata[key] = metadata[key];
    });
    
    // Write back to file
    fs.writeFileSync(METADATA_FILE, JSON.stringify(sortedMetadata, null, 2));
    console.log(`✅ Fixed ${updatedCount} entries and saved to metadata.json`);
  } else {
    console.log('ℹ️  No entries needed category/subcategory fixes');
  }
}

// Run the fix
fixCategorySubcategory().catch(console.error);
