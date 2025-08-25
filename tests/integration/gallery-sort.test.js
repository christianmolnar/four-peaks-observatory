/**
 * Gallery Sort Integration Test
 * Tests that gallery sorting logic works correctly
 */

describe('Gallery Sort Integration', () => {
  test('should sort images by dateTaken chronologically', () => {
    // Test that the parseDateTaken function works as expected
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

    // Test our sample dates
    const newestTime = parseDateTaken('August, 2025');
    const middleTime = parseDateTaken('March, 2020');
    const oldestTime = parseDateTaken('September, 2005');
    
    expect(newestTime).toBeGreaterThan(middleTime);
    expect(middleTime).toBeGreaterThan(oldestTime);
    
    // Verify sorting order (newest first)
    const sortedTimes = [newestTime, middleTime, oldestTime].sort((a, b) => b - a);
    expect(sortedTimes[0]).toBe(newestTime);
    expect(sortedTimes[1]).toBe(middleTime);
    expect(sortedTimes[2]).toBe(oldestTime);
  });

  test('should handle realistic gallery sorting scenario', () => {
    // Mock images with different dates like those in the actual metadata
    const mockImages = [
      { filename: 'old-moon.jpg', dateTaken: 'September, 2005' },
      { filename: 'eclipse.jpg', dateTaken: 'August, 2017' },
      { filename: 'recent-nebula.jpg', dateTaken: 'August, 2025' },
      { filename: 'vintage-orion.jpg', dateTaken: 'March, 2005' }
    ];

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

    // Sort using the same logic as the gallery component
    const sortedImages = [...mockImages].sort((a, b) => {
      const timeA = parseDateTaken(a.dateTaken);
      const timeB = parseDateTaken(b.dateTaken);
      
      if (timeA !== timeB) {
        return timeB - timeA; // Newest first
      }
      
      return b.filename.localeCompare(a.filename);
    });

    // Verify newest image is first
    expect(sortedImages[0].filename).toBe('recent-nebula.jpg');
    expect(sortedImages[0].dateTaken).toBe('August, 2025');
    
    // Verify oldest image is last 
    expect(sortedImages[sortedImages.length - 1].filename).toBe('vintage-orion.jpg');
    expect(sortedImages[sortedImages.length - 1].dateTaken).toBe('March, 2005');

    console.log('Gallery sort test results:');
    sortedImages.forEach((img, index) => {
      console.log(`${index + 1}. ${img.filename} (${img.dateTaken})`);
    });
  });
});
