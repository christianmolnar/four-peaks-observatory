const fs = require('fs');
const path = require('path');

// Path to metadata.json
const metadataPath = path.join(__dirname, '..', 'src', 'data', 'metadata.json');

// Read current metadata
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

// Function to get all image files in a directory recursively
function getImageFiles(dir) {
  const files = [];
  try {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) {
        files.push(...getImageFiles(itemPath));
      } else if (item.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        files.push(itemPath);
      }
    });
  } catch (error) {
    console.warn(`Warning: Could not read directory ${dir}:`, error.message);
  }
  return files;
}

// Function to determine subcategory from file path
function getSubcategoryFromPath(filePath) {
  const relativePath = filePath.replace(path.join(__dirname, '..', 'public', 'images') + path.sep, '');
  
  // Featured images (highest priority)
  if (relativePath.includes('featured')) {
    return 'featured';
  }
  
  // Deep sky categories
  if (relativePath.includes('deep-sky/galaxies') || relativePath.includes('/galaxies/')) {
    return 'deep-sky/galaxies';
  }
  if (relativePath.includes('deep-sky/nebulas') || relativePath.includes('/nebulas/')) {
    return 'deep-sky/nebulas';
  }
  if (relativePath.includes('deep-sky/star-clusters') || relativePath.includes('/star-clusters/')) {
    return 'deep-sky/star-clusters';
  }
  if (relativePath.includes('deep-sky/wide-field')) {
    return 'deep-sky/wide-field';
  }
  if (relativePath.includes('Hubble-Palette')) {
    return 'deep-sky/hubble-palette';
  }
  
  // Solar system categories
  if (relativePath.includes('solar-system/solar') || relativePath.includes('/solar/')) {
    return 'solar-system/solar';
  }
  if (relativePath.includes('solar-system/lunar') || relativePath.includes('/lunar/')) {
    return 'solar-system/lunar';
  }
  if (relativePath.includes('solar-system/planets') || relativePath.includes('/planets/')) {
    return 'solar-system/planets';
  }
  if (relativePath.includes('solar-system/events') || relativePath.includes('/events/')) {
    return 'solar-eclipses';
  }
  
  // Terrestrial categories
  if (relativePath.includes('terrestrial/yellowstone')) {
    return 'yellowstone';
  }
  if (relativePath.includes('terrestrial/grand-tetons')) {
    return 'grand-tetons';
  }
  
  // Equipment
  if (relativePath.includes('equipment')) {
    return 'equipment';
  }
  
  return null; // Unknown/uncategorized
}

// Function to determine category from file path
function getCategoryFromPath(filePath) {
  const relativePath = filePath.replace(path.join(__dirname, '..', 'public', 'images') + path.sep, '');
  
  if (relativePath.includes('astrophotography')) {
    return 'astrophotography';
  }
  if (relativePath.includes('terrestrial')) {
    return 'terrestrial';
  }
  if (relativePath.includes('equipment')) {
    return 'equipment';
  }
  
  return null;
}

// Get all image files
console.log('🔍 Scanning file system for images...');
const imageFiles = getImageFiles(path.join(__dirname, '..', 'public', 'images'));
console.log(`Found ${imageFiles.length} image files`);

// Group by directory for analysis
const directoryStats = {};
const updates = [];

imageFiles.forEach(filePath => {
  const filename = path.basename(filePath);
  const expectedCategory = getCategoryFromPath(filePath);
  const expectedSubcategory = getSubcategoryFromPath(filePath);
  
  if (!metadata[filename]) {
    console.warn(`⚠️  ${filename} not found in metadata.json`);
    return;
  }
  
  const currentCategory = metadata[filename].category;
  const currentSubcategory = metadata[filename].subcategory;
  
  // Track directory stats
  const dir = path.dirname(filePath.replace(path.join(__dirname, '..', 'public', 'images') + path.sep, ''));
  if (!directoryStats[dir]) {
    directoryStats[dir] = { total: 0, correct: 0, needsUpdate: 0 };
  }
  directoryStats[dir].total++;
  
  let needsUpdate = false;
  const changes = {};
  
  // Check category
  if (expectedCategory && currentCategory !== expectedCategory) {
    changes.category = { from: currentCategory, to: expectedCategory };
    needsUpdate = true;
  }
  
  // Check subcategory
  if (expectedSubcategory && currentSubcategory !== expectedSubcategory) {
    changes.subcategory = { from: currentSubcategory, to: expectedSubcategory };
    needsUpdate = true;
  }
  
  if (needsUpdate) {
    updates.push({ filename, filePath, changes });
    directoryStats[dir].needsUpdate++;
  } else {
    directoryStats[dir].correct++;
  }
});

// Display statistics
console.log('\n📊 Directory Analysis:');
Object.keys(directoryStats).sort().forEach(dir => {
  const stats = directoryStats[dir];
  const accuracy = ((stats.correct / stats.total) * 100).toFixed(1);
  console.log(`${dir}: ${stats.correct}/${stats.total} correct (${accuracy}%) - ${stats.needsUpdate} need updates`);
});

// Display proposed updates
if (updates.length > 0) {
  console.log(`\n🔧 Proposed Updates (${updates.length} files):`);
  updates.slice(0, 10).forEach(update => {
    console.log(`\n${update.filename}:`);
    Object.keys(update.changes).forEach(field => {
      const change = update.changes[field];
      console.log(`  ${field}: "${change.from}" → "${change.to}"`);
    });
  });
  
  if (updates.length > 10) {
    console.log(`\n... and ${updates.length - 10} more updates`);
  }
  
  // Prompt for confirmation
  console.log(`\n❓ Apply these ${updates.length} updates? (y/N)`);
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('', (answer) => {
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      // Apply updates
      updates.forEach(update => {
        Object.keys(update.changes).forEach(field => {
          metadata[update.filename][field] = update.changes[field].to;
        });
      });
      
      // Write updated metadata
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
      console.log(`\n✅ Applied ${updates.length} updates to metadata.json`);
    } else {
      console.log('\n❌ Updates cancelled');
    }
    rl.close();
  });
} else {
  console.log('\n✅ All images have correct category/subcategory assignments!');
}
