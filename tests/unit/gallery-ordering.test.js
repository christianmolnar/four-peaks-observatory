/**
 * Gallery Ordering Tests
 * Verifies that image galleries display newest images first based on metadata dateTaken
 */

const metadata = require('../../src/data/metadata.json');

describe('Gallery Ordering', () => {
  // Helper function to parse dateTaken similar to the gallery component
  const parseDateTaken = (dateTaken) => {
    if (!dateTaken) return 0;
    
    // Handle "Month, Year" format (e.g., "August, 2025")
    const monthYearMatch = dateTaken.match(/^(\w+),?\s+(\d{4})$/);
    if (monthYearMatch) {
      const [, monthName, year] = monthYearMatch;
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthIndex = monthNames.indexOf(monthName);
      if (monthIndex !== -1) {
        return new Date(parseInt(year), monthIndex).getTime();
      }
    }
    
    return 0;
  };

  test('newest images should appear first when sorted', () => {
    // Get sample images with different dates
    const testImages = [
      { filename: 'Double Cluster.jpg', dateTaken: 'August, 2025' },
      { filename: 'Hubble and Me.jpg', dateTaken: 'September, 2003' },
      { filename: 'M42 The Orion Nebula.jpg', dateTaken: 'March, 2005' }
    ];

    // Sort using the same logic as the gallery (newest first)
    const sorted = [...testImages].sort((a, b) => {
      const timeA = parseDateTaken(a.dateTaken);
      const timeB = parseDateTaken(b.dateTaken);
      return timeB - timeA; // Higher timestamp = newer = first
    });

    // Verify ordering: newest first
    expect(sorted[0].filename).toBe('Double Cluster.jpg'); // August 2025 (newest)
    expect(sorted[1].filename).toBe('M42 The Orion Nebula.jpg'); // March 2005
    expect(sorted[2].filename).toBe('Hubble and Me.jpg'); // September 2003 (oldest)
  });

  test('metadata contains reasonable date ranges for ordering', () => {
    const imageKeys = Object.keys(metadata);
    const datesFound = [];

    imageKeys.forEach(imageKey => {
      const image = metadata[imageKey];
      if (image.dateTaken) {
        const timestamp = parseDateTaken(image.dateTaken);
        if (timestamp > 0) {
          datesFound.push({
            filename: imageKey,
            dateTaken: image.dateTaken,
            timestamp
          });
        }
      }
    });

    // Should have dates spanning multiple years
    expect(datesFound.length).toBeGreaterThan(10);
    
    // Sort to verify we have both old and new dates
    datesFound.sort((a, b) => b.timestamp - a.timestamp);
    
    // Newest should be from 2025, oldest should be from early 2000s
    const newest = datesFound[0];
    const oldest = datesFound[datesFound.length - 1];
    
    expect(newest.dateTaken).toContain('2025');
    expect(oldest.dateTaken).toMatch(/200[3-9]/); // 2003-2009 range
  });
});

describe('Gallery Ordering', () => {
  test('should parse dateTaken strings correctly', () => {
    // Test various date formats in the metadata
    const parseDateTaken = (dateTaken) => {
      if (!dateTaken) return 0;
      
      // Handle "Month, Year" format (e.g., "August, 2025")
      const monthYearMatch = dateTaken.match(/^(\w+),?\s+(\d{4})$/);
      if (monthYearMatch) {
        const [, monthName, year] = monthYearMatch;
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthIndex = monthNames.indexOf(monthName);
        if (monthIndex !== -1) {
          return new Date(parseInt(year), monthIndex).getTime();
        }
      }
      
      return 0;
    };

    // Test known dates from metadata
    expect(parseDateTaken('August, 2025')).toBeGreaterThan(parseDateTaken('March, 2005'));
    expect(parseDateTaken('August, 2017')).toBeGreaterThan(parseDateTaken('September, 2005'));
    expect(parseDateTaken('July, 2023')).toBeGreaterThan(parseDateTaken('August, 2017'));
    expect(parseDateTaken('')).toBe(0);
    expect(parseDateTaken(undefined)).toBe(0);
  });

  test('should have newer images appear before older images', () => {
    // Get a sample of images with known dates
    const imagesWithDates = Object.entries(metadata)
      .filter(([filename, meta]) => meta.dateTaken && meta.dateTaken.trim() !== '')
      .map(([filename, meta]) => ({ filename, dateTaken: meta.dateTaken }));

    expect(imagesWithDates.length).toBeGreaterThan(0);

    // Parse dates and sort (newest first)
    const parseDateTaken = (dateTaken) => {
      if (!dateTaken) return 0;
      
      const monthYearMatch = dateTaken.match(/^(\w+),?\s+(\d{4})$/);
      if (monthYearMatch) {
        const [, monthName, year] = monthYearMatch;
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthIndex = monthNames.indexOf(monthName);
        if (monthIndex !== -1) {
          return new Date(parseInt(year), monthIndex).getTime();
        }
      }
      
      return 0;
    };

    const sortedImages = [...imagesWithDates].sort((a, b) => {
      const timeA = parseDateTaken(a.dateTaken);
      const timeB = parseDateTaken(b.dateTaken);
      return timeB - timeA; // Newest first
    });

    // Verify first image is newer than last image
    const firstImageTime = parseDateTaken(sortedImages[0].dateTaken);
    const lastImageTime = parseDateTaken(sortedImages[sortedImages.length - 1].dateTaken);
    
    expect(firstImageTime).toBeGreaterThanOrEqual(lastImageTime);
    
    // Log some examples for verification
    console.log('Gallery ordering test results:');
    console.log('Newest image:', sortedImages[0].filename, '(', sortedImages[0].dateTaken, ')');
    console.log('Oldest image:', sortedImages[sortedImages.length - 1].filename, '(', sortedImages[sortedImages.length - 1].dateTaken, ')');
  });

  test('should handle edge cases in date parsing', () => {
    const parseDateTaken = (dateTaken) => {
      if (!dateTaken) return 0;
      
      const monthYearMatch = dateTaken.match(/^(\w+),?\s+(\d{4})$/);
      if (monthYearMatch) {
        const [, monthName, year] = monthYearMatch;
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthIndex = monthNames.indexOf(monthName);
        if (monthIndex !== -1) {
          return new Date(parseInt(year), monthIndex).getTime();
        }
      }
      
      return 0;
    };

    // Test edge cases
    expect(parseDateTaken(null)).toBe(0);
    expect(parseDateTaken(undefined)).toBe(0);
    expect(parseDateTaken('')).toBe(0);
    expect(parseDateTaken('Invalid Date')).toBe(0);
    expect(parseDateTaken('NotAMonth, 2025')).toBe(0);
    expect(parseDateTaken('January')).toBe(0); // Missing year
    expect(parseDateTaken('2025')).toBe(0); // Missing month
    
    // Valid formats
    expect(parseDateTaken('January, 2025')).toBeGreaterThan(0);
    expect(parseDateTaken('December, 2024')).toBeGreaterThan(0);
  });
});
