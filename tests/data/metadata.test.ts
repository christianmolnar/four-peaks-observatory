import fs from 'fs';
import path from 'path';
import metadata from '@/data/metadata.json';

// Type for metadata entries
type MetadataEntry = {
  // Astronomical objects
  objectName?: string;
  catalogDesignation?: string;
  location?: string;
  equipment?: string;
  exposure?: string;
  
  // Terrestrial photos
  name?: string;
  
  // Equipment photos
  equipmentName?: string;
  equipmentInfo?: string;
  
  // Common fields
  protected: boolean;
  youtubeLink?: string;
  youtubeTitle?: string;
  dateTaken?: string;
};

describe('Image Metadata', () => {
  test('metadata file exists and is valid JSON', () => {
    expect(metadata).toBeDefined();
    expect(typeof metadata).toBe('object');
  });

  test('all images have required fields', () => {
    const imageKeys = Object.keys(metadata);
    expect(imageKeys.length).toBeGreaterThan(0);

    imageKeys.forEach(imageKey => {
      const image = metadata[imageKey as keyof typeof metadata] as MetadataEntry;
      
      // All entries must have protected field
      expect(image).toHaveProperty('protected');
      expect(typeof image.protected).toBe('boolean');
      
      // Must have at least one type of name
      const hasName = image.objectName || image.name || image.equipmentName;
      expect(hasName).toBeTruthy();
      
      // If it has objectName, it should be non-empty string
      if (image.objectName) {
        expect(typeof image.objectName).toBe('string');
        expect(image.objectName.length).toBeGreaterThan(0);
      }
      
      // If it has name, it should be non-empty string
      if (image.name) {
        expect(typeof image.name).toBe('string');
        expect(image.name.length).toBeGreaterThan(0);
      }
      
      // If it has equipmentName, it should be non-empty string
      if (image.equipmentName) {
        expect(typeof image.equipmentName).toBe('string');
        expect(image.equipmentName.length).toBeGreaterThan(0);
      }
    });
  });

  test('date validation - no nonsense dates', () => {
    const imageKeys = Object.keys(metadata);
    const currentYear = new Date().getFullYear();
    
    imageKeys.forEach(imageKey => {
      const image = metadata[imageKey as keyof typeof metadata] as MetadataEntry;
      
      if (image.dateTaken) {
        // Check for common nonsense patterns
        expect(image.dateTaken).not.toContain('1984');
        expect(image.dateTaken).not.toContain('1979');
        expect(image.dateTaken).not.toMatch(/19[0-8]\d/); // 1900-1989
        expect(image.dateTaken).not.toMatch(/199[0-4]/); // 1990-1994
        
        // Should contain reasonable years only
        const yearMatch = image.dateTaken.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          const year = parseInt(yearMatch[0]);
          expect(year).toBeGreaterThanOrEqual(1995);
          expect(year).toBeLessThanOrEqual(currentYear + 1);
        }
      }
    });
  });

  test('astronomical objects have catalog designations when appropriate', () => {
    const imageKeys = Object.keys(metadata);
    
    imageKeys.forEach(imageKey => {
      const image = metadata[imageKey as keyof typeof metadata] as MetadataEntry;
      
      // If it's clearly an astronomical object, it should have a catalog designation
      const astroPatterns = [
        /nebula/i, /galaxy/i, /cluster/i, /supernova/i,
        /^M\d+/i, /^NGC/i, /^IC/i, /^Sh/i
      ];
      
      const isAstroObject = astroPatterns.some(pattern => 
        (image.objectName && pattern.test(image.objectName)) || pattern.test(imageKey)
      );
      
      if (isAstroObject) {
        // Should have catalog designation (can be empty for some wide-field shots)
        expect(image).toHaveProperty('catalogDesignation');
        expect(typeof image.catalogDesignation).toBe('string');
      }
    });
  });

  test('eclipse images have correct date format', () => {
    const imageKeys = Object.keys(metadata);
    
    imageKeys.forEach(imageKey => {
      const image = metadata[imageKey as keyof typeof metadata] as MetadataEntry;
      
      // Only validate dates for non-protected entries
      if (image.protected === false && 
          (imageKey.toLowerCase().includes('eclipse') || 
           (image.objectName && image.objectName.toLowerCase().includes('eclipse')))) {
        
        if (image.dateTaken) {
          // Eclipse photos should have reasonable dates - FAIL if future dates found
          const isFutureDate = image.dateTaken.includes('2025');
          if (isFutureDate) {
            console.error('Eclipse image has future date:', imageKey, image.dateTaken);
            expect(isFutureDate).toBe(false); // FAIL the test
          }
          expect(image.dateTaken).not.toContain('1984'); // Not nonsense
          
          // 2017 total eclipse MUST be August 2017 - FAIL if wrong
          if (imageKey.includes('2017')) {
            const hasCorrectDate = image.dateTaken.match(/August.*2017|2017.*August/i);
            if (!hasCorrectDate) {
              console.error('2017 Eclipse image has incorrect date:', imageKey, image.dateTaken);
              expect(hasCorrectDate).toBeTruthy(); // FAIL the test
            }
          }
        }
      }
    });
  });

  test('terrestrial images have reasonable locations', () => {
    const imageKeys = Object.keys(metadata);
    
    imageKeys.forEach(imageKey => {
      const image = metadata[imageKey as keyof typeof metadata] as MetadataEntry;
      
      // Check for terrestrial photos (those with 'name' field or location-based keys)
      if (image.name || image.location) {
        const locationField = image.location || '';
        
        if (locationField) {
          // Should include state or country
          const hasValidLocation = 
            locationField.includes('WA') ||
            locationField.includes('OR') ||
            locationField.includes('Yellowstone') ||
            locationField.includes('Grand Tetons') ||
            locationField.includes('Portland') ||
            locationField.includes('Maple Valley');
            
          if (!hasValidLocation) {
            // At minimum should have some geographic identifier
            expect(locationField.length).toBeGreaterThan(2);
          }
        }
      }
    });
  });

  test('YouTube links are valid when present', () => {
    const imageKeys = Object.keys(metadata);
    
    imageKeys.forEach(imageKey => {
      const image = metadata[imageKey as keyof typeof metadata] as MetadataEntry;
      
      if (image.youtubeLink && image.youtubeLink.trim() !== '') {
        expect(image.youtubeLink).toMatch(/youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\//);
        
        // If there's a YouTube link, there should be a title
        expect(image.youtubeTitle).toBeTruthy();
        expect(image.youtubeTitle!.length).toBeGreaterThan(0);
      }
    });
  });
});
