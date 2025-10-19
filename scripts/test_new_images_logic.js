const fs = require('fs');

// Load metadata
const metadata = JSON.parse(fs.readFileSync('./src/data/metadata.json', 'utf8'));

// Test helper functions
const safeGet = (obj, key, defaultValue = "") => {
  return obj && typeof obj === "object" && key in obj ? obj[key] : defaultValue;
};

const isSolarSystemImage = (text) => {
  if (!text || typeof text !== 'string') return false;
  const objectName = text.toLowerCase();
  return objectName.includes('moon') ||
         objectName.includes('lunar') ||
         objectName.includes('sun') ||
         objectName.includes('solar') ||
         objectName.includes('venus') ||
         objectName.includes('mars') ||
         objectName.includes('jupiter') ||
         objectName.includes('saturn') ||
         objectName.includes('uranus') ||
         objectName.includes('neptune') ||
         objectName.includes('mercury') ||
         objectName.includes('planet');
};

// Updated getNewImagesCount logic
const getNewImagesCount = () => {
  return Object.entries(metadata).filter(([filename, data]) => {
    const isAstrophysicsCandidate = !safeGet(data, 'name') && !safeGet(data, 'equipmentName');
    if (!isAstrophysicsCandidate) return false;
    
    // Exclude protected images from "new" count
    const isProtected = safeGet(data, 'protected') === true;
    if (isProtected) return false;
    
    const objectName = safeGet(data, 'objectName') || '';
    const catalogDesignation = safeGet(data, 'catalogDesignation') || '';
    const category = safeGet(data, 'category') || '';
    const subcategory = safeGet(data, 'subcategory') || '';
    
    // Check if it's a solar system object using improved detection
    const isSolarSystemObject = isSolarSystemImage(filename) || 
                                isSolarSystemImage(objectName) ||
                                (category === 'astrophotography' && (
                                  subcategory.includes('solar') || 
                                  subcategory.includes('lunar') || 
                                  subcategory.includes('planets')
                                ));
    
    // Exclude solar system objects from "new" count
    if (isSolarSystemObject) return false;
    
    // For deep sky and wide field objects, they need both catalogDesignation AND objectName
    return (!catalogDesignation || !objectName);
  });
};

console.log('=== NEW IMAGES LOGIC TEST ===');

const newImages = getNewImagesCount();
console.log(`\nTotal "New Images" count: ${newImages.length}`);

if (newImages.length > 0) {
  console.log('\nImages considered "new" (missing data):');
  newImages.forEach(([filename, data]) => {
    const objectName = safeGet(data, 'objectName') || '';
    const catalogDesignation = safeGet(data, 'catalogDesignation') || '';
    const category = safeGet(data, 'category') || '';
    const subcategory = safeGet(data, 'subcategory') || '';
    const isProtected = safeGet(data, 'protected') === true;
    
    console.log(`  - ${filename}`);
    console.log(`    Category: ${category}/${subcategory}`);
    console.log(`    Object: "${objectName}" | Catalog: "${catalogDesignation}"`);
    console.log(`    Protected: ${isProtected}`);
    console.log('');
  });
}

// Test for excluded images
console.log('\n=== EXCLUDED IMAGES ===');

const protectedImages = Object.entries(metadata).filter(([filename, data]) => {
  const isAstrophysicsCandidate = !safeGet(data, 'name') && !safeGet(data, 'equipmentName');
  const isProtected = safeGet(data, 'protected') === true;
  return isAstrophysicsCandidate && isProtected;
});

console.log(`\nProtected astrophotography images (excluded): ${protectedImages.length}`);
if (protectedImages.length > 0) {
  protectedImages.slice(0, 5).forEach(([filename, data]) => {
    console.log(`  - ${filename} (${safeGet(data, 'objectName')})`);
  });
  if (protectedImages.length > 5) {
    console.log(`  ... and ${protectedImages.length - 5} more`);
  }
}

const solarSystemImages = Object.entries(metadata).filter(([filename, data]) => {
  const isAstrophysicsCandidate = !safeGet(data, 'name') && !safeGet(data, 'equipmentName');
  const objectName = safeGet(data, 'objectName') || '';
  const category = safeGet(data, 'category') || '';
  const subcategory = safeGet(data, 'subcategory') || '';
  
  const isSolarSystemObject = isSolarSystemImage(filename) || 
                              isSolarSystemImage(objectName) ||
                              (category === 'astrophotography' && (
                                subcategory.includes('solar') || 
                                subcategory.includes('lunar') || 
                                subcategory.includes('planets')
                              ));
  
  return isAstrophysicsCandidate && isSolarSystemObject;
});

console.log(`\nSolar system images (excluded): ${solarSystemImages.length}`);
if (solarSystemImages.length > 0) {
  solarSystemImages.slice(0, 5).forEach(([filename, data]) => {
    const subcategory = safeGet(data, 'subcategory') || '';
    console.log(`  - ${filename} (${subcategory})`);
  });
  if (solarSystemImages.length > 5) {
    console.log(`  ... and ${solarSystemImages.length - 5} more`);
  }
}

console.log('\n=== SUMMARY ===');
console.log(`Total entries in metadata: ${Object.keys(metadata).length}`);
console.log(`Images marked as "new": ${newImages.length}`);
console.log(`Protected images excluded: ${protectedImages.length}`);
console.log(`Solar system images excluded: ${solarSystemImages.length}`);
