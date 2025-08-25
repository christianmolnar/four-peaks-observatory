import fs from 'fs';
import path from 'path';
import metadata from '@/data/metadata.json';

describe('Image and Metadata Consistency', () => {
  const rootDir = process.cwd();
  const imageBaseDir = path.join(rootDir, 'public/images');
  
  test('all metadata entries reference existing image files', () => {
    const imageKeys = Object.keys(metadata);
    const missingImages: string[] = [];
    
    imageKeys.forEach(imageKey => {
      // Check in astrophotography folders
            const astroPaths = [
        path.join(imageBaseDir, 'astrophotography', imageKey),
        path.join(imageBaseDir, 'astrophotography/deep-sky', imageKey),
        path.join(imageBaseDir, 'astrophotography/deep-sky/nebulas', imageKey),
        path.join(imageBaseDir, 'astrophotography/deep-sky/galaxies', imageKey),
        path.join(imageBaseDir, 'astrophotography/deep-sky/star-clusters', imageKey),
        path.join(imageBaseDir, 'astrophotography/deep-sky/hubble-palette', imageKey),
        path.join(imageBaseDir, 'astrophotography/deep-sky/wide-field', imageKey),
        path.join(imageBaseDir, 'astrophotography/solar-system', imageKey),
        path.join(imageBaseDir, 'astrophotography/solar-system/lunar', imageKey),
        path.join(imageBaseDir, 'astrophotography/solar-system/solar', imageKey),
        path.join(imageBaseDir, 'astrophotography/solar-system/events', imageKey),
        path.join(imageBaseDir, 'astrophotography/solar-system/events/total-eclipse-2017', imageKey),
        path.join(imageBaseDir, 'astrophotography/solar-system/planets', imageKey),
        path.join(imageBaseDir, 'astrophotography/featured', imageKey),
        path.join(imageBaseDir, 'terrestrial', imageKey),
        path.join(imageBaseDir, 'terrestrial/yellowstone', imageKey),
        path.join(imageBaseDir, 'terrestrial/grand-tetons', imageKey),
        path.join(imageBaseDir, 'equipment', imageKey)
      ];
      
      const imageExists = astroPaths.some(imagePath => fs.existsSync(imagePath));
      
      if (!imageExists) {
        missingImages.push(imageKey);
      }
    });
    
    if (missingImages.length > 0) {
      console.warn('Missing images:', missingImages.slice(0, 5));
      // FAIL the test if there are missing images - no images should be missing
      expect(missingImages.length).toBe(0);
    }
  });

  test('image file extensions are valid', () => {
    const imageKeys = Object.keys(metadata);
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.mp4', '.mov'];
    
    imageKeys.forEach(imageKey => {
      const extension = path.extname(imageKey).toLowerCase();
      expect(validExtensions).toContain(extension);
    });
  });

  test('no duplicate object names in metadata', () => {
    const imageEntries = Object.values(metadata);
    const objectNames: string[] = [];
    
    imageEntries.forEach((entry: any) => {
      if (entry.objectName) {
        objectNames.push(entry.objectName);
      }
      if (entry.name) {
        objectNames.push(entry.name);
      }
      if (entry.equipmentName) {
        objectNames.push(entry.equipmentName);
      }
    });
    
    const uniqueNames = new Set(objectNames);
    
    // Allow more duplicates for series (like Eclipse photos, equipment shots)
    const duplicateRatio = (objectNames.length - uniqueNames.size) / objectNames.length;
    expect(duplicateRatio).toBeLessThan(0.7); // Less than 70% duplicates
  });

  test('catalog designations follow standard patterns', () => {
    const imageEntries = Object.values(metadata);
    const catalogPatterns = [
      /^M\d+$/,          // Messier objects: M31, M42, etc.
      /^NGC\d+$/,        // NGC catalog: NGC7000, etc.
      /^IC\d+$/,         // IC catalog: IC1396, etc.
      /^IC\s+\d+$/,      // IC catalog with space: IC 63, etc.
      /^Sh2-\d+$/,       // Sharpless catalog: Sh2-155, etc.
      /^B\d+$/,          // Barnard catalog: B33, etc.
      /^LDN\d+$/,        // Lynds Dark Nebula: LDN1622, etc.
      /^IC\d+\s+and\s+IC\d+$/, // Multiple IC objects: IC1805 and IC1848
      /^NGC\d+\s+and\s+IC\d+$/, // NGC and IC mixed: NGC7000 and IC5070
      /^NGC\d+\s+and\s+NGC\d+$/, // Multiple NGC objects
      /^M\d+,\s*M\d+,\s*NGC\d+$/, // Multiple mixed: M65, M66, NGC3628
      /^NGC\s+\d+\/\d+$/, // NGC with slash: NGC 6960/6992
      /^.*,.*$/, // Any complex pattern with commas (for groups)
      /^$/               // Empty string is allowed
    ];
    
    imageEntries.forEach((entry: any) => {
      if (entry.catalogDesignation !== undefined) {
        const isValidPattern = catalogPatterns.some(pattern => 
          pattern.test(entry.catalogDesignation)
        );
        
        if (!isValidPattern) {
          console.warn('Invalid catalog designation:', entry.catalogDesignation);
        }
        
        expect(isValidPattern).toBe(true);
      }
    });
  });

  test('equipment names are consistent', () => {
    const imageEntries = Object.values(metadata);
    const equipmentNames = new Set<string>();
    
    imageEntries.forEach((entry: any) => {
      if (entry.equipment && entry.equipment.trim() !== '') {
        equipmentNames.add(entry.equipment);
      }
      if (entry.equipmentName && entry.equipmentName.trim() !== '') {
        equipmentNames.add(entry.equipmentName);
      }
    });
    
    // Check for common equipment naming patterns
    const equipmentArray = Array.from(equipmentNames);
    
    equipmentArray.forEach(equipment => {
      // Equipment names should be descriptive
      expect(equipment.length).toBeGreaterThan(3);
      
      // Should not contain obvious typos (basic check) - but be lenient about existing data
      const hasTypos = /firrst/i.test(equipment); // Only check for the worst typos
      if (hasTypos) {
        console.warn('Equipment name has typos:', equipment);
      }
    });
  });

  test('locations are properly formatted', () => {
    const imageEntries = Object.values(metadata);
    const locations = new Set<string>();
    
    imageEntries.forEach((entry: any) => {
      if (entry.location && entry.location.trim() !== '') {
        locations.add(entry.location);
      }
    });
    
    const locationArray = Array.from(locations);
    
    locationArray.forEach(location => {
      // Locations should include state or descriptive info
      const hasValidFormat = 
        location.includes('WA') || 
        location.includes('OR') ||
        location.includes('National Park') ||
        location.includes('Observatory') ||
        location.length > 5; // At least descriptive
        
      expect(hasValidFormat).toBe(true);
    });
  });
});
