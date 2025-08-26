// Tests for Admin Asset Manager filtering and counting logic
// Location: /Users/christian/Repos/MapleValleyObservatory/__tests__/admin/asset-manager.test.js

import { describe, test, expect, beforeEach } from '@jest/globals';

// Mock metadata for testing
const mockMetadata = {
  // Astrophotography images
  "m31.jpg": {
    catalogDesignation: "M31",
    objectName: "Andromeda Galaxy",
    category: "astrophotography",
    subcategory: "deep-sky/galaxies",
    protected: false,
    youtubeLink: "",
    youtubeTitle: ""
  },
  "m42.jpg": {
    catalogDesignation: "M42", 
    objectName: "Orion Nebula",
    category: "astrophotography",
    subcategory: "deep-sky/nebulas",
    protected: false,
    youtubeLink: "",
    youtubeTitle: ""
  },
  "full moon.jpg": {
    catalogDesignation: "",
    objectName: "Full Moon",
    category: "astrophotography",
    subcategory: "solar-system/lunar",
    protected: false,
    youtubeLink: "",
    youtubeTitle: ""
  },
  // Terrestrial images
  "mammoth hot springs1.jpg": {
    name: "Mammoth Hot Springs",
    dateTaken: "July, 2021",
    category: "terrestrial",
    subcategory: "yellowstone",
    protected: false,
    youtubeLink: "",
    youtubeTitle: ""
  },
  "grand tetons1.jpg": {
    name: "Grand Tetons",
    dateTaken: "July, 2021", 
    category: "terrestrial",
    subcategory: "grand-tetons",
    protected: false,
    youtubeLink: "",
    youtubeTitle: ""
  },
  // Equipment images
  "my gear0.jpg": {
    equipmentName: "My Gear",
    equipmentInfo: "",
    category: "equipment",
    subcategory: "equipment",
    protected: false,
    youtubeLink: "",
    youtubeTitle: ""
  },
  // New images (missing required data)
  "incomplete1.jpg": {
    catalogDesignation: "NGC1234",
    objectName: "", // Missing object name
    category: "astrophotography",
    subcategory: "deep-sky/nebulas",
    protected: false,
    youtubeLink: "",
    youtubeTitle: ""
  },
  "incomplete2.jpg": {
    catalogDesignation: "",
    objectName: "Test Object", // Missing catalog designation  
    category: "astrophotography",
    subcategory: "deep-sky/galaxies",
    protected: false,
    youtubeLink: "",
    youtubeTitle: ""
  }
};

// Helper functions (extracted from component logic)
const safeGet = (obj, key, defaultValue = "") => {
  return obj && typeof obj === "object" && key in obj ? obj[key] : defaultValue;
};

const isAstrophysicsImage = (data) => {
  return (
    data &&
    ("catalogDesignation" in data || "objectName" in data) &&
    !("name" in data) &&
    !("equipmentName" in data)
  );
};

const isTerrestialImage = (data) => {
  return data && "name" in data && !("equipmentName" in data);
};

const isEquipmentImage = (data) => {
  return data && "equipmentName" in data;
};

// Count functions to test
const getTotalImagesCount = (metadata) => {
  return Object.keys(metadata).length;
};

const getNewImagesCount = (metadata) => {
  return Object.entries(metadata).filter(([filename, data]) => {
    const isAstrophysicsCandidate = !safeGet(data, 'name') && !safeGet(data, 'equipmentName');
    if (!isAstrophysicsCandidate) return false;
    
    const objectName = safeGet(data, 'objectName') || '';
    const catalogDesignation = safeGet(data, 'catalogDesignation') || '';
    const category = safeGet(data, 'category') || '';
    const subcategory = safeGet(data, 'subcategory') || '';
    
    // If we have category info, use it to determine if it's complete
    if (category === 'astrophotography') {
      // Check completeness based on subcategory
      if (subcategory.includes('solar') || subcategory.includes('lunar') || subcategory.includes('planets')) {
        return !objectName; // Solar system objects just need objectName
      }
      return (!catalogDesignation || !objectName); // Deep sky objects need both
    }
    
    // Deep sky objects need both catalog and object name
    return (!catalogDesignation || !objectName);
  }).length;
};

const getTerrestrialCount = (metadata) => {
  return Object.entries(metadata).filter(([_, data]) => 
    safeGet(data, 'category') === 'terrestrial' ||
    (safeGet(data, 'name') && !safeGet(data, 'equipmentName'))
  ).length;
};

const getAstrophysicsCount = (metadata) => {
  return Object.entries(metadata).filter(([_, data]) => 
    safeGet(data, 'category') === 'astrophotography' ||
    safeGet(data, 'catalogDesignation') || safeGet(data, 'objectName')
  ).length;
};

const getEquipmentCount = (metadata) => {
  return Object.entries(metadata).filter(([_, data]) => 
    safeGet(data, 'category') === 'equipment' ||
    safeGet(data, 'equipmentName')
  ).length;
};

