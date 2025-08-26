const fs = require('fs');
const path = require('path');

// Path to metadata.json
const metadataPath = path.join(__dirname, '..', 'src', 'data', 'metadata.json');

// Read current metadata
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

// Get list of all featured images from file system
const featuredDir = path.join(__dirname, '..', 'public', 'images', 'astrophotography', 'featured');
let featuredFiles = [];

try {
  featuredFiles = fs.readdirSync(featuredDir)
    .filter(file => file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.jpeg'))
    .map(file => file);
  console.log(`Found ${featuredFiles.length} featured images in filesystem:`, featuredFiles);
} catch (error) {
  console.error('Error reading featured directory:', error);
  process.exit(1);
}

// Track changes
let updatedCount = 0;
let alreadyFeaturedCount = 0;
let notInMetadataCount = 0;

// Update metadata for featured images
featuredFiles.forEach(filename => {
  if (metadata[filename]) {
    if (metadata[filename].subcategory !== 'featured') {
      console.log(`Updating ${filename}: ${metadata[filename].subcategory} → featured`);
      metadata[filename].subcategory = 'featured';
      updatedCount++;
    } else {
      console.log(`${filename} already has subcategory: featured`);
      alreadyFeaturedCount++;
    }
  } else {
    console.warn(`${filename} not found in metadata.json`);
    notInMetadataCount++;
  }
});

// Write updated metadata
if (updatedCount > 0) {
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  console.log(`\n✅ Updated ${updatedCount} images to have subcategory: "featured"`);
} else {
  console.log('\n✅ No updates needed - all featured images already have correct subcategory');
}

console.log(`\nSummary:`);
console.log(`- Updated: ${updatedCount}`);
console.log(`- Already featured: ${alreadyFeaturedCount}`);
console.log(`- Not in metadata: ${notInMetadataCount}`);
console.log(`- Total featured files: ${featuredFiles.length}`);
