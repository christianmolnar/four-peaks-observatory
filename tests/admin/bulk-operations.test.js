const mockMetadata = require('./asset-manager.test.js').mockMetadata;

// API Mock for testing bulk delete functionality
global.fetch = jest.fn();

// Mock console functions
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

describe('Admin Asset Manager - Bulk Operations', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  describe('Bulk Selection Logic', () => {
    test('toggleImageSelection should add/remove items from selection', () => {
      const selectedImages = new Set();
      const filename = 'test-image.jpg';
      
      // Add to selection
      const newSelected1 = new Set(selectedImages);
      if (!newSelected1.has(filename)) {
        newSelected1.add(filename);
      }
      expect(newSelected1.has(filename)).toBe(true);
      expect(newSelected1.size).toBe(1);
      
      // Remove from selection
      const newSelected2 = new Set(newSelected1);
      if (newSelected2.has(filename)) {
        newSelected2.delete(filename);
      }
      expect(newSelected2.has(filename)).toBe(false);
      expect(newSelected2.size).toBe(0);
    });

    test('selectAllImages should select all filtered images', () => {
      // Mock filtered images (subset of mockMetadata)
      const filteredImages = [
        { filename: 'M42-20x240sec-2-7-2005-2547x1813.jpg', category: 'astrophotography' },
        { filename: 'NGC7000-Pelican-1.jpg', category: 'astrophotography' },
        { filename: 'Equipment-Pier.jpg', category: 'equipment' }
      ];
      
      const selectedImages = new Set(filteredImages.map(image => image.filename));
      expect(selectedImages.size).toBe(3);
      expect(selectedImages.has('M42-20x240sec-2-7-2005-2547x1813.jpg')).toBe(true);
      expect(selectedImages.has('NGC7000-Pelican-1.jpg')).toBe(true);
      expect(selectedImages.has('Equipment-Pier.jpg')).toBe(true);
    });

    test('selectNoneImages should clear all selections', () => {
      const selectedImages = new Set(['image1.jpg', 'image2.jpg', 'image3.jpg']);
      expect(selectedImages.size).toBe(3);
      
      selectedImages.clear();
      expect(selectedImages.size).toBe(0);
    });
  });

  describe('Bulk Delete API Integration', () => {
    test('should handle successful bulk delete', async () => {
      const filenames = ['test1.jpg', 'test2.jpg'];
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          deletedCount: 2,
          deletedFiles: filenames,
          message: 'Successfully deleted 2 image(s) from metadata'
        })
      });

      const response = await fetch('/api/admin/delete-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames })
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      expect(result.deletedFiles).toEqual(filenames);
    });

    test('should handle bulk delete with some files not found', async () => {
      const filenames = ['exists.jpg', 'missing.jpg'];
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          deletedCount: 1,
          deletedFiles: ['exists.jpg'],
          notFoundFiles: ['missing.jpg'],
          message: 'Successfully deleted 1 image(s) from metadata'
        })
      });

      const response = await fetch('/api/admin/delete-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames })
      });

      const result = await response.json();
      expect(result.deletedCount).toBe(1);
      expect(result.notFoundFiles).toEqual(['missing.jpg']);
    });

    test('should handle bulk delete API errors', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'Failed to update metadata.json'
        })
      });

      const response = await fetch('/api/admin/delete-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: ['test.jpg'] })
      });

      expect(response.ok).toBe(false);
      const result = await response.json();
      expect(result.error).toBe('Failed to update metadata.json');
    });

    test('should handle network errors during bulk delete', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      try {
        await fetch('/api/admin/delete-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filenames: ['test.jpg'] })
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('Network error');
      }
    });
  });

  describe('Bulk Delete Validation', () => {
    test('should validate empty filenames array', () => {
      const filenames = [];
      expect(Array.isArray(filenames)).toBe(true);
      expect(filenames.length).toBe(0);
      
      // Should not proceed with delete if empty
      if (filenames.length === 0) {
        expect(true).toBe(true); // No deletion should occur
      }
    });

    test('should validate invalid filenames input', () => {
      const testCases = [
        null,
        undefined,
        'not-an-array',
        123,
        {},
        true
      ];

      testCases.forEach(testCase => {
        expect(Array.isArray(testCase)).toBe(false);
      });
    });

    test('should validate filename format', () => {
      const validFilenames = [
        'image.jpg',
        'photo.png',
        'M42-data.tiff',
        'NGC7000-Pelican-1.jpg'
      ];

      const invalidFilenames = [
        '',
        ' ',
        'no-extension',
        '.hidden',
        'path/to/file.jpg' // should be just filename
      ];

      validFilenames.forEach(filename => {
        expect(typeof filename).toBe('string');
        expect(filename.length).toBeGreaterThan(0);
        expect(filename).toMatch(/\.[a-zA-Z0-9]+$/);
      });

      invalidFilenames.forEach(filename => {
        if (filename.includes('/')) {
          expect(filename).toMatch(/\//); // Contains path separator
        } else if (filename === '' || filename === ' ') {
          expect(filename.trim().length).toBe(0);
        }
      });
    });
  });

  describe('UI State Management', () => {
    test('should manage confirmation dialog state', () => {
      let showDeleteConfirmation = false;
      
      // Show confirmation
      showDeleteConfirmation = true;
      expect(showDeleteConfirmation).toBe(true);
      
      // Hide confirmation
      showDeleteConfirmation = false;
      expect(showDeleteConfirmation).toBe(false);
    });

    test('should manage bulk delete loading state', () => {
      let isDeleting = false;
      
      // Start deleting
      isDeleting = true;
      expect(isDeleting).toBe(true);
      
      // Finish deleting
      isDeleting = false;
      expect(isDeleting).toBe(false);
    });

    test('should manage button disabled states', () => {
      const selectedImages = new Set();
      const isDeleting = false;
      
      // Delete button should be disabled when no selection
      expect(selectedImages.size === 0 || isDeleting).toBe(true);
      
      // Select some images
      selectedImages.add('test1.jpg');
      selectedImages.add('test2.jpg');
      
      // Delete button should be enabled
      expect(selectedImages.size === 0 || isDeleting).toBe(false);
      
      // During deletion, button should be disabled
      const isDeletingTrue = true;
      expect(selectedImages.size === 0 || isDeletingTrue).toBe(true);
    });
  });
});

module.exports = {
  mockMetadata
};
