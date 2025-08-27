"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { globalConfig } from "@/config/global";

// Type definitions for different image schemas
interface BaseImageData {
  youtubeLink: string;
  youtubeTitle: string;
  protected: boolean;
  dateTaken?: string;
  category?: string;      // NEW: metadata-driven category
  subcategory?: string;   // NEW: metadata-driven subcategory
}
interface AstrophysicsImageData extends BaseImageData {
  catalogDesignation: string;
  objectName: string;
  location?: string;
  equipment?: string;
  exposure?: string;
}
interface TerrestialImageData extends BaseImageData {
  name: string;
  location: string;
}
interface EquipmentImageData extends BaseImageData {
  equipmentName: string;
  equipmentInfo: string;
}
type ImageData = AstrophysicsImageData | TerrestialImageData | EquipmentImageData;

// Type guard functions
const isAstrophysicsImage = (data: any): data is AstrophysicsImageData => {
  return (
    data &&
    ("catalogDesignation" in data || "objectName" in data) &&
    !("name" in data) &&
    !("equipmentName" in data)
  );
};
const isTerrestialImage = (data: any): data is TerrestialImageData => {
  return data && "name" in data && !("equipmentName" in data);
};
const isEquipmentImage = (data: any): data is EquipmentImageData => {
  return data && "equipmentName" in data;
};
const safeGet = (obj: any, key: string, defaultValue: any = "") => {
  return obj && typeof obj === "object" && key in obj ? obj[key] : defaultValue;
};

function DevelopmentGuard({ children }: { children: React.ReactNode }) {
  // Developer mode restriction removed. Always render children.
  return <>{children}</>;
}

