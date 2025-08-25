// Test script to verify category detection logic

const fs = require('fs');
const path = require('path');

// Load metadata
const metadata = JSON.parse(fs.readFileSync('../src/data/metadata.json', 'utf8'));

// File location mappings (copied from the component)
const fileLocationMappings = {
  // Solar system images from /solar-system/planets/
  'hubble and me.jpg': 'planets',
  
  // Lunar images from /solar-system/lunar/
  '20 day old moon.jpg': 'lunar',
  'crescent moon.jpg': 'lunar',
  'full moon.jpg': 'lunar',
  'twilight moon - copernicus.jpg': 'lunar',
  'twilight moon - tycho region.jpg': 'lunar',
  'twilight moon.jpg': 'lunar',
  
  // Solar images from /solar-system/solar/
  'sun .jpg': 'solar',
  'sun.jpg': 'solar',
  
  // Star cluster images from /deep-sky/star-clusters/
  'm103.jpg': 'starClusters',
  'm13-1.jpg': 'starClusters',
  'm39.jpg': 'starClusters',
  'm45 - pleiades.jpg': 'starClusters',
  'm45 --1.jpg': 'starClusters',
  'm56.jpg': 'starClusters',
  'm71.jpg': 'starClusters',
  'm92.jpg': 'starClusters',
  'ngc869 and ngc884 - the double cluster.jpg': 'starClusters',
  'double cluster.jpg': 'starClusters',
  
  // Galaxy images from /deep-sky/galaxies/
  'm31-25x300sec-tight-1600x1131.jpg': 'galaxies',
  'm31-final.jpg': 'galaxies',
  'm31.jpg': 'galaxies',
  'm33 - the triangulum galaxy.jpg': 'galaxies',
  'm33-1.jpg': 'galaxies',
  'the leo trio.jpg': 'galaxies',
  
  // Wide field images from /deep-sky/wide-field/
  'ngc 7635 - m52.jpg': 'wideField',
  'orion-wide-death-valley.jpg': 'wideField',
  'sadr region.jpg': 'wideField',
  
  // Hubble palette images from /deep-sky/Hubble-Palette/
  'ngc6635-hubble-1.jpg': 'nebulas',
  'ngc7000 and ic5070-2.jpg': 'wideField',
  
  // Nebula images from /deep-sky/nebulas/
  'cocoon nebula tight.jpg': 'nebulas',
  'cocoon nebula wide.jpg': 'nebulas',
  'crescent nebula.jpg': 'nebulas',
  'heart nebula.jpg': 'nebulas',
  'heart and soul nebulas-4.jpg': 'wideField',
  'ic1396-the elephant.jpg': 'nebulas',
  'ic434.jpg': 'nebulas',
  'ic63.jpg': 'nebulas',
  'm1 - the crab nebula.jpg': 'nebulas',
  'm1.jpg': 'nebulas',
  'm13-4.jpg': 'nebulas',
  'm16.jpg': 'nebulas',
  'm27-2-1.jpg': 'nebulas',
  'm27.jpg': 'nebulas',
  'm42 the orion nebula.jpg': 'nebulas',
  'm97.jpg': 'nebulas',
  'ngc1499.jpg': 'nebulas',
  'ngc2244.jpg': 'nebulas',
  'ngc2264.jpg': 'nebulas',
  'ngc281.jpg': 'nebulas',
  'ngc7000.jpg': 'nebulas',
  'ngc7635 - the bubble nebula - tight.jpg': 'nebulas',
  'ngc7635 - the bubble nebula-wide.jpg': 'nebulas',
  'north america and the pelican.jpg': 'wideField',
  'sh2-132-the-lobsterclaw.jpg': 'nebulas',
  'the soul nebula.jpg': 'nebulas',
  "thor's helmet.jpg": 'nebulas',
  'veil nebula complex.jpg': 'wideField',
  'wizard-lr-pi.jpg': 'nebulas',
  
  // Eclipse/event images from /solar-system/events/
  '2017 total eclipse1.jpg': 'events',
  '2017 total eclipse10.jpg': 'events',
  '2017 total eclipse2.mp4': 'events',
  '2017 total eclipse8.jpg': 'events',
  '2017 total eclipse87.jpg': 'events',
  '2017 total eclipse88.jpg': 'events',
  '2017 total eclipse9.jpg': 'events',
};

// Featured images
const featuredImages = [
  'double cluster.jpg', 'm1.jpg', 'm103-1.jpg', 'm31.jpg', 'm39.jpg', 
  'm45 --1.jpg', 'm45.jpg', 'm56.jpg', 'm71.jpg', 'm92-1.jpg', 'ngc 7635 - m52.jpg'
];

