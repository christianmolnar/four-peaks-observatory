#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const exifr = require('exifr');

// Path to metadata file
const METADATA_FILE = path.join(__dirname, '..', 'src', 'data', 'metadata.json');
const IMAGE_BASE_PATH = path.join(__dirname, '..', 'public', 'images');

class LocationManager {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.metadata = {};
    this.changes = [];
  }

  async loadMetadata() {
    try {
      const data = fs.readFileSync(METADATA_FILE, 'utf8');
      this.metadata = JSON.parse(data);
      console.log(`📄 Loaded metadata for ${Object.keys(this.metadata).length} images`);
    } catch (error) {
      console.error('❌ Error loading metadata:', error.message);
      process.exit(1);
    }
  }

  async saveMetadata() {
    try {
      fs.writeFileSync(METADATA_FILE, JSON.stringify(this.metadata, null, 2));
      console.log(`✅ Saved metadata with ${this.changes.length} location updates`);
    } catch (error) {
      console.error('❌ Error saving metadata:', error.message);
    }
  }

  async getExifLocation(filename) {
    const imagePaths = [
      path.join(IMAGE_BASE_PATH, 'astrophotography', filename),
      path.join(IMAGE_BASE_PATH, 'astrophotography', 'featured', filename),
      path.join(IMAGE_BASE_PATH, 'astrophotography', 'deep-sky', 'galaxies', filename),
      path.join(IMAGE_BASE_PATH, 'astrophotography', 'deep-sky', 'nebulas', filename),
      path.join(IMAGE_BASE_PATH, 'astrophotography', 'deep-sky', 'star-clusters', filename),
      path.join(IMAGE_BASE_PATH, 'astrophotography', 'deep-sky', 'wide-field', filename),
      path.join(IMAGE_BASE_PATH, 'astrophotography', 'deep-sky', 'Hubble-Palette', filename),
      path.join(IMAGE_BASE_PATH, 'astrophotography', 'solar-system', 'solar', filename),
      path.join(IMAGE_BASE_PATH, 'astrophotography', 'solar-system', 'lunar', filename),
      path.join(IMAGE_BASE_PATH, 'astrophotography', 'solar-system', 'planets', filename),
      path.join(IMAGE_BASE_PATH, 'astrophotography', 'solar-system', 'events', 'total-eclipse-2017', filename),
      path.join(IMAGE_BASE_PATH, 'terrestrial', 'yellowstone', filename),
      path.join(IMAGE_BASE_PATH, 'terrestrial', 'grand-tetons', filename),
      path.join(IMAGE_BASE_PATH, 'equipment', filename)
    ];

    for (const imagePath of imagePaths) {
      if (fs.existsSync(imagePath)) {
        try {
          const exif = await exifr.parse(imagePath, { gps: true });
          if (exif && exif.latitude && exif.longitude) {
            return {
              coords: `${exif.latitude.toFixed(6)}, ${exif.longitude.toFixed(6)}`,
              location: await this.approximateLocation(exif.latitude, exif.longitude)
            };
          }
        } catch (error) {
          // Silently continue if EXIF reading fails
        }
        break; // Found the file, no need to check other paths
      }
    }
    return null;
  }

  async approximateLocation(lat, lon) {
    // Simple location approximation based on coordinates
    // You could enhance this with a geocoding service
    
    // Washington State rough boundaries
    if (lat >= 45.5 && lat <= 49.0 && lon >= -124.8 && lon <= -116.9) {
      if (lat >= 47.3 && lat <= 47.8 && lon >= -122.5 && lon <= -121.0) {
        return "Seattle/Tacoma Area, WA";
      }
      return "Washington State";
    }
    
    // Oregon rough boundaries  
    if (lat >= 41.9 && lat <= 46.3 && lon >= -124.6 && lon <= -116.5) {
      return "Oregon";
    }
    
    // California rough boundaries
    if (lat >= 32.5 && lat <= 42.0 && lon >= -124.4 && lon <= -114.1) {
      return "California";
    }
    
    // National Parks (approximate)
    if (lat >= 44.1 && lat <= 45.1 && lon >= -111.2 && lon <= -110.0) {
      return "Yellowstone National Park";
    }
    
    if (lat >= 43.6 && lat <= 44.0 && lon >= -111.0 && lon <= -110.6) {
      return "Grand Teton National Park";
    }
    
    return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  }

  async askQuestion(question) {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  async manageFileLocation(filename, entry) {
    console.log(`\n📸 Managing location for: ${filename}`);
    console.log(`   Current location: ${entry.location || '(not set)'}`);
    
    // Get EXIF location if available
    const exifData = await this.getExifLocation(filename);
    if (exifData) {
      console.log(`   📍 EXIF GPS found: ${exifData.coords}`);
      console.log(`   🗺️  Approximate location: ${exifData.location}`);
    } else {
      console.log(`   📍 No EXIF GPS data found`);
    }

    console.log('\nOptions:');
    console.log('  1. Keep current location');
    if (exifData) {
      console.log('  2. Use EXIF approximate location');
      console.log('  3. Enter custom location');
    } else {
      console.log('  2. Enter custom location');
    }
    console.log('  s. Skip this file');
    console.log('  q. Quit and save changes');

    const maxOption = exifData ? '3' : '2';
    const choice = await this.askQuestion(`\nChoice (1-${maxOption}, s, q): `);

    switch (choice.toLowerCase()) {
      case '1':
        console.log(`✅ Keeping current location: ${entry.location || '(not set)'}`);
        break;
        
      case '2':
        if (exifData) {
          entry.location = exifData.location;
          this.changes.push(`${filename}: ${exifData.location}`);
          console.log(`✅ Set location to: ${exifData.location}`);
        } else {
          const custom = await this.askQuestion('Enter location: ');
          if (custom) {
            entry.location = custom;
            this.changes.push(`${filename}: ${custom}`);
            console.log(`✅ Set location to: ${custom}`);
          }
        }
        break;
        
      case '3':
        if (exifData) {
          const custom = await this.askQuestion('Enter location: ');
          if (custom) {
            entry.location = custom;
            this.changes.push(`${filename}: ${custom}`);
            console.log(`✅ Set location to: ${custom}`);
          }
        }
        break;
        
      case 's':
        console.log('⏭️  Skipped');
        break;
        
      case 'q':
        return 'quit';
        
      default:
        console.log('❌ Invalid choice, skipping file');
    }
    
    return 'continue';
  }

  async reviewAllLocations() {
    console.log('\n🔍 Reviewing all image locations...\n');
    
    const filenames = Object.keys(this.metadata);
    let current = 0;
    
    for (const filename of filenames) {
      current++;
      console.log(`\n[${current}/${filenames.length}]`);
      
      const result = await this.manageFileLocation(filename, this.metadata[filename]);
      if (result === 'quit') {
        break;
      }
    }
  }

  async reviewEmptyLocations() {
    console.log('\n🔍 Reviewing images with missing locations...\n');
    
    const emptyFiles = Object.entries(this.metadata)
      .filter(([filename, entry]) => !entry.location || entry.location.trim() === '')
      .map(([filename]) => filename);
    
    if (emptyFiles.length === 0) {
      console.log('✅ All images have locations set!');
      return;
    }
    
    console.log(`Found ${emptyFiles.length} images without locations`);
    
    let current = 0;
    for (const filename of emptyFiles) {
      current++;
      console.log(`\n[${current}/${emptyFiles.length}]`);
      
      const result = await this.manageFileLocation(filename, this.metadata[filename]);
      if (result === 'quit') {
        break;
      }
    }
  }

  async showMainMenu() {
    console.log('\n📍 Location Management Tool');
    console.log('==========================');
    console.log('1. Review all image locations');
    console.log('2. Review only images missing locations');
    console.log('3. Exit');
    
    const choice = await this.askQuestion('\nSelect option (1-3): ');
    
    switch (choice) {
      case '1':
        await this.reviewAllLocations();
        break;
      case '2':
        await this.reviewEmptyLocations();
        break;
      case '3':
        console.log('👋 Goodbye!');
        this.rl.close();
        return false;
      default:
        console.log('❌ Invalid choice');
    }
    
    return true;
  }

  async run() {
    console.log('🚀 Starting Location Manager...');
    await this.loadMetadata();
    
    let continuing = true;
    while (continuing) {
      continuing = await this.showMainMenu();
    }
    
    if (this.changes.length > 0) {
      console.log(`\n📝 Summary of changes:`);
      this.changes.forEach(change => console.log(`   ${change}`));
      
      const save = await this.askQuestion('\nSave changes? (y/n): ');
      if (save.toLowerCase() === 'y') {
        await this.saveMetadata();
      } else {
        console.log('❌ Changes discarded');
      }
    } else {
      console.log('\n✨ No changes made');
    }
    
    this.rl.close();
  }
}

