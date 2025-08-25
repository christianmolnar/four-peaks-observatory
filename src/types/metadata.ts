// Shared TypeScript interfaces for metadata system
// Phase 1: Added category and subcategory fields for metadata-driven categorization

export interface BaseImageData {
  youtubeLink: string;
  youtubeTitle: string;
  protected: boolean;
  dateTaken?: string;
  category?: string;          // NEW: Primary category (astrophotography, terrestrial, equipment)
  subcategory?: string;       // NEW: Subcategory path (e.g., "deep-sky/nebulas", "yellowstone")
}

export interface AstrophysicsImageData extends BaseImageData {
  catalogDesignation: string;
  objectName: string;
  location?: string;
  equipment?: string;
  exposure?: string;
  category: 'astrophotography';  // Constrained to astrophotography
  subcategory: 'deep-sky/nebulas' | 'deep-sky/galaxies' | 'deep-sky/star-clusters' | 'deep-sky/wide-field' | 
               'solar-system/solar' | 'solar-system/lunar' | 'solar-system/planets' | 'solar-system/events';
}

export interface TerrestrialImageData extends BaseImageData {
  name: string;
  location: string;
  category: 'terrestrial';      // Constrained to terrestrial
  subcategory: 'yellowstone' | 'grand-tetons';
}

export interface EquipmentImageData extends BaseImageData {
  equipmentName: string;
  equipmentInfo: string;
  category: 'equipment';        // Constrained to equipment
  subcategory?: string;         // Optional for equipment
}

export type ImageData = AstrophysicsImageData | TerrestrialImageData | EquipmentImageData;

// Category mapping for file path detection
export const CATEGORY_MAPPINGS = {
  // Astrophotography categories
  'astrophotography/deep-sky/nebulas': { category: 'astrophotography', subcategory: 'deep-sky/nebulas' },
  'astrophotography/deep-sky/galaxies': { category: 'astrophotography', subcategory: 'deep-sky/galaxies' },
  'astrophotography/deep-sky/star-clusters': { category: 'astrophotography', subcategory: 'deep-sky/star-clusters' },
  'astrophotography/deep-sky/wide-field': { category: 'astrophotography', subcategory: 'deep-sky/wide-field' },
  'astrophotography/solar-system/solar': { category: 'astrophotography', subcategory: 'solar-system/solar' },
  'astrophotography/solar-system/lunar': { category: 'astrophotography', subcategory: 'solar-system/lunar' },
  'astrophotography/solar-system/planets': { category: 'astrophotography', subcategory: 'solar-system/planets' },
  'astrophotography/solar-system/events': { category: 'astrophotography', subcategory: 'solar-system/events' },
  'astrophotography/featured': { category: 'astrophotography', subcategory: 'featured' },
  
  // Terrestrial categories
  'terrestrial/yellowstone': { category: 'terrestrial', subcategory: 'yellowstone' },
  'terrestrial/grand-tetons': { category: 'terrestrial', subcategory: 'grand-tetons' },
  
  // Equipment category
  'equipment': { category: 'equipment', subcategory: '' }
} as const;

// Helper function to detect category from file path
export function detectCategoryFromPath(filePath: string): { category: string; subcategory: string } | null {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  
  for (const [pathPattern, categoryInfo] of Object.entries(CATEGORY_MAPPINGS)) {
    if (normalizedPath.includes(pathPattern.toLowerCase())) {
      return {
        category: categoryInfo.category,
        subcategory: categoryInfo.subcategory
      };
    }
  }
  
  return null;
}

// Type guard functions
export function isAstrophysicsImageData(data: ImageData): data is AstrophysicsImageData {
  return data.category === 'astrophotography' && 'catalogDesignation' in data && 'objectName' in data;
}

export function isTerrestrialImageData(data: ImageData): data is TerrestrialImageData {
  return data.category === 'terrestrial' && 'name' in data;
}

export function isEquipmentImageData(data: ImageData): data is EquipmentImageData {
  return data.category === 'equipment' && 'equipmentName' in data;
}