// Count by category
const counts = {
  featured: 0,
  galaxies: 0,
  nebulas: 0,
  starClusters: 0,
  wideField: 0,
  solar: 0,
  lunar: 0,
  planets: 0,
  events: 0,
  equipment: 0,
  terrestrial: 0,
  yellowstone: 0,
  grandTetons: 0,
  uncategorized: 0,
  new: 0  // Add new counter
};

const unmappedAstro = [];

Object.entries(metadata).forEach(([filename, imageData]) => {
  const lowerFilename = filename.toLowerCase();
  
  // Equipment
  if (imageData.equipmentName) {
    counts.equipment++;
    return;
  }
  
  // Terrestrial
  if (imageData.name && !imageData.catalogDesignation && !imageData.objectName) {
    if (lowerFilename.includes('yellowstone') || imageData.location?.includes('Yellowstone')) {
      counts.yellowstone++;
    } else if (lowerFilename.includes('teton') || imageData.location?.includes('Teton')) {
      counts.grandTetons++;
    } else {
      counts.terrestrial++;
    }
    return;
  }
  
  // Astrophotography
  if (imageData.catalogDesignation || imageData.objectName) {
    const isFeatured = featuredImages.includes(lowerFilename);
    const mappedCategory = fileLocationMappings[lowerFilename];
    
    let category = null;
    let categoryArray = [];
    
    if (mappedCategory) {
      category = mappedCategory;
      categoryArray = isFeatured ? ['featured', mappedCategory] : [mappedCategory];
      
      if (isFeatured) {
        counts.featured++;
        counts[mappedCategory]++;
      } else {
        counts[mappedCategory]++;
      }
    } else {
      // Check if we can categorize it by metadata
      const name = (imageData.objectName || '').toLowerCase();
      const catalog = (imageData.catalogDesignation || '').toLowerCase();
      
      // Solar system object patterns
      if (name.includes('sun') || name.includes('solar')) category = 'solar';
      else if (name.includes('moon') || name.includes('lunar') || catalog.includes('moon')) category = 'lunar';
      else if (name.includes('planet') || ['mars', 'jupiter', 'saturn', 'venus'].some(p => name.includes(p))) category = 'planets';
      else if (name.includes('eclipse') || name.includes('transit')) category = 'events';
      // Deep sky object patterns
      else if (name.includes('galaxy') || catalog.match(/^(m31|m33|m81|m82|m101|m104|ngc\s?(?:2403|4258|4565|7331))/)) category = 'galaxies';
      else if (name.includes('nebula') || catalog.match(/^(m1|m8|m16|m17|m20|m27|m42|m57|m76|m97|ic\d+|ngc\s?(?:281|896|1499|2244|2264|6888|6960|6992|7000|7635))/)) category = 'nebulas';
      else if (name.includes('cluster') || catalog.match(/^(m13|m15|m22|m35|m45|m56|m71|m92|m103|ngc\s?(?:457|869|884|2362))/)) category = 'starClusters';
      else if (name.includes('complex') || name.includes('region') || catalog.includes(',') || name.includes('and ')) category = 'wideField';
      else if (catalog.match(/^m\d+/)) {
        // Messier defaults
        const messierGalaxies = ['m31', 'm33', 'm81', 'm82', 'm101', 'm104'];
        const messierClusters = ['m13', 'm15', 'm22', 'm35', 'm45', 'm56', 'm71', 'm92', 'm103'];
        
        if (messierGalaxies.includes(catalog)) category = 'galaxies';
        else if (messierClusters.includes(catalog)) category = 'starClusters';
        else category = 'nebulas';
      } else {
        category = 'nebulas'; // Default
      }
      
      if (category) {
        categoryArray = isFeatured ? ['featured', category] : [category];
        
        if (isFeatured) {
          counts.featured++;
          counts[category]++;
        } else {
          counts[category]++;
        }
      } else {
        counts.uncategorized++;
        unmappedAstro.push(filename);
      }
    }
    
    // Check if should be counted as "new" 
    const excludeFromNew = ['equipment', 'terrestrial', 'yellowstone', 'grandTetons', 'solar', 'lunar', 'planets', 'events'];
    const shouldBeCountedAsNew = !excludeFromNew.some(cat => categoryArray.includes(cat)) && 
                                 (!imageData.catalogDesignation || !imageData.objectName);
    
    if (shouldBeCountedAsNew) {
      counts.new++;
    }
    
    return;
  }
  
  counts.uncategorized++;
});

console.log('Category Counts:');
console.log('================');
Object.entries(counts).forEach(([cat, count]) => {
  console.log(`${cat}: ${count}`);
});

console.log('\nUnmapped Astrophotography Files:');
console.log('=================================');
unmappedAstro.forEach(file => console.log(file));