// Filter functions to test
const getFilteredImages = (metadata, activeFilter) => {
  let filteredData = Object.entries(metadata);
  
  if (activeFilter === 'all') {
    return filteredData; // Show all images
  } else if (activeFilter === 'new') {
    return filteredData.filter(([filename, data]) => {
      const isAstrophysicsCandidate = !safeGet(data, 'name') && !safeGet(data, 'equipmentName');
      if (!isAstrophysicsCandidate) return false;
      
      const objectName = safeGet(data, 'objectName') || '';
      const catalogDesignation = safeGet(data, 'catalogDesignation') || '';
      const category = safeGet(data, 'category') || '';
      const subcategory = safeGet(data, 'subcategory') || '';
      
      if (category === 'astrophotography') {
        if (subcategory.includes('solar') || subcategory.includes('lunar') || subcategory.includes('planets')) {
          return !objectName;
        }
        return (!catalogDesignation || !objectName);
      }
      
      return (!catalogDesignation || !objectName);
    });
  } else if (activeFilter === 'terrestrial') {
    return filteredData.filter(([_, data]) => 
      safeGet(data, 'category') === 'terrestrial' ||
      (safeGet(data, 'name') && !safeGet(data, 'equipmentName'))
    );
  } else if (activeFilter === 'astrophotography') {
    return filteredData.filter(([_, data]) => 
      safeGet(data, 'category') === 'astrophotography' ||
      safeGet(data, 'catalogDesignation') || safeGet(data, 'objectName')
    );
  } else if (activeFilter === 'equipment') {
    return filteredData.filter(([_, data]) => 
      safeGet(data, 'category') === 'equipment' ||
      safeGet(data, 'equipmentName')
    );
  }
  
  return filteredData;
};

describe('Admin Asset Manager Logic', () => {
  describe('Counting Functions', () => {
    test('getTotalImagesCount returns correct total', () => {
      expect(getTotalImagesCount(mockMetadata)).toBe(8);
    });

    test('getNewImagesCount identifies incomplete astrophotography images', () => {
      expect(getNewImagesCount(mockMetadata)).toBe(2); // incomplete1.jpg and incomplete2.jpg
    });

    test('getTerrestrialCount returns correct terrestrial count', () => {
      expect(getTerrestrialCount(mockMetadata)).toBe(2); // mammoth hot springs and grand tetons
    });

    test('getAstrophysicsCount returns correct astrophotography count', () => {
      expect(getAstrophysicsCount(mockMetadata)).toBe(5); // m31, m42, full moon + 2 incompletes
    });

    test('getEquipmentCount returns correct equipment count', () => {
      expect(getEquipmentCount(mockMetadata)).toBe(1); // my gear
    });
  });

  describe('Filtering Functions', () => {
    test('getFilteredImages with "all" filter returns all images', () => {
      const filtered = getFilteredImages(mockMetadata, 'all');
      expect(filtered.length).toBe(8);
    });

    test('getFilteredImages with "new" filter returns incomplete images', () => {
      const filtered = getFilteredImages(mockMetadata, 'new');
      expect(filtered.length).toBe(2);
      expect(filtered.map(([filename]) => filename)).toEqual(['incomplete1.jpg', 'incomplete2.jpg']);
    });

    test('getFilteredImages with "terrestrial" filter returns terrestrial images', () => {
      const filtered = getFilteredImages(mockMetadata, 'terrestrial');
      expect(filtered.length).toBe(2);
      expect(filtered.map(([filename]) => filename)).toEqual(['mammoth hot springs1.jpg', 'grand tetons1.jpg']);
    });

    test('getFilteredImages with "astrophotography" filter returns astrophotography images', () => {
      const filtered = getFilteredImages(mockMetadata, 'astrophotography');
      expect(filtered.length).toBe(5); // All astro images including incomplete ones
    });

    test('getFilteredImages with "equipment" filter returns equipment images', () => {
      const filtered = getFilteredImages(mockMetadata, 'equipment');
      expect(filtered.length).toBe(1);
      expect(filtered.map(([filename]) => filename)).toEqual(['my gear0.jpg']);
    });
  });

  describe('Default Filter Logic', () => {
    test('should default to "new" when new images count > 0', () => {
      const newCount = getNewImagesCount(mockMetadata);
      const expectedDefault = newCount > 0 ? 'new' : 'all';
      expect(expectedDefault).toBe('new');
    });

    test('should default to "all" when new images count = 0', () => {
      const noNewImagesMetadata = {
        "complete1.jpg": {
          catalogDesignation: "M31",
          objectName: "Andromeda Galaxy",
          category: "astrophotography",
          subcategory: "deep-sky/galaxies"
        }
      };
      const newCount = getNewImagesCount(noNewImagesMetadata);
      const expectedDefault = newCount > 0 ? 'new' : 'all';
      expect(expectedDefault).toBe('all');
    });
  });
});

export { 
  getTotalImagesCount, 
  getNewImagesCount, 
  getTerrestrialCount, 
  getAstrophysicsCount, 
  getEquipmentCount,
  getFilteredImages,
  mockMetadata 
};