// Export for use by update-metadata.js
async function promptForLocation(filename, imagePath) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askQuestion = (question) => {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  };

  console.log(`\n📸 New image found: ${filename}`);
  
  // Try to get EXIF location
  let exifData = null;
  try {
    const exif = await exifr.parse(imagePath, { gps: true });
    if (exif && exif.latitude && exif.longitude) {
      const manager = new LocationManager();
      const location = await manager.approximateLocation(exif.latitude, exif.longitude);
      exifData = {
        coords: `${exif.latitude.toFixed(6)}, ${exif.longitude.toFixed(6)}`,
        location: location
      };
    }
  } catch (error) {
    // No EXIF data available
  }

  if (exifData) {
    console.log(`   📍 EXIF GPS found: ${exifData.coords}`);
    console.log(`   🗺️  Approximate location: ${exifData.location}`);
    console.log('\nOptions:');
    console.log('  1. Use EXIF approximate location');
    console.log('  2. Enter custom location');
    console.log('  3. Leave blank (set later)');
    
    const choice = await askQuestion('Choice (1-3): ');
    let result = '';
    
    switch (choice) {
      case '1':
        result = exifData.location;
        break;
      case '2':
        result = await askQuestion('Enter location: ');
        break;
      case '3':
        result = '';
        break;
      default:
        result = '';
    }
    
    rl.close();
    return result;
  } else {
    console.log(`   📍 No EXIF GPS data found`);
    console.log('\nOptions:');
    console.log('  1. Enter location now');
    console.log('  2. Leave blank (set later)');
    
    const choice = await askQuestion('Choice (1-2): ');
    let result = '';
    
    if (choice === '1') {
      result = await askQuestion('Enter location: ');
    }
    
    rl.close();
    return result;
  }
}

// Run directly if called as script
if (require.main === module) {
  const manager = new LocationManager();
  manager.run().catch(console.error);
}

module.exports = { LocationManager, promptForLocation };
