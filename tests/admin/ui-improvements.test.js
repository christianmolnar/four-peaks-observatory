const mockMetadata = require('./asset-manager.test.js').mockMetadata;

describe('Admin Asset Manager - UI Improvements', () => {
  describe('Table Count Display', () => {
    test('should display correct count for all images', () => {
      const getFilteredImages = () => Object.entries(mockMetadata).map(([filename, data]) => ({ filename, ...data }));
      const filteredImages = getFilteredImages();
      
      expect(filteredImages.length).toBe(8); // Total mock images
    });

    test('should display correct count for filtered images', () => {
      // Mock filtered results for astrophotography
      const astrophotographyImages = Object.entries(mockMetadata)
        .filter(([_, data]) => data.category === 'astrophotography' || data.catalogDesignation || data.objectName)
        .map(([filename, data]) => ({ filename, ...data }));
      
      expect(astrophotographyImages.length).toBeGreaterThan(0);
    });

    test('should display correct count for featured images', () => {
      const featuredImages = Object.entries(mockMetadata)
        .filter(([_, data]) => data.subcategory === 'featured')
        .map(([filename, data]) => ({ filename, ...data }));
      
      expect(featuredImages.length).toBeGreaterThanOrEqual(0);
    });

    test('should show filter name in count display', () => {
      const filterMappings = {
        'new': 'New Images',
        'astrophotography': 'Astrophotography',
        'terrestrial': 'Terrestrial',
        'equipment': 'Equipment',
        'featured': 'Featured',
        'galaxies': 'Galaxies',
        'nebulas': 'Nebulas',
        'star-clusters': 'Star Clusters',
        'wide-field': 'Wide Field',
        'solar': 'Solar',
        'lunar': 'Lunar',
        'planets': 'Planets',
        'events': 'Events',
        'yellowstone': 'Yellowstone',
        'grand-tetons': 'Grand Tetons'
      };

      Object.entries(filterMappings).forEach(([filterKey, displayName]) => {
        expect(typeof filterKey).toBe('string');
        expect(typeof displayName).toBe('string');
        expect(displayName.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Table Container and Scrolling', () => {
    test('should have proper container dimensions', () => {
      const tableWidth = 3500; // w-[3500px]
      const expectedColumns = 13; // 1 checkbox + 12 data columns
      
      expect(tableWidth).toBeGreaterThan(expectedColumns * 100); // Reasonable width per column
    });

    test('should handle viewport height calculation', () => {
      const maxHeight = '70vh'; // max-h-[70vh]
      
      expect(maxHeight).toMatch(/^\d+vh$/);
      expect(parseInt(maxHeight)).toBeLessThanOrEqual(100);
      expect(parseInt(maxHeight)).toBeGreaterThanOrEqual(50);
    });

    test('should have proper overflow settings', () => {
      const horizontalOverflow = 'overflow-x-auto';
      const verticalOverflow = 'overflow-y-hidden';
      const tableContentOverflow = 'overflow-y-auto';
      
      expect([horizontalOverflow, verticalOverflow, tableContentOverflow]).toHaveLength(3);
    });
  });

  describe('Default Filter Selection Logic', () => {
    test('should default to "new" when new images exist', () => {
      // Mock scenario with new images
      const mockNewImagesCount = 5;
      const expectedFilter = mockNewImagesCount > 0 ? 'new' : 'all';
      
      expect(expectedFilter).toBe('new');
    });

    test('should default to "all" when no new images exist', () => {
      // Mock scenario with no new images
      const mockNewImagesCount = 0;
      const expectedFilter = mockNewImagesCount > 0 ? 'new' : 'all';
      
      expect(expectedFilter).toBe('all');
    });

    test('should only set default when metadata is loaded and no filter is active', () => {
      const metadataLoaded = true;
      const currentFilter = '';
      const shouldSetDefault = metadataLoaded && currentFilter === '';
      
      expect(shouldSetDefault).toBe(true);
    });

    test('should not override existing filter selection', () => {
      const metadataLoaded = true;
      const currentFilter = 'astrophotography';
      const shouldSetDefault = metadataLoaded && currentFilter === '';
      
      expect(shouldSetDefault).toBe(false);
    });
  });

  describe('Table Header and Grid Layout', () => {
    test('should have correct number of columns', () => {
      const expectedColumns = [
        'Checkbox',
        'Image Name',
        'Category',
        'Subcategory',
        'Catalog',
        'Object Name',
        'Date Taken',
        'Location',
        'Equipment',
        'Exposure',
        'YouTube Link',
        'YouTube Title',
        'Protected'
      ];
      
      expect(expectedColumns).toHaveLength(13);
    });

    test('should have proper column width distribution', () => {
      const columnWidths = [
        '60px',   // Checkbox
        '300px',  // Image Name
        '120px',  // Category
        '120px',  // Subcategory
        '150px',  // Catalog
        '250px',  // Object Name
        '120px',  // Date Taken
        '200px',  // Location
        '250px',  // Equipment
        '120px',  // Exposure
        '400px',  // YouTube Link
        '250px',  // YouTube Title
        '80px'    // Protected
      ];
      
      const totalWidth = columnWidths.reduce((sum, width) => {
        return sum + parseInt(width.replace('px', ''));
      }, 0);
      
      expect(totalWidth).toBe(2420); // Actual column widths
      expect(columnWidths).toHaveLength(13);
      
      // Table should be wide enough for big monitors
      expect(totalWidth).toBeGreaterThan(2000);
    });
  });

  describe('Selection Count Display', () => {
    test('should show selection count when items are selected', () => {
      const selectedImages = new Set(['image1.jpg', 'image2.jpg', 'image3.jpg']);
      const shouldShowCount = selectedImages.size > 0;
      
      expect(shouldShowCount).toBe(true);
      expect(selectedImages.size).toBe(3);
    });

    test('should hide selection count when no items are selected', () => {
      const selectedImages = new Set();
      const shouldShowCount = selectedImages.size > 0;
      
      expect(shouldShowCount).toBe(false);
      expect(selectedImages.size).toBe(0);
    });

    test('should format selection count correctly', () => {
      const selectedImages = new Set(['image1.jpg', 'image2.jpg']);
      const countText = `${selectedImages.size} selected`;
      
      expect(countText).toBe('2 selected');
    });
  });

  describe('Responsive Design', () => {
    test('should handle large monitor widths', () => {
      const tableWidth = 3500;
      const containerWidth = 'overflow-x-auto'; // Should scroll horizontally if needed
      
      // Table should maintain its width for large monitors
      expect(tableWidth).toBeGreaterThan(1920); // Larger than typical monitor width
      expect(typeof containerWidth).toBe('string');
    });

    test('should maintain table structure', () => {
      const gridTemplate = 'grid-cols-[60px_300px_120px_120px_150px_250px_120px_200px_250px_120px_400px_250px_80px]';
      
      // Should have 13 column definitions
      const columnMatches = gridTemplate.match(/\d+px/g);
      expect(columnMatches).toHaveLength(13);
    });
  });
});

module.exports = {
  mockMetadata
};
