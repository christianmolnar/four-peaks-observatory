"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { globalConfig } from "@/config/global";
import fileLocationMappings from "./fileLocationMappings";

// Type definitions for different image schemas
interface BaseImageData {
  youtubeLink: string;
  youtubeTitle: string;
  protected: boolean;
  dateTaken?: string;
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

  // State variables
  const [metadata, setMetadata] = useState<Record<string, ImageData>>({});
  const [pendingChanges, setPendingChanges] = useState<Record<string, string | boolean>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string>("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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

  // Helper: get count for astrophotography subcategories
  const getAstroSubcategoryCount = (subcategory: string) => {
    return Object.entries(metadata).filter(([filename, data]) => {
      const catalogDesignation = safeGet(data, 'catalogDesignation') || '';
      const objectName = safeGet(data, 'objectName') || '';
      
      // Skip if not an astrophotography image
      if (!catalogDesignation && !objectName) return false;
      
      // Skip terrestrial and equipment images
      if (safeGet(data, 'name') || safeGet(data, 'equipmentName')) return false;
      
      const objNameLower = objectName.toLowerCase();
      const catalogLower = catalogDesignation.toLowerCase();
      
      switch (subcategory) {
        case 'Featured':
          // Check if this image exists in the featured directory
          // These are the actual featured images shown in the carousel
          const featuredImages = [
            'Double Cluster.jpg',
            'M1.jpg', 
            'M103-1.jpg',
            'M31.jpg',
            'M39.jpg',
            'M45 --1.jpg',
            'M45.jpg',
            'M56.jpg',
            'M71.jpg',
            'M92-1.jpg',
            'NGC 7635 - M52.jpg'
          ];
          return featuredImages.includes(filename);
        
        case 'DS - Galaxies':
          return objNameLower.includes('galaxy') || 
                 objNameLower.includes('andromeda') || 
                 objNameLower.includes('triangulum') ||
                 catalogLower.startsWith('m31') ||
                 catalogLower.startsWith('m33') ||
                 objNameLower.includes('leo trio');
        
        case 'DS - Nebulas':
          return objNameLower.includes('nebula') || 
                 objNameLower.includes('ghost') ||
                 objNameLower.includes('elephant') ||
                 objNameLower.includes('horsehead') ||
                 objNameLower.includes('orion') ||
                 objNameLower.includes('heart') ||
                 objNameLower.includes('soul') ||
                 objNameLower.includes('wizard') ||
                 objNameLower.includes('bubble') ||
                 objNameLower.includes('crab') ||
                 objNameLower.includes('dumbbell') ||
                 objNameLower.includes('eagle') ||
                 objNameLower.includes('owl') ||
                 objNameLower.includes('thor') ||
                 objNameLower.includes('helmet') ||
                 objNameLower.includes('cone') ||
                 objNameLower.includes('pacman') ||
                 objNameLower.includes('california') ||
                 objNameLower.includes('rosette') ||
                 objNameLower.includes('north america') ||
                 objNameLower.includes('veil') ||
                 objNameLower.includes('pelican') ||
                 objNameLower.includes('cocoon') ||
                 objNameLower.includes('crescent') ||
                 objNameLower.includes('lion') ||
                 catalogLower.includes('ic') ||
                 catalogLower.includes('ngc') ||
                 catalogLower.includes('sh2') ||
                 (catalogLower.startsWith('m') && !objNameLower.includes('cluster') && !objNameLower.includes('galaxy'));
        
        case 'DS - Star Clusters':
          return objNameLower.includes('cluster') || 
                 objNameLower.includes('pleiades') ||
                 catalogLower.startsWith('m13') ||
                 catalogLower.startsWith('m92') ||
                 catalogLower.startsWith('m39') ||
                 catalogLower.startsWith('m45') ||
                 catalogLower.startsWith('m56') ||
                 catalogLower.startsWith('m71') ||
                 catalogLower.startsWith('m103');
        
        case 'DS - Wide Field':
          return objNameLower.includes('wide') || 
                 objNameLower.includes('sadr') ||
                 objNameLower.includes('region');
        
        case 'SS - Solar':
          return objNameLower.includes('sun') && !objNameLower.includes('eclipse');
        
        case 'SS - Lunar':
          return objNameLower.includes('moon') && !objNameLower.includes('eclipse');
        
        case 'SS - Planets':
          return objNameLower.includes('mars') ||
                 objNameLower.includes('venus') ||
                 objNameLower.includes('jupiter') ||
                 objNameLower.includes('saturn') ||
                 objNameLower.includes('uranus') ||
                 objNameLower.includes('neptune') ||
                 objNameLower.includes('mercury') ||
                 objNameLower.includes('planet');
        
        case 'SS - Events':
          return objNameLower.includes('eclipse');
        
        default:
          return false;
      }
    }).length;
  };

  // Helper: get filtered images
  const getFilteredImages = () => {
    let filteredData = Object.entries(metadata);
    
    // Apply filter based on activeFilter
    if (activeFilter === 'all') {
      // Show all images (no filtering)
    } else if (activeFilter === 'new') {
      // Images that should be astrophotography but missing required data
      filteredData = filteredData.filter(([filename, data]) => {
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
      });
    } else if (activeFilter === 'astrophotography') {
      // Images with catalogDesignation OR objectName
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'catalogDesignation') || safeGet(data, 'objectName')
      );
    } else if (activeFilter === 'terrestrial') {
      // Images with name field but not equipmentName
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'name') && !safeGet(data, 'equipmentName')
      );
    } else if (activeFilter === 'equipment') {
      // Images with equipmentName field
      filteredData = filteredData.filter(([_, data]) => 
        safeGet(data, 'equipmentName')
      );
    } else if (activeFilter === 'featured') {
      // Featured astrophotography images - images that exist in the featured directory
      const featuredImages = [
        'Double Cluster.jpg',
        'M1.jpg', 
        'M103-1.jpg',
        'M31.jpg',
        'M39.jpg',
        'M45 --1.jpg',
        'M45.jpg',
        'M56.jpg',
        'M71.jpg',
        'M92-1.jpg',
        'NGC 7635 - M52.jpg'
      ];
      filteredData = filteredData.filter(([filename, _]) => 
        featuredImages.includes(filename)
      );
    } else if (activeFilter === 'galaxies') {
      // Galaxy images
      filteredData = filteredData.filter(([_, data]) => {
        const objectName = safeGet(data, 'objectName') || '';
        const catalogDesignation = safeGet(data, 'catalogDesignation') || '';
        const objNameLower = objectName.toLowerCase();
        const catalogLower = catalogDesignation.toLowerCase();
        
        return objNameLower.includes('galaxy') || 
               objNameLower.includes('andromeda') || 
               objNameLower.includes('triangulum') ||
               catalogLower.startsWith('m31') ||
               catalogLower.startsWith('m33') ||
               objNameLower.includes('leo trio');
      });
    } else if (activeFilter === 'nebulas') {
      // Nebula images
      filteredData = filteredData.filter(([_, data]) => {
        const objectName = safeGet(data, 'objectName') || '';
        const catalogDesignation = safeGet(data, 'catalogDesignation') || '';
        const objNameLower = objectName.toLowerCase();
        const catalogLower = catalogDesignation.toLowerCase();
        
        return objNameLower.includes('nebula') || 
               objNameLower.includes('ghost') ||
               objNameLower.includes('elephant') ||
               objNameLower.includes('horsehead') ||
               objNameLower.includes('orion') ||
               objNameLower.includes('heart') ||
               objNameLower.includes('soul') ||
               objNameLower.includes('wizard') ||
               objNameLower.includes('bubble') ||
               objNameLower.includes('crab') ||
               objNameLower.includes('dumbbell') ||
               objNameLower.includes('eagle') ||
               objNameLower.includes('owl') ||
               objNameLower.includes('thor') ||
               objNameLower.includes('helmet') ||
               objNameLower.includes('cone') ||
               objNameLower.includes('pacman') ||
               objNameLower.includes('california') ||
               objNameLower.includes('rosette') ||
               objNameLower.includes('north america') ||
               objNameLower.includes('veil') ||
               objNameLower.includes('pelican') ||
               objNameLower.includes('cocoon') ||
               objNameLower.includes('crescent') ||
               objNameLower.includes('lion') ||
               catalogLower.includes('ic') ||
               catalogLower.includes('ngc') ||
               catalogLower.includes('sh2') ||
               (catalogLower.startsWith('m') && !objNameLower.includes('cluster') && !objNameLower.includes('galaxy'));
      });
    } else if (activeFilter === 'star-clusters') {
      // Star cluster images
      filteredData = filteredData.filter(([_, data]) => {
        const objectName = safeGet(data, 'objectName') || '';
        const catalogDesignation = safeGet(data, 'catalogDesignation') || '';
        const objNameLower = objectName.toLowerCase();
        const catalogLower = catalogDesignation.toLowerCase();
        
        return objNameLower.includes('cluster') || 
               objNameLower.includes('pleiades') ||
               catalogLower.startsWith('m13') ||
               catalogLower.startsWith('m92') ||
               catalogLower.startsWith('m39') ||
               catalogLower.startsWith('m45') ||
               catalogLower.startsWith('m56') ||
               catalogLower.startsWith('m71') ||
               catalogLower.startsWith('m103');
      });
    } else if (activeFilter === 'wide-field') {
      // Wide field images
      filteredData = filteredData.filter(([_, data]) => {
        const objectName = safeGet(data, 'objectName') || '';
        const objNameLower = objectName.toLowerCase();
        
        return objNameLower.includes('wide') || 
               objNameLower.includes('sadr') ||
               objNameLower.includes('region');
      });
    } else if (activeFilter === 'solar') {
      // Solar images
      filteredData = filteredData.filter(([_, data]) => {
        const objectName = safeGet(data, 'objectName') || '';
        const objNameLower = objectName.toLowerCase();
        
        return objNameLower.includes('sun') && !objNameLower.includes('eclipse');
      });
    } else if (activeFilter === 'lunar') {
      // Lunar images
      filteredData = filteredData.filter(([_, data]) => {
        const objectName = safeGet(data, 'objectName') || '';
        const objNameLower = objectName.toLowerCase();
        
        return objNameLower.includes('moon') && !objNameLower.includes('eclipse');
      });
    } else if (activeFilter === 'planets') {
      // Planet images
      filteredData = filteredData.filter(([_, data]) => {
        const objectName = safeGet(data, 'objectName') || '';
        const objNameLower = objectName.toLowerCase();
        
        return objNameLower.includes('mars') ||
               objNameLower.includes('venus') ||
               objNameLower.includes('jupiter') ||
               objNameLower.includes('saturn') ||
               objNameLower.includes('uranus') ||
               objNameLower.includes('neptune') ||
               objNameLower.includes('mercury') ||
               objNameLower.includes('planet');
      });
    } else if (activeFilter === 'events') {
      // Eclipse and special event images
      filteredData = filteredData.filter(([_, data]) => {
        const objectName = safeGet(data, 'objectName') || '';
        const objNameLower = objectName.toLowerCase();
        
        return objNameLower.includes('eclipse');
      });
    } else if (activeFilter === 'yellowstone') {
      // Yellowstone images
      filteredData = filteredData.filter(([_, data]) => {
        const name = safeGet(data, 'name') || '';
        return name.toLowerCase().includes('yellowstone');
      });
    } else if (activeFilter === 'grand-tetons') {
      // Grand Tetons images
      filteredData = filteredData.filter(([_, data]) => {
        const name = safeGet(data, 'name') || '';
        return name.toLowerCase().includes('grand tetons');
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
        </header>
        
        {/* Statistics Dashboard */}
        <section className="relative z-10 w-full px-6 py-6">
          {/* Top Row: Total Images, New Images, Equipment */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
                      {Object.entries(metadata).filter(([_, data]) => 
                        safeGet(data, 'name') && !safeGet(data, 'equipmentName')
                      ).length}
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
                        safeGet(data, 'name') && safeGet(data, 'name').toLowerCase().includes('yellowstone')
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
                        safeGet(data, 'name') && safeGet(data, 'name').toLowerCase().includes('grand tetons')
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
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-white/60 text-sm">
                  Pending changes: {Object.keys(pendingChanges).length} | Editing: {editingCell || 'None'}
                </div>
                {saveMessage && (
                  <div className="text-sm font-medium">
                    {saveMessage}
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
            <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <div className="w-[3200px]">
                  {/* Table Header */}
                  <div className="grid grid-cols-[300px_150px_250px_150px_250px_300px_150px_450px_300px_100px] gap-6 p-4 border-b border-white/10 bg-white/5 sticky top-0">
                    {[
                      'Image Name',
                      'Catalog',
                      'Object Name',
                      'Date Taken',
                      'Location',
                      'Equipment',
                      'Exposure',
                      'YouTube Link',
                      'YouTube Title',
                      'Protected'
                    ].map((header) => (
                      <div key={header} className="text-white/90 text-sm font-medium tracking-wide">
                        {header}
                      </div>
                    ))}
                  </div>
                  {/* Table Content */}
                  <div className="max-h-96 overflow-y-auto">
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
                        <div key={filename} className="grid grid-cols-[300px_150px_250px_150px_250px_300px_150px_450px_300px_100px] gap-6 p-4 border-b border-white/5 hover:bg-white/5 transition-colors duration-200">
                          {/* Image Name */}
                          <div className="text-white/90 text-sm font-medium truncate" title={filename}>
                            {filename}
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
                          {/* YouTube Link - Editable */}
                          <div className="text-white/80 text-sm">
                            {editingCell === `${filename}.youtubeLink` ? (
                              <input
                                type="text"
                                value={getCurrentValue(filename, 'youtubeLink', safeGet(imageData, 'youtubeLink'))}
                                onChange={(e) => handleCellEdit(filename, 'youtubeLink', e.target.value)}
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
                                onClick={() => handleCellClick(filename, 'youtubeLink')}
                                className="cursor-pointer hover:bg-white/10 rounded px-2 py-1 min-h-[24px] truncate"
                                title={getCurrentValue(filename, 'youtubeLink', safeGet(imageData, 'youtubeLink')) || 'Click to edit'}
                              >
                                {getCurrentValue(filename, 'youtubeLink', safeGet(imageData, 'youtubeLink')) || '—'}
                              </div>
                            )}
                          </div>
                          {/* YouTube Title - Editable */}
                          <div className="text-white/80 text-sm">
                            {editingCell === `${filename}.youtubeTitle` ? (
                              <input
                                type="text"
                                value={getCurrentValue(filename, 'youtubeTitle', safeGet(imageData, 'youtubeTitle'))}
                                onChange={(e) => handleCellEdit(filename, 'youtubeTitle', e.target.value)}
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
                                onClick={() => handleCellClick(filename, 'youtubeTitle')}
                                className="cursor-pointer hover:bg-white/10 rounded px-2 py-1 min-h-[24px] truncate"
                                title={getCurrentValue(filename, 'youtubeTitle', safeGet(imageData, 'youtubeTitle')) || 'Click to edit'}
                              >
                                {getCurrentValue(filename, 'youtubeTitle', safeGet(imageData, 'youtubeTitle')) || '—'}
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
      </div>
    </DevelopmentGuard>
  );
}