export default function AssetManagerPage() {
  // Set page title
  useEffect(() => {
    document.title = "Asset Manager | Maple Valley Observatory";
  }, []);

  // Auto-scan metadata on page load
  useEffect(() => {
    scanMetadata();
  }, []);

  // State variables
  const [metadata, setMetadata] = useState<Record<string, ImageData>>({});
  const [pendingChanges, setPendingChanges] = useState<Record<string, string | boolean>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'} | null>(null);
  const [activeTab, setActiveTab] = useState<'metadata' | 'contemplation'>('metadata');
  
  // Bulk selection state
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  
  // File system integration state
  const [fileSystemData, setFileSystemData] = useState<any>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string>("");

  // Set default filter based on new images count
  useEffect(() => {
    if (Object.keys(metadata).length > 0 && activeFilter === "") {
      // Always default to 'all' for simplicity
      setActiveFilter('all');
    }
  }, [metadata, activeFilter]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Bulk selection handlers
  const toggleImageSelection = (filename: string) => {
    const newSelected = new Set(selectedImages);
    if (newSelected.has(filename)) {
      newSelected.delete(filename);
    } else {
      newSelected.add(filename);
    }
    setSelectedImages(newSelected);
  };

  const selectAllImages = () => {
    const filteredImages = getFilteredImages();
    setSelectedImages(new Set(filteredImages.map(image => image.filename)));
  };

  const selectNoneImages = () => {
    setSelectedImages(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedImages.size === 0) return;
    
    setIsDeleting(true);
    try {
      const filenames = Array.from(selectedImages);
      
      // Call API to delete images
      const response = await fetch('/api/admin/delete-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filenames }),
      });

      if (response.ok) {
        // Remove deleted images from metadata
        const updatedMetadata = { ...metadata };
        filenames.forEach(filename => {
          delete updatedMetadata[filename];
        });
        setMetadata(updatedMetadata);
        
        // Clear selection and pending changes for deleted items
        setSelectedImages(new Set());
        const updatedPendingChanges = { ...pendingChanges };
        filenames.forEach(filename => {
          Object.keys(updatedPendingChanges).forEach(key => {
            if (key.startsWith(filename + '.')) {
              delete updatedPendingChanges[key];
            }
          });
        });
        setPendingChanges(updatedPendingChanges);
        
        setSaveMessage(`Successfully deleted ${filenames.length} image(s)`);
      } else {
        const errorData = await response.json();
        setSaveMessage(`Failed to delete images: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      setSaveMessage('Network error while deleting images');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirmation(false);
      setTimeout(() => setSaveMessage(''), 5000);
    }
  };

  // Metadata analysis functions
  const scanMetadata = async () => {
    setIsScanning(true);
    try {
      const response = await fetch('/api/admin/metadata-scan');
      if (response.ok) {
        const data = await response.json();
        setFileSystemData(data);
        setSyncMessage(`Metadata scan complete: ${data.analysis.totalMetadataEntries} entries, ${data.analysis.categorizedFiles} categorized`);
      } else {
        const errorData = await response.json();
        setSyncMessage(`Scan failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      setSyncMessage('Network error during metadata scan');
    } finally {
      setIsScanning(false);
      setTimeout(() => setSyncMessage(''), 5000);
    }
  };

  // Update metadata function - runs scripts then scans
  const updateMetadata = async () => {
    setIsScanning(true);
    setSyncMessage('Running metadata update scripts...');
    
    try {
      // Run the update-metadata script to find new images
      const response = await fetch('/api/admin/run-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          script: 'update-metadata'
        })
      });

      if (response.ok) {
        const result = await response.json();
        setSyncMessage('Scripts completed. Reloading metadata...');
        
        // After script completion, reload metadata and then scan
        setTimeout(async () => {
          try {
            // Reload metadata from server to get new entries
            const metadataRes = await fetch(`/api/admin/get-metadata?v=${Date.now()}`);
            if (metadataRes.ok) {
              const metadataData = await metadataRes.json();
              setMetadata(metadataData.metadata || {});
              console.log('[Update Metadata] Reloaded metadata:', Object.keys(metadataData.metadata || {}).length, 'entries');
            }
            
            // Then scan the updated metadata for analysis
            await scanMetadata();
            setSyncMessage('Metadata update complete!');
          } catch (error) {
            console.error('[Update Metadata] Error reloading metadata:', error);
            setSyncMessage('Error reloading metadata after update');
          }
        }, 1000);
      } else {
        const errorData = await response.json();
        setSyncMessage(`Script failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      setSyncMessage('Network error during metadata update');
      setIsScanning(false);
      setTimeout(() => setSyncMessage(''), 5000);
    }
  };

  // Helper: toggle category expansion
  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // Helper: detect if image is a solar system object by its file path
  const isSolarSystemImage = (filename: string) => {
    // Check if the file exists in the solar-system directory structure
    const solarSystemPaths = [
      'solar-system/lunar/',
      'solar-system/solar/', 
      'solar-system/planets/',
      'solar-system/events/'
    ];
    
    // For this admin interface, we need to determine if an image is solar system
    // based on common patterns since we don't have direct access to file paths
    const objectName = filename.toLowerCase();
    return objectName.includes('moon') ||
           objectName.includes('sun') ||
           objectName.includes('eclipse') ||
           objectName.includes('solar') ||
           objectName.includes('lunar') ||
           objectName.includes('mars') ||
           objectName.includes('venus') ||
           objectName.includes('jupiter') ||
           objectName.includes('saturn') ||
           objectName.includes('uranus') ||
           objectName.includes('neptune') ||
           objectName.includes('mercury') ||
           objectName.includes('planet');
  };

  // Helper: get count for new images (astrophotography candidates missing data)
  const getNewImagesCount = () => {
    return Object.entries(metadata).filter(([filename, data]) => {
      const isAstrophysicsCandidate = !safeGet(data, 'name') && !safeGet(data, 'equipmentName');
      if (!isAstrophysicsCandidate) return false;
      
      const objectName = safeGet(data, 'objectName') || '';
      const catalogDesignation = safeGet(data, 'catalogDesignation') || '';
      
      // Check if it's a solar system object using improved detection
      const isSolarSystemObject = isSolarSystemImage(filename) || 
                                  isSolarSystemImage(objectName);
      
      // If it's a solar system object, it's only "new" if it's missing objectName
      if (isSolarSystemObject) {
        return !objectName;
      }
      
      // For deep sky and wide field objects, they need both catalogDesignation AND objectName
      return (!catalogDesignation || !objectName);
    }).length;
  };

  // Helper: get count for astrophotography subcategories using metadata-driven categorization
  const getAstroSubcategoryCount = (subcategory: string) => {
    return Object.entries(metadata).filter(([filename, data]) => {
      const category = safeGet(data, 'category') || '';
      const metadataSubcategory = safeGet(data, 'subcategory') || '';
      
      // Only count astrophotography images
      if (category !== 'astrophotography') {
        // Fallback to traditional detection if no category field
        const catalogDesignation = safeGet(data, 'catalogDesignation') || '';
        const objectName = safeGet(data, 'objectName') || '';
        if (!catalogDesignation && !objectName) return false;
        if (safeGet(data, 'name') || safeGet(data, 'equipmentName')) return false;
      }
      
      switch (subcategory) {
        case 'Featured':
          return metadataSubcategory === 'featured';
        
        case 'DS - Galaxies':
          return metadataSubcategory === 'deep-sky/galaxies';
        
        case 'DS - Nebulas':
          return metadataSubcategory === 'deep-sky/nebulas';
        
        case 'DS - Star Clusters':
          return metadataSubcategory === 'deep-sky/star-clusters';
        
        case 'DS - Wide Field':
          return metadataSubcategory === 'deep-sky/wide-field';
        
        case 'SS - Solar':
          return metadataSubcategory === 'solar-system/solar';
        
        case 'SS - Lunar':
          return metadataSubcategory === 'solar-system/lunar';
        
        case 'SS - Planets':
          return metadataSubcategory === 'solar-system/planets';
        
        case 'SS - Events':
          return metadataSubcategory === 'solar-eclipses' || 
                 metadataSubcategory === 'lunar-eclipses';
        
        default:
          return false;
      }
    }).length;
  };

  // Helper: get count for assets (protected images)
  const getAssetsCount = () => {
    return Object.entries(metadata).filter(([filename, data]) => 
      safeGet(data, 'protected') === true
    ).length;
  };

  // Helper: get count for terrestrial images (excluding assets)
  const getTerrestrialCount = () => {
    return Object.entries(metadata).filter(([filename, data]) => 
      (safeGet(data, 'category') === 'terrestrial' ||
       (safeGet(data, 'name') && !safeGet(data, 'equipmentName'))) &&
      safeGet(data, 'protected') !== true  // Exclude assets
    ).length;
  };

  // Helper: fuzzy search functionality
  const fuzzySearch = (query: string, text: string): boolean => {
    if (!query) return true;
    
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    // Exact match gets highest priority
    if (textLower.includes(queryLower)) return true;
    
    // Fuzzy match - check if all characters in query appear in order in text
    let queryIndex = 0;
    for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
      if (textLower[i] === queryLower[queryIndex]) {
        queryIndex++;
      }
    }
    return queryIndex === queryLower.length;
  };

  // Helper: table sorting functionality
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Helper: get contemplation data (images with YouTube assignments)
  const getContemplationData = () => {
    return Object.entries(metadata)
      .filter(([filename, data]) => {
        // Only show astrophotography images with or without YouTube data
        const isAstro = safeGet(data, 'category') === 'astrophotography' ||
                       (safeGet(data, 'catalogDesignation') || safeGet(data, 'objectName')) &&
                       !safeGet(data, 'name') && !safeGet(data, 'equipmentName');
        return isAstro;
      })
      .map(([filename, data]) => ({
        filename,
        objectName: safeGet(data, 'objectName', ''),
        catalogDesignation: safeGet(data, 'catalogDesignation', ''),
        subcategory: safeGet(data, 'subcategory', ''),
        youtubeLink: safeGet(data, 'youtubeLink', ''),
        youtubeTitle: safeGet(data, 'youtubeTitle', ''),
        hasVideo: !!(safeGet(data, 'youtubeLink', '').trim())
      }))
      .sort((a, b) => {
        // Sort by: has video first, then by object name
        if (a.hasVideo && !b.hasVideo) return -1;
        if (!a.hasVideo && b.hasVideo) return 1;
        return a.objectName.localeCompare(b.objectName);
      });
  };

  // Helper: get filtered images using metadata-driven categorization
  const getFilteredImages = () => {
    let filteredData = Object.entries(metadata);
    
    // Apply filter based on activeFilter using new category/subcategory fields
    if (activeFilter === 'all' || activeFilter === '') {
      // Show all images (no filtering)
    } else if (activeFilter === 'new') {
      // Images that should be astrophotography but missing required data
      filteredData = filteredData.filter(([filename, data]) => {
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
        
        // Fallback to old logic if no category info
        const isSolarSystemObject = isSolarSystemImage(filename) || isSolarSystemImage(objectName);
        if (isSolarSystemObject) {
          return !objectName;
        }
        return (!catalogDesignation || !objectName);
      });
    } else if (activeFilter === 'astrophotography') {
      // Images with category='astrophotography' OR traditional detection
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'category') === 'astrophotography' ||
        safeGet(data, 'catalogDesignation') || safeGet(data, 'objectName')
      );
    } else if (activeFilter === 'terrestrial') {
      // Images with category='terrestrial' OR traditional detection (but exclude assets)
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'category') === 'terrestrial' ||
        (safeGet(data, 'name') && !safeGet(data, 'equipmentName') && safeGet(data, 'category') !== 'assets')
      );
    } else if (activeFilter === 'equipment') {
      // Images with category='equipment' OR traditional detection
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'category') === 'equipment' ||
        safeGet(data, 'equipmentName')
      );
    } else if (activeFilter === 'assets') {
      // Protected/asset images
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'protected') === true
      );
    } else if (activeFilter === 'featured') {
      // Featured astrophotography images using subcategory
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'subcategory') === 'featured'
      );
    } else if (activeFilter === 'galaxies') {
      // Galaxy images using subcategory
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'subcategory') === 'deep-sky/galaxies'
      );
    } else if (activeFilter === 'nebulas') {
      // Nebula images using subcategory
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'subcategory') === 'deep-sky/nebulas'
      );
    } else if (activeFilter === 'star-clusters') {
      // Star cluster images using subcategory
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'subcategory') === 'deep-sky/star-clusters'
      );
    } else if (activeFilter === 'wide-field') {
      // Wide field images using subcategory
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'subcategory') === 'deep-sky/wide-field'
      );
    } else if (activeFilter === 'solar') {
      // Solar images using subcategory
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'subcategory') === 'solar-system/solar'
      );
    } else if (activeFilter === 'lunar') {
      // Lunar images using subcategory
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'subcategory') === 'solar-system/lunar'
      );
    } else if (activeFilter === 'planets') {
      // Planet images using subcategory
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'subcategory') === 'solar-system/planets'
      );
    } else if (activeFilter === 'events') {
      // Eclipse and special event images using subcategory
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'subcategory') === 'solar-eclipses' ||
        safeGet(data, 'subcategory') === 'lunar-eclipses'
      );
    } else if (activeFilter === 'yellowstone') {
      // Yellowstone images using subcategory
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'subcategory') === 'yellowstone'
      );
    } else if (activeFilter === 'grand-tetons') {
      // Grand Tetons images using subcategory
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'subcategory') === 'grand-tetons'
      );
    } else if (activeFilter === 'yellowstone') {
      // Yellowstone images using subcategory
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'subcategory') === 'yellowstone'
      );
    } else if (activeFilter === 'grand-tetons') {
      // Grand Tetons images using subcategory
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'subcategory') === 'grand-tetons'
      );
    }

    // Apply search filter
    if (searchQuery) {
      filteredData = filteredData.filter(([filename, data]) => {
        const searchableText = [
          filename,
          safeGet(data, 'objectName', ''),
          safeGet(data, 'catalogDesignation', ''),
          safeGet(data, 'category', ''),
          safeGet(data, 'subcategory', ''),
          safeGet(data, 'name', ''),
          safeGet(data, 'equipmentName', ''),
          safeGet(data, 'location', ''),
          safeGet(data, 'equipment', ''),
          safeGet(data, 'youtubeTitle', '')
        ].join(' ');
        
        return fuzzySearch(searchQuery, searchableText);
      });
    }

    // Apply sorting
    if (sortConfig) {
      filteredData.sort(([aFilename, aData], [bFilename, bData]) => {
        let aValue = sortConfig.key === 'filename' ? aFilename : safeGet(aData, sortConfig.key, '');
        let bValue = sortConfig.key === 'filename' ? bFilename : safeGet(bData, sortConfig.key, '');
        
        // Handle boolean values (protected field)
        if (typeof aValue === 'boolean') aValue = aValue ? 'true' : 'false';
        if (typeof bValue === 'boolean') bValue = bValue ? 'true' : 'false';
        
        // Convert to strings for comparison
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
        
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return filteredData.map(([filename, imageData]) => ({ filename, ...imageData }));
  };

  // Editing functionality
  const handleCellEdit = useCallback((filename: string, field: string, value: string | boolean) => {
    // Debug: log the filename used for edits
    if (!filename.match(/\.[a-zA-Z0-9]+$/)) {
      console.warn('[Asset Manager] WARNING: Editing key without extension:', filename);
    } else {
      console.log('[Asset Manager] Editing key with extension:', filename);
    }
    const changeKey = `${filename}.${field}`;
    setPendingChanges(prev => ({ ...prev, [changeKey]: value }));
  }, []);

  const handleCellClick = useCallback((filename: string, field: string) => {
    setEditingCell(`${filename}.${field}`);
  }, []);

  const handleCellBlur = useCallback(() => {
    setEditingCell(null);
  }, []);

  const getCurrentValue = useCallback((filename: string, field: string, originalValue: any) => {
    const changeKey = `${filename}.${field}`;
    const pendingValue = pendingChanges[changeKey];
    return pendingValue !== undefined ? pendingValue : (originalValue || '');
  }, [pendingChanges]);

  // Save/discard logic
  const hasChanges = Object.keys(pendingChanges).length > 0;

  const saveChanges = async () => {
    if (!hasChanges) return;
    setIsSaving(true);
    setSaveMessage("");
    try {
      // Build the changed entry only
      const changedEntries: Record<string, any> = {};
      Object.entries(pendingChanges).forEach(([changeKey, value]) => {
        // The changeKey is always in the format '<filename>.<field>' where filename may contain periods
        const lastDot = changeKey.lastIndexOf('.');
        const filename = changeKey.substring(0, lastDot);
        const field = changeKey.substring(lastDot + 1);
        // Use the filename as-is, which matches the key in metadata.json
        if (!changedEntries[filename]) {
          changedEntries[filename] = { ...metadata[filename] };
        }
        changedEntries[filename][field] = value;
      });

      // Update local state immediately for responsive UI
      setMetadata(prev => ({
        ...prev,
        ...changedEntries
      }));

      // Send only the changed entry/entries to API
      const response = await fetch('/api/admin/save-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: changedEntries }),
      });
      const result = await response.json();
      if (response.ok) {
        // Log the saved entry to the console for immediate feedback
        if (result.updatedKey && result.updatedValue) {
          console.log('[Asset Manager] Saved entry:', result.updatedKey, result.updatedValue);
        }
        setPendingChanges({});
        setSaveMessage('Changes saved successfully!');
        // Reload metadata
        setTimeout(async () => {
          setSaveMessage('');
          try {
            // Add cache busting to force fresh data
            const res = await fetch(`/api/admin/get-metadata?v=${Date.now()}`);
            if (res.ok) {
              const data = await res.json();
              setMetadata(data.metadata || {});
              console.log('[Asset Manager] Metadata reloaded successfully');
            }
          } catch (error) {
            console.error('[Asset Manager] Failed to reload metadata:', error);
          }
        }, 2000);
      } else {
        // Revert local state on error
        const res = await fetch(`/api/admin/get-metadata?v=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          setMetadata(data.metadata || {});
        }
        setSaveMessage(`Failed to save: ${result.error || 'Unknown error'}`);
        setTimeout(() => setSaveMessage(''), 5000);
      }
    } catch (error) {
      // Revert local state on error
      try {
        const res = await fetch(`/api/admin/get-metadata?v=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          setMetadata(data.metadata || {});
        }
      } catch {}
      setSaveMessage('Network error while saving changes');
      setTimeout(() => setSaveMessage(''), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const discardChanges = () => {
    setPendingChanges({});
    setEditingCell(null);
    setSaveMessage('Changes discarded');
    setTimeout(() => setSaveMessage(''), 2000);
  };

  // Fetch metadata on mount
  useEffect(() => {
    (async () => {
      try {
        console.log('[Asset Manager] Loading initial metadata...');
        const res = await fetch(`/api/admin/get-metadata?v=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          setMetadata(data.metadata || {});
          console.log('[Asset Manager] Initial metadata loaded:', Object.keys(data.metadata || {}).length, 'entries');
        } else {
          console.error('[Asset Manager] Failed to load metadata:', res.status, res.statusText);
        }
      } catch (error) {
        console.error('[Asset Manager] Error loading metadata:', error);
      }
    })();
  }, []);

  // Main render
  return (
    <DevelopmentGuard>
      <div className="min-h-screen bg-black relative">
        {/* Background Image */}
        <div className="fixed inset-0 z-0">
          <Image
            src="/images/assets/NGC7000-Pelican-1.jpg"
            alt="Background"
            fill
            className="object-cover opacity-30"
            priority
          />
          <div className="absolute inset-0 bg-black/60"></div>
        </div>
        
        <header className="relative z-20 w-full px-6 py-8 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <Image src="/images/logo/Logo.jpg" alt="Maple Valley Observatory Logo" width={375} height={375} className="rounded-full" />
              <div>
                <h1 className="text-6xl font-bold text-amber-400 tracking-wider">MAPLE VALLEY OBSERVATORY</h1>
                <p className="text-white/80 text-2xl font-light tracking-wide mt-1">Site Asset Management</p>
              </div>
            </div>
          </div>
          
          {/* Tab Navigation */}
          <div className="mt-8 flex space-x-4">
            <button
              onClick={() => setActiveTab('metadata')}
              className={`px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
                activeTab === 'metadata'
                  ? 'bg-amber-400/20 border border-amber-400 text-amber-400'
                  : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              📊 Image Metadata
            </button>
            <button
              onClick={() => setActiveTab('contemplation')}
              className={`px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
                activeTab === 'contemplation'
                  ? 'bg-amber-400/20 border border-amber-400 text-amber-400'
                  : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              🎵 Contemplation Videos
            </button>
          </div>
        </header>
        
        {/* Tab Content */}
        <div className="relative z-10 w-full">
          {activeTab === 'metadata' && (
            <>
              {/* Statistics Dashboard */}
              <section className="relative z-10 w-full px-6 py-6">
          {/* Top Row: Total Images, New Images, Equipment, Assets */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* Total Images Card */}
            <div 
              className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-4 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 ${activeFilter === 'all' ? 'bg-amber-400/20 border-amber-400' : ''}`}
              onClick={() => setActiveFilter(activeFilter === 'all' ? '' : 'all')}
            >
              <div className="text-2xl font-bold text-white mb-1">{Object.keys(metadata).length}</div>
              <div className="text-white/70 text-sm font-light">Total Images</div>
            </div>

            {/* New Images Card */}
            <div 
              className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-4 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 ${activeFilter === 'new' ? 'bg-amber-400/20 border-amber-400' : ''}`}
              onClick={() => setActiveFilter(activeFilter === 'new' ? '' : 'new')}
            >
              <div className="text-2xl font-bold text-white mb-1">{getNewImagesCount()}</div>
              <div className="text-white/70 text-sm font-light">New Images</div>
            </div>

            {/* Equipment Card */}
            <div 
              className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-4 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 ${activeFilter === 'equipment' ? 'bg-amber-400/20 border-amber-400' : ''}`}
              onClick={() => setActiveFilter(activeFilter === 'equipment' ? '' : 'equipment')}
            >
              <div className="text-2xl font-bold text-white mb-1">
                {Object.entries(metadata).filter(([_, data]) => 
                  safeGet(data, 'equipmentName')
                ).length}
              </div>
              <div className="text-white/70 text-sm font-light">Equipment</div>
            </div>

            {/* Assets Card */}
            <div 
              className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-4 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 ${activeFilter === 'assets' ? 'bg-amber-400/20 border-amber-400' : ''}`}
              onClick={() => setActiveFilter(activeFilter === 'assets' ? '' : 'assets')}
            >
              <div className="text-2xl font-bold text-white mb-1">{getAssetsCount()}</div>
              <div className="text-white/70 text-sm font-light">Assets</div>
            </div>
          </div>

          {/* Second Row: Astrophotography and Terrestrial Side by Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Astrophotography Column */}
            <div className="space-y-2">
              {/* Astrophotography Parent Card */}
              <div 
                className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-4 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 ${activeFilter === 'astrophotography' ? 'bg-amber-400/20 border-amber-400' : ''} ${expandedCategories.has('astrophotography') ? 'border-amber-400/50' : ''}`}
                onClick={() => {
                  if (activeFilter === 'astrophotography') {
                    setActiveFilter('');
                  } else {
                    setActiveFilter('astrophotography');
                  }
                  toggleCategory('astrophotography');
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-white mb-1">
                      {Object.entries(metadata).filter(([_, data]) => 
                        safeGet(data, 'catalogDesignation') || safeGet(data, 'objectName')
                      ).length}
                    </div>
                    <div className="text-white/70 text-sm font-light">Astrophotography</div>
                  </div>
                  <div className={`text-white/60 transition-transform duration-300 ${expandedCategories.has('astrophotography') ? 'rotate-180' : ''}`}>
                    ▼
                  </div>
                </div>
              </div>

              {/* Astrophotography Subcategories */}
              {expandedCategories.has('astrophotography') && (
                <>
                  {/* Featured */}
                  <div 
                    className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-3 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 flex justify-between items-center h-12 ${activeFilter === 'featured' ? 'bg-amber-400/20 border-amber-400' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveFilter(activeFilter === 'featured' ? '' : 'featured');
                    }}
                  >
                    <span className="text-white font-medium">Featured</span>
                    <span className="text-amber-400 font-bold text-lg">{getAstroSubcategoryCount('Featured')}</span>
                  </div>
                  {/* Deep Sky - Galaxies */}
                  <div 
                    className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-3 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 flex justify-between items-center h-12 ${activeFilter === 'galaxies' ? 'bg-amber-400/20 border-amber-400' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveFilter(activeFilter === 'galaxies' ? '' : 'galaxies');
                    }}
                  >
                    <span className="text-white font-medium">Galaxies</span>
                    <span className="text-amber-400 font-bold text-lg">{getAstroSubcategoryCount('DS - Galaxies')}</span>
                  </div>
                  {/* Deep Sky - Nebulas */}
                  <div 
                    className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-3 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 flex justify-between items-center h-12 ${activeFilter === 'nebulas' ? 'bg-amber-400/20 border-amber-400' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveFilter(activeFilter === 'nebulas' ? '' : 'nebulas');
                    }}
                  >
                    <span className="text-white font-medium">Nebulas</span>
                    <span className="text-amber-400 font-bold text-lg">{getAstroSubcategoryCount('DS - Nebulas')}</span>
                  </div>
                  {/* Deep Sky - Star Clusters */}
                  <div 
                    className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-3 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 flex justify-between items-center h-12 ${activeFilter === 'star-clusters' ? 'bg-amber-400/20 border-amber-400' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveFilter(activeFilter === 'star-clusters' ? '' : 'star-clusters');
                    }}
                  >
                    <span className="text-white font-medium">Star Clusters</span>
                    <span className="text-amber-400 font-bold text-lg">{getAstroSubcategoryCount('DS - Star Clusters')}</span>
                  </div>
                  {/* Deep Sky - Wide Field */}
                  <div 
                    className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-3 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 flex justify-between items-center h-12 ${activeFilter === 'wide-field' ? 'bg-amber-400/20 border-amber-400' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveFilter(activeFilter === 'wide-field' ? '' : 'wide-field');
                    }}
                  >
                    <span className="text-white font-medium">Wide Field</span>
                    <span className="text-amber-400 font-bold text-lg">{getAstroSubcategoryCount('DS - Wide Field')}</span>
                  </div>
                  {/* Solar System - Solar */}
                  <div 
                    className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-3 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 flex justify-between items-center h-12 ${activeFilter === 'solar' ? 'bg-amber-400/20 border-amber-400' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveFilter(activeFilter === 'solar' ? '' : 'solar');
                    }}
                  >
                    <span className="text-white font-medium">Solar</span>
                    <span className="text-amber-400 font-bold text-lg">{getAstroSubcategoryCount('SS - Solar')}</span>
                  </div>
                  {/* Solar System - Lunar */}
                  <div 
                    className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-3 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 flex justify-between items-center h-12 ${activeFilter === 'lunar' ? 'bg-amber-400/20 border-amber-400' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveFilter(activeFilter === 'lunar' ? '' : 'lunar');
                    }}
                  >
                    <span className="text-white font-medium">Lunar</span>
                    <span className="text-amber-400 font-bold text-lg">{getAstroSubcategoryCount('SS - Lunar')}</span>
                  </div>
                  {/* Solar System - Planets */}
                  <div 
                    className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-3 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 flex justify-between items-center h-12 ${activeFilter === 'planets' ? 'bg-amber-400/20 border-amber-400' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveFilter(activeFilter === 'planets' ? '' : 'planets');
                    }}
                  >
                    <span className="text-white font-medium">Planets</span>
                    <span className="text-amber-400 font-bold text-lg">{getAstroSubcategoryCount('SS - Planets')}</span>
                  </div>
                  {/* Solar System - Events */}
                  <div 
                    className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-3 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 flex justify-between items-center h-12 ${activeFilter === 'events' ? 'bg-amber-400/20 border-amber-400' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveFilter(activeFilter === 'events' ? '' : 'events');
                    }}
                  >
                    <span className="text-white font-medium">Events</span>
                    <span className="text-amber-400 font-bold text-lg">{getAstroSubcategoryCount('SS - Events')}</span>
                  </div>
                </>
              )}
            </div>

            {/* Terrestrial Column */}
            <div className="space-y-2">
              {/* Terrestrial Parent Card */}
              <div 
                className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-4 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 ${activeFilter === 'terrestrial' ? 'bg-amber-400/20 border-amber-400' : ''} ${expandedCategories.has('terrestrial') ? 'border-amber-400/50' : ''}`}
                onClick={() => {
                  if (activeFilter === 'terrestrial') {
                    setActiveFilter('');
                  } else {
                    setActiveFilter('terrestrial');
                  }
                  toggleCategory('terrestrial');
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-white mb-1">
                      {getTerrestrialCount()}
                    </div>
                    <div className="text-white/70 text-sm font-light">Terrestrial</div>
                  </div>
                  <div className={`text-white/60 transition-transform duration-300 ${expandedCategories.has('terrestrial') ? 'rotate-180' : ''}`}>
                    ▼
                  </div>
                </div>
              </div>

              {/* Terrestrial Subcategories */}
              {expandedCategories.has('terrestrial') && (
                <>
                  {/* Yellowstone */}
                  <div 
                    className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-3 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 flex justify-between items-center h-12 ${activeFilter === 'yellowstone' ? 'bg-amber-400/20 border-amber-400' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveFilter(activeFilter === 'yellowstone' ? '' : 'yellowstone');
                    }}
                  >
                    <span className="text-white font-medium">Yellowstone</span>
                    <span className="text-amber-400 font-bold text-lg">
                      {Object.entries(metadata).filter(([_, data]) => 
                        safeGet(data, 'subcategory') === 'yellowstone'
                      ).length}
                    </span>
                  </div>
                  {/* Grand Tetons */}
                  <div 
                    className={`bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-3 cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-amber-400/30 flex justify-between items-center h-12 ${activeFilter === 'grand-tetons' ? 'bg-amber-400/20 border-amber-400' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveFilter(activeFilter === 'grand-tetons' ? '' : 'grand-tetons');
                    }}
                  >
                    <span className="text-white font-medium">Grand Tetons</span>
                    <span className="text-amber-400 font-bold text-lg">
                      {Object.entries(metadata).filter(([_, data]) => 
                        safeGet(data, 'subcategory') === 'grand-tetons'
                      ).length}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <main className="relative z-10 w-full px-6 py-8">
          {/* ...existing dashboard code... */}
          {/* Save/Discard Controls */}
          <section className="mb-8">
            <div className="flex items-center justify-between bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-4">
              <div className="flex items-center space-x-4">
                <button
                  onClick={saveChanges}
                  disabled={!hasChanges || isSaving}
                  className="bg-green-600/50 hover:bg-green-600/70 disabled:bg-green-600/20 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-light tracking-wide transition-all duration-300 flex items-center space-x-2"
                >
                  {isSaving && (
                    <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin"></div>
                  )}
                  <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                </button>
                <button
                  onClick={discardChanges}
                  disabled={!hasChanges || isSaving}
                  className="bg-red-600/50 hover:bg-red-600/70 disabled:bg-red-600/20 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-light tracking-wide transition-all duration-300"
                >
                  Discard Changes
                </button>
                
                {/* Bulk Operations */}
                <div className="flex items-center space-x-2 border-l border-white/20 pl-4">
                  <button
                    onClick={selectAllImages}
                    disabled={getFilteredImages().length === 0}
                    className="bg-blue-600/50 hover:bg-blue-600/70 disabled:bg-blue-600/20 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-light tracking-wide transition-all duration-300"
                  >
                    Select All
                  </button>
                  <button
                    onClick={selectNoneImages}
                    disabled={selectedImages.size === 0}
                    className="bg-gray-600/50 hover:bg-gray-600/70 disabled:bg-gray-600/20 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-light tracking-wide transition-all duration-300"
                  >
                    Select None
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirmation(true)}
                    disabled={selectedImages.size === 0 || isDeleting}
                    className="bg-red-600/50 hover:bg-red-600/70 disabled:bg-red-600/20 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-light tracking-wide transition-all duration-300 flex items-center space-x-2"
                  >
                    {isDeleting && (
                      <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin"></div>
                    )}
                    <span>{isDeleting ? 'Deleting...' : `Delete Selected (${selectedImages.size})`}</span>
                  </button>
                </div>
                
                {/* Metadata Operations */}
                <div className="flex items-center space-x-2 border-l border-white/20 pl-4">
                  <button
                    onClick={updateMetadata}
                    disabled={isScanning}
                    className="bg-blue-600/50 hover:bg-blue-600/70 disabled:bg-blue-600/20 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-light tracking-wide transition-all duration-300 flex items-center space-x-2"
                  >
                    {isScanning && (
                      <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin"></div>
                    )}
                    <span>{isScanning ? 'Processing...' : 'Update Metadata'}</span>
                  </button>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-white/60 text-sm">
                  Selected: {selectedImages.size} | Pending changes: {Object.keys(pendingChanges).length} | Editing: {editingCell || 'None'}
                </div>
                {(saveMessage || syncMessage) && (
                  <div className="text-sm font-medium">
                    {saveMessage || syncMessage}
                  </div>
                )}
                <div className="text-white/70 text-sm font-light">
                  {hasChanges ? `${Object.keys(pendingChanges).length} pending changes` : 'All changes saved'}
                </div>
              </div>
            </div>
          </section>
          
          {/* Data Table */}
          <section>
            {/* Search Box */}
            <div className="bg-white/5 backdrop-blur-sm rounded-t-lg border border-b-0 border-white/10 px-4 py-3">
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="🔍 Search images... (filename, object name, catalog, etc.)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder:text-white/50 focus:border-amber-400/50 focus:outline-none"
                  />
                </div>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-white/60 hover:text-white text-sm px-2 py-1 rounded"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            
            {/* Table count and info */}
            <div className="bg-white/5 backdrop-blur-sm border border-b-0 border-white/10 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="text-white/90 text-sm font-medium">
                  Displaying {getFilteredImages().length} image(s)
                  {activeFilter && activeFilter !== 'all' && activeFilter !== '' && (
                    <span className="text-amber-400 ml-2">
                      (filtered by: {activeFilter === 'new' ? 'New Images' : 
                                    activeFilter === 'astrophotography' ? 'Astrophotography' :
                                    activeFilter === 'terrestrial' ? 'Terrestrial' :
                                    activeFilter === 'equipment' ? 'Equipment' :
                                    activeFilter === 'assets' ? 'Assets' :
                                    activeFilter === 'featured' ? 'Featured' :
                                    activeFilter === 'galaxies' ? 'Galaxies' :
                                    activeFilter === 'nebulas' ? 'Nebulas' :
                                    activeFilter === 'star-clusters' ? 'Star Clusters' :
                                    activeFilter === 'wide-field' ? 'Wide Field' :
                                    activeFilter === 'solar' ? 'Solar' :
                                    activeFilter === 'lunar' ? 'Lunar' :
                                    activeFilter === 'planets' ? 'Planets' :
                                    activeFilter === 'events' ? 'Events' :
                                    activeFilter === 'yellowstone' ? 'Yellowstone' :
                                    activeFilter === 'grand-tetons' ? 'Grand Tetons' :
                                    activeFilter})
                    </span>
                  )}
                  {searchQuery && (
                    <span className="text-green-400 ml-2">
                      (search: "{searchQuery}")
                    </span>
                  )}
                </div>
                <div className="text-white/60 text-sm">
                  {selectedImages.size > 0 && `${selectedImages.size} selected`}
                </div>
              </div>
            </div>
            
            <div className="bg-white/5 backdrop-blur-sm rounded-b-lg border border-white/10 overflow-hidden">
              <div className="overflow-x-auto overflow-y-hidden max-w-full">
                <div className="min-w-max max-w-none">
                  {/* Table Header */}
                  <div className="grid grid-cols-[60px_minmax(200px,300px)_minmax(100px,120px)_minmax(100px,120px)_minmax(120px,150px)_minmax(200px,250px)_minmax(100px,120px)_minmax(150px,200px)_minmax(200px,250px)_minmax(100px,120px)_minmax(60px,80px)] gap-4 p-4 border-b border-white/10 bg-white/5 sticky top-0">
                    <div className="text-white/90 text-sm font-medium tracking-wide flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedImages.size > 0 && selectedImages.size === getFilteredImages().length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            selectAllImages();
                          } else {
                            selectNoneImages();
                          }
                        }}
                        className="w-4 h-4 text-amber-400 bg-white/10 border-white/30 rounded focus:ring-amber-400 focus:ring-2"
                      />
                    </div>
                    {[
                      { key: 'filename', label: 'Image Name' },
                      { key: 'category', label: 'Category' },
                      { key: 'subcategory', label: 'Subcategory' },
                      { key: 'catalogDesignation', label: 'Catalog' },
                      { key: 'objectName', label: 'Object Name' },
                      { key: 'dateTaken', label: 'Date Taken' },
                      { key: 'location', label: 'Location' },
                      { key: 'equipment', label: 'Equipment' },
                      { key: 'exposure', label: 'Exposure' },
                      { key: 'protected', label: 'Protected' }
                    ].map((column) => (
                      <div 
                        key={column.key} 
                        className="text-white/90 text-sm font-medium tracking-wide cursor-pointer hover:text-amber-400 transition-colors flex items-center space-x-1"
                        onClick={() => handleSort(column.key)}
                      >
                        <span>{column.label}</span>
                        {sortConfig?.key === column.key && (
                          <span className="text-amber-400">
                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Table Content */}
                  <div className="max-h-[70vh] overflow-y-auto">
                    {(() => {
                      const filteredImages = getFilteredImages();
                      if (filteredImages.length === 0) {
                        return (
                          <div className="p-8 text-center">
                            <div className="text-white/50 text-lg font-light mb-2">
                              No images found
                            </div>
                            <div className="text-white/40 text-sm">
                              {activeFilter ? 'Try a different filter or search term' : 'No images match your search'}
                            </div>
                          </div>
                        );
                      }
                      return filteredImages.map(({ filename, ...imageData }) => (
                        <div key={filename} className="grid grid-cols-[60px_minmax(200px,300px)_minmax(100px,120px)_minmax(100px,120px)_minmax(120px,150px)_minmax(200px,250px)_minmax(100px,120px)_minmax(150px,200px)_minmax(200px,250px)_minmax(100px,120px)_minmax(60px,80px)] gap-4 p-4 border-b border-white/5 hover:bg-white/5 transition-colors duration-200">
                          {/* Checkbox for bulk selection */}
                          <div className="text-white/80 text-sm flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={selectedImages.has(filename)}
                              onChange={() => toggleImageSelection(filename)}
                              className="w-4 h-4 text-amber-400 bg-white/10 border-white/30 rounded focus:ring-amber-400 focus:ring-2"
                            />
                          </div>
                          {/* Image Name */}
                          <div className="text-white/90 text-sm font-medium truncate" title={filename}>
                            {filename}
                          </div>
                          {/* Category - Editable Dropdown */}
                          <div className="text-white/80 text-sm">
                            {editingCell === `${filename}.category` ? (
                              <select
                                value={getCurrentValue(filename, 'category', safeGet(imageData, 'category'))}
                                onChange={(e) => handleCellEdit(filename, 'category', e.target.value)}
                                onBlur={handleCellBlur}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCellBlur();
                                  if (e.key === 'Escape') handleCellBlur();
                                }}
                                autoFocus
                                className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm focus:bg-white/20 focus:border-amber-400 focus:outline-none"
                              >
                                <option value="">Select...</option>
                                <option value="astrophotography">Astrophotography</option>
                                <option value="terrestrial">Terrestrial</option>
                                <option value="equipment">Equipment</option>
                              </select>
                            ) : (
                              <div
                                onClick={() => handleCellClick(filename, 'category')}
                                className="cursor-pointer hover:bg-white/10 rounded px-2 py-1 min-h-[24px] truncate"
                                title={getCurrentValue(filename, 'category', safeGet(imageData, 'category')) || 'Click to edit'}
                              >
                                {getCurrentValue(filename, 'category', safeGet(imageData, 'category')) || '—'}
                              </div>
                            )}
                          </div>
                          {/* Subcategory - Editable Dropdown */}
                          <div className="text-white/80 text-sm">
                            {editingCell === `${filename}.subcategory` ? (
                              <select
                                value={getCurrentValue(filename, 'subcategory', safeGet(imageData, 'subcategory'))}
                                onChange={(e) => handleCellEdit(filename, 'subcategory', e.target.value)}
                                onBlur={handleCellBlur}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCellBlur();
                                  if (e.key === 'Escape') handleCellBlur();
                                }}
                                autoFocus
                                className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm focus:bg-white/20 focus:border-amber-400 focus:outline-none"
                              >
                                <option value="">Select...</option>
                                {(() => {
                                  const category = getCurrentValue(filename, 'category', safeGet(imageData, 'category'));
                                  if (category === 'astrophotography') {
                                    return (
                                      <>
                                        <option value="deep-sky/nebulas">Deep Sky - Nebulas</option>
                                        <option value="deep-sky/galaxies">Deep Sky - Galaxies</option>
                                        <option value="deep-sky/star-clusters">Deep Sky - Star Clusters</option>
                                        <option value="deep-sky/wide-field">Deep Sky - Wide Field</option>
                                        <option value="deep-sky/hubble-palette">Deep Sky - Hubble Palette</option>
                                        <option value="solar-system/solar">Solar System - Solar</option>
                                        <option value="solar-system/lunar">Solar System - Lunar</option>
                                        <option value="solar-system/planets">Solar System - Planets</option>
                                        <option value="solar-eclipses">Solar Eclipses</option>
                                        <option value="featured">Featured</option>
                                      </>
                                    );
                                  } else if (category === 'terrestrial') {
                                    return (
                                      <>
                                        <option value="yellowstone">Yellowstone</option>
                                        <option value="grand-tetons">Grand Tetons</option>
                                      </>
                                    );
                                  } else if (category === 'equipment') {
                                    return <option value="equipment">Equipment</option>;
                                  }
                                  return <option value="">Select category first</option>;
                                })()}
                              </select>
                            ) : (
                              <div
                                onClick={() => handleCellClick(filename, 'subcategory')}
                                className="cursor-pointer hover:bg-white/10 rounded px-2 py-1 min-h-[24px] truncate"
                                title={getCurrentValue(filename, 'subcategory', safeGet(imageData, 'subcategory')) || 'Click to edit'}
                              >
                                {getCurrentValue(filename, 'subcategory', safeGet(imageData, 'subcategory')) || '—'}
                              </div>
                            )}
                          </div>
                          {/* Catalog Designation - Editable */}
                          <div className="text-white/80 text-sm">
                            {editingCell === `${filename}.catalogDesignation` ? (
                              <input
                                type="text"
                                value={getCurrentValue(filename, 'catalogDesignation', safeGet(imageData, 'catalogDesignation'))}
                                onChange={(e) => handleCellEdit(filename, 'catalogDesignation', e.target.value)}
                                onBlur={handleCellBlur}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCellBlur();
                                  if (e.key === 'Escape') handleCellBlur();
                                }}
                                autoFocus
                                className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm focus:bg-white/20 focus:border-amber-400 focus:outline-none"
                              />
                            ) : (
                              <div
                                onClick={() => handleCellClick(filename, 'catalogDesignation')}
                                className="cursor-pointer hover:bg-white/10 rounded px-2 py-1 min-h-[24px] truncate"
                                title={getCurrentValue(filename, 'catalogDesignation', safeGet(imageData, 'catalogDesignation')) || 'Click to edit'}
                              >
                                {getCurrentValue(filename, 'catalogDesignation', safeGet(imageData, 'catalogDesignation')) || '—'}
                              </div>
                            )}
                          </div>
                          {/* Object Name - Editable */}
                          <div className="text-white/80 text-sm">
                            {editingCell === `${filename}.objectName` ? (
                              <input
                                type="text"
                                value={getCurrentValue(filename, 'objectName', safeGet(imageData, 'objectName'))}
                                onChange={(e) => handleCellEdit(filename, 'objectName', e.target.value)}
                                onBlur={handleCellBlur}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCellBlur();
                                  if (e.key === 'Escape') handleCellBlur();
                                }}
                                autoFocus
                                className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm focus:bg-white/20 focus:border-amber-400 focus:outline-none"
                              />
                            ) : (
                              <div
                                onClick={() => handleCellClick(filename, 'objectName')}
                                className="cursor-pointer hover:bg-white/10 rounded px-2 py-1 min-h-[24px] truncate"
                                title={getCurrentValue(filename, 'objectName', safeGet(imageData, 'objectName')) || 'Click to edit'}
                              >
                                {getCurrentValue(filename, 'objectName', safeGet(imageData, 'objectName')) || '—'}
                              </div>
                            )}
                          </div>
                          {/* Date Taken - Editable */}
                          <div className="text-white/80 text-sm">
                            {editingCell === `${filename}.dateTaken` ? (
                              <input
                                type="text"
                                value={getCurrentValue(filename, 'dateTaken', safeGet(imageData, 'dateTaken'))}
                                onChange={(e) => handleCellEdit(filename, 'dateTaken', e.target.value)}
                                onBlur={handleCellBlur}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCellBlur();
                                  if (e.key === 'Escape') handleCellBlur();
                                }}
                                autoFocus
                                className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm focus:bg-white/20 focus:border-amber-400 focus:outline-none"
                              />
                            ) : (
                              <div
                                onClick={() => handleCellClick(filename, 'dateTaken')}
                                className="cursor-pointer hover:bg-white/10 rounded px-2 py-1 min-h-[24px] truncate"
                                title={getCurrentValue(filename, 'dateTaken', safeGet(imageData, 'dateTaken')) || 'Click to edit'}
                              >
                                {getCurrentValue(filename, 'dateTaken', safeGet(imageData, 'dateTaken')) || '—'}
                              </div>
                            )}
                          </div>
                          {/* Location - Editable */}
                          <div className="text-white/80 text-sm">
                            {editingCell === `${filename}.location` ? (
                              <input
                                type="text"
                                value={getCurrentValue(filename, 'location', safeGet(imageData, 'location'))}
                                onChange={(e) => handleCellEdit(filename, 'location', e.target.value)}
                                onBlur={handleCellBlur}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCellBlur();
                                  if (e.key === 'Escape') handleCellBlur();
                                }}
                                autoFocus
                                className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm focus:bg-white/20 focus:border-amber-400 focus:outline-none"
                              />
                            ) : (
                              <div
                                onClick={() => handleCellClick(filename, 'location')}
                                className="cursor-pointer hover:bg-white/10 rounded px-2 py-1 min-h-[24px] truncate"
                                title={getCurrentValue(filename, 'location', safeGet(imageData, 'location')) || 'Click to edit'}
                              >
                                {getCurrentValue(filename, 'location', safeGet(imageData, 'location')) || '—'}
                              </div>
                            )}
                          </div>
                          {/* Equipment - Editable */}
                          <div className="text-white/80 text-sm">
                            {editingCell === `${filename}.equipment` ? (
                              <input
                                type="text"
                                value={getCurrentValue(filename, 'equipment', safeGet(imageData, 'equipment'))}
                                onChange={(e) => handleCellEdit(filename, 'equipment', e.target.value)}
                                onBlur={handleCellBlur}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCellBlur();
                                  if (e.key === 'Escape') handleCellBlur();
                                }}
                                autoFocus
                                className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm focus:bg-white/20 focus:border-amber-400 focus:outline-none"
                              />
                            ) : (
                              <div
                                onClick={() => handleCellClick(filename, 'equipment')}
                                className="cursor-pointer hover:bg-white/10 rounded px-2 py-1 min-h-[24px] truncate"
                                title={getCurrentValue(filename, 'equipment', safeGet(imageData, 'equipment')) || 'Click to edit'}
                              >
                                {getCurrentValue(filename, 'equipment', safeGet(imageData, 'equipment')) || '—'}
                              </div>
                            )}
                          </div>
                          {/* Exposure - Editable */}
                          <div className="text-white/80 text-sm">
                            {editingCell === `${filename}.exposure` ? (
                              <input
                                type="text"
                                value={getCurrentValue(filename, 'exposure', safeGet(imageData, 'exposure'))}
                                onChange={(e) => handleCellEdit(filename, 'exposure', e.target.value)}
                                onBlur={handleCellBlur}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCellBlur();
                                  if (e.key === 'Escape') handleCellBlur();
                                }}
                                autoFocus
                                className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm focus:bg-white/20 focus:border-amber-400 focus:outline-none"
                              />
                            ) : (
                              <div
                                onClick={() => handleCellClick(filename, 'exposure')}
                                className="cursor-pointer hover:bg-white/10 rounded px-2 py-1 min-h-[24px] truncate"
                                title={getCurrentValue(filename, 'exposure', safeGet(imageData, 'exposure')) || 'Click to edit'}
                              >
                                {getCurrentValue(filename, 'exposure', safeGet(imageData, 'exposure')) || '—'}
                              </div>
                            )}
                          </div>
                          {/* Protected - Toggle */}
                          <div className="text-white/80 text-sm">
                            <button
                              onClick={() => handleCellEdit(filename, 'protected', !getCurrentValue(filename, 'protected', safeGet(imageData, 'protected')))}
                              className="cursor-pointer hover:bg-white/10 rounded px-2 py-1 min-h-[24px] w-full text-left"
                            >
                              {getCurrentValue(filename, 'protected', safeGet(imageData, 'protected')) ? (
                                <span className="text-amber-400">✓</span>
                              ) : (
                                <span className="text-white/30">✗</span>
                              )}
                            </button>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
            </>
          )}

          {/* Tab 2: Contemplation Videos */}
          {activeTab === 'contemplation' && (
            <>
              {/* Contemplation Dashboard */}
              <section className="relative z-10 w-full px-6 py-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {/* Total Astrophotography Images */}
                  <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-4">
                    <div className="text-2xl font-bold text-white mb-1">
                      {getContemplationData().length}
                    </div>
                    <div className="text-white/70 text-sm font-light">Astrophotography Images</div>
                  </div>

                  {/* Images with Videos */}
                  <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-4">
                    <div className="text-2xl font-bold text-amber-400 mb-1">
                      {getContemplationData().filter(img => img.hasVideo).length}
                    </div>
                    <div className="text-white/70 text-sm font-light">Have Contemplation Videos</div>
                  </div>

                  {/* Images without Videos */}
                  <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-4">
                    <div className="text-2xl font-bold text-red-400 mb-1">
                      {getContemplationData().filter(img => !img.hasVideo).length}
                    </div>
                    <div className="text-white/70 text-sm font-light">Need Contemplation Videos</div>
                  </div>
                </div>
              </section>

              {/* Contemplation Table */}
              <main className="relative z-10 w-full px-6 py-8">
                <section>
                  {/* Search Box */}
                  <div className="bg-white/5 backdrop-blur-sm rounded-t-lg border border-b-0 border-white/10 px-4 py-3">
                    <div className="flex items-center space-x-4">
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="🔍 Search contemplation assignments... (object name, video title, etc.)"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder:text-white/50 focus:border-amber-400/50 focus:outline-none"
                        />
                      </div>
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="text-white/60 hover:text-white text-sm px-2 py-1 rounded"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Table info */}
                  <div className="bg-white/5 backdrop-blur-sm border border-b-0 border-white/10 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="text-white/90 text-sm font-medium">
                        Displaying {getContemplationData().filter(img => {
                          if (!searchQuery) return true;
                          const searchableText = [img.filename, img.objectName, img.catalogDesignation, img.youtubeTitle].join(' ');
                          return fuzzySearch(searchQuery, searchableText);
                        }).length} astrophotography image(s)
                        {searchQuery && (
                          <span className="text-green-400 ml-2">(search: "{searchQuery}")</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white/5 backdrop-blur-sm rounded-b-lg border border-white/10 overflow-hidden">
                    <div className="overflow-x-auto overflow-y-hidden max-w-full">
                      <div className="min-w-max max-w-none">
                        {/* Table Header */}
                        <div className="grid grid-cols-[minmax(250px,300px)_minmax(100px,120px)_minmax(150px,200px)_minmax(250px,350px)_minmax(250px,350px)_minmax(100px,120px)] gap-4 p-4 border-b border-white/10 bg-white/5 sticky top-0">
                          {[
                            { key: 'objectName', label: 'Object Name' },
                            { key: 'catalogDesignation', label: 'Catalog' },
                            { key: 'subcategory', label: 'Category' },
                            { key: 'youtubeLink', label: 'YouTube Link' },
                            { key: 'youtubeTitle', label: 'Video Title' },
                            { key: 'hasVideo', label: 'Status' }
                          ].map((column) => (
                            <div 
                              key={column.key} 
                              className="text-white/90 text-sm font-medium tracking-wide cursor-pointer hover:text-amber-400 transition-colors flex items-center space-x-1"
                              onClick={() => handleSort(column.key)}
                            >
                              <span>{column.label}</span>
                              {sortConfig?.key === column.key && (
                                <span className="text-amber-400">
                                  {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Table Content */}
                        <div className="max-h-[70vh] overflow-y-auto">
                          {(() => {
                            let contemplationData = getContemplationData();
                            
                            // Apply search filter
                            if (searchQuery) {
                              contemplationData = contemplationData.filter(img => {
                                const searchableText = [img.filename, img.objectName, img.catalogDesignation, img.youtubeTitle].join(' ');
                                return fuzzySearch(searchQuery, searchableText);
                              });
                            }

                            if (contemplationData.length === 0) {
                              return (
                                <div className="p-8 text-center">
                                  <div className="text-white/50 text-lg font-light mb-2">
                                    No astrophotography images found
                                  </div>
                                  <div className="text-white/40 text-sm">
                                    {searchQuery ? 'Try a different search term' : 'No astrophotography images available'}
                                  </div>
                                </div>
                              );
                            }

                            return contemplationData.map((img, index) => (
                              <div 
                                key={img.filename}
                                className={`grid grid-cols-[minmax(250px,300px)_minmax(100px,120px)_minmax(150px,200px)_minmax(250px,350px)_minmax(250px,350px)_minmax(100px,120px)] gap-4 p-4 border-b border-white/5 hover:bg-white/5 transition-colors ${
                                  index % 2 === 0 ? 'bg-white/[0.02]' : ''
                                }`}
                              >
                                {/* Object Name */}
                                <div className="text-white text-sm font-medium">
                                  {img.objectName || img.filename}
                                </div>

                                {/* Catalog Designation */}
                                <div className="text-white/80 text-sm">
                                  {img.catalogDesignation}
                                </div>

                                {/* Category */}
                                <div className="text-white/70 text-sm">
                                  {img.subcategory?.replace('deep-sky/', '').replace('solar-system/', '') || 'Unknown'}
                                </div>

                                {/* YouTube Link */}
                                <div className="text-white/80 text-sm">
                                  {img.youtubeLink ? (
                                    <a 
                                      href={img.youtubeLink} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-blue-400 hover:text-blue-300 underline truncate block"
                                    >
                                      {img.youtubeLink}
                                    </a>
                                  ) : (
                                    <span className="text-white/40 italic">No video assigned</span>
                                  )}
                                </div>

                                {/* YouTube Title */}
                                <div className="text-white/80 text-sm">
                                  {img.youtubeTitle || (
                                    <span className="text-white/40 italic">No title</span>
                                  )}
                                </div>

                                {/* Status */}
                                <div className="text-sm">
                                  {img.hasVideo ? (
                                    <span className="text-green-400 font-medium">✓ Assigned</span>
                                  ) : (
                                    <span className="text-red-400 font-medium">⚠ Missing</span>
                                  )}
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </main>
            </>
          )}
        </div>
        
        {/* Delete Confirmation Dialog */}
        {showDeleteConfirmation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
            <div className="bg-white/10 backdrop-blur-md rounded-lg border border-white/20 p-6 max-w-md w-full mx-4">
              <h3 className="text-white text-xl font-semibold mb-4">Confirm Deletion</h3>
              <p className="text-white/80 mb-6">
                Are you sure you want to delete <span className="text-amber-400 font-medium">{selectedImages.size}</span> selected image(s)? 
                This action cannot be undone.
              </p>
              
              {/* List first few filenames */}
              <div className="text-white/60 text-sm mb-6 max-h-32 overflow-y-auto">
                {Array.from(selectedImages).slice(0, 5).map(filename => (
                  <div key={filename} className="truncate">• {filename}</div>
                ))}
                {selectedImages.size > 5 && (
                  <div className="text-white/40">... and {selectedImages.size - 5} more</div>
                )}
              </div>
              
              <div className="flex space-x-4">
                <button
                  onClick={() => setShowDeleteConfirmation(false)}
                  className="flex-1 bg-gray-600/50 hover:bg-gray-600/70 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={isDeleting}
                  className="flex-1 bg-red-600/50 hover:bg-red-600/70 disabled:bg-red-600/20 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 flex items-center justify-center space-x-2"
                >
                  {isDeleting && (
                    <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin"></div>
                  )}
                  <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DevelopmentGuard>
  );
}