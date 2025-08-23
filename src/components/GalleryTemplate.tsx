'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import SiteLayout from '@/components/SiteLayout';
import metadata from '@/data/metadata.json';
import fileTimestamps from '@/data/file-timestamps.json';

interface ImageMetadata {
  src: string;
  filename: string;
  // Astrophotography fields
  catalogDesignation?: string;
  objectName?: string;
  equipment?: string;
  exposure?: string;
  // Terrestrial fields
  name?: string;
  // Equipment fields
  equipmentName?: string;
  equipmentInfo?: string;
  // Common fields
  dateTaken?: string; // e.g., "February, 2024"
  location: string;
  // YouTube contemplation fields
  youtubeLink?: string;
  youtubeTitle?: string;
}

interface GalleryTemplateProps {
  title: string;
  backgroundImage: string;
  imageFolder: string;
}

// Dynamically import gallery images and videos
function getGalleryImages(imageFolder: string): ImageMetadata[] {
  const allMedia = [];
  
  try {
    // First, get all images using require.context
    // @ts-expect-error - require.context is a webpack-specific function
    const imageContext = require.context('../../public/images', true, /\.(jpg|jpeg|png|avif|webp)$/);
    const imageFiles = imageContext.keys()
      .filter((key: string) => {
        // Make the path matching more precise to avoid cross-contamination
        const normalizedKey = key.replace(/^\.\//, '');
        return normalizedKey.startsWith(imageFolder + '/') || normalizedKey === imageFolder;
      })
      .map((key: string) => {
        const src = key.replace(/^\./, '/images');
        const filename = src.split('/').pop() || '';
        const imageMetadata = metadata[filename as keyof typeof metadata] || {
          catalogDesignation: '',
          objectName: filename.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '').toUpperCase(),
          location: 'Maple Valley, WA',
          equipment: 'SeeStar S50',
          exposure: 'Unknown'
        };
        return { src, filename, ...imageMetadata };
      });
    
    allMedia.push(...imageFiles);
    
    // Then, manually add video files that we know exist based on metadata
    // Videos are handled differently since they can't be loaded as modules
    Object.keys(metadata).forEach(filename => {
      if (isVideoFile(filename)) {
        const videoMetadata = metadata[filename as keyof typeof metadata];
        
        if (videoMetadata) {
          // Check if this video belongs to the current folder by checking the metadata location
          // We'll use a simple path-based check since we can't use require.context for videos
          const expectedPath = `/images/${imageFolder}/${filename}`;
          
          // Only include videos that would logically belong in this folder
          // This is a safer approach than trying to scan video files as modules
          const shouldIncludeVideo = () => {
            // For eclipse videos, only include them in the eclipse-specific folder
            if (filename.toLowerCase().includes('eclipse')) {
              return imageFolder.includes('total-eclipse-2017');
            }
            
            // For other videos, you can add similar logic here based on naming conventions
            // For now, we'll be conservative and only include eclipse videos in their specific folder
            return false;
          };
          
          if (shouldIncludeVideo()) {
            allMedia.push({
              src: expectedPath,
              filename,
              ...videoMetadata
            });
          }
        }
      }
    });
    
    return allMedia;
  } catch {
    // Fallback to featured images if the specific folder doesn't exist
    // @ts-expect-error - require.context is a webpack-specific function
    const context = require.context('../../public/images/astrophotography/featured', false, /\.(jpg|jpeg|png|avif|webp)$/);
    return context.keys().map((key: string) => {
      const src = key.replace(/^\./, '/images/astrophotography/featured');
      const filename = src.split('/').pop() || '';
      const imageMetadata = metadata[filename as keyof typeof metadata] || {
        catalogDesignation: '',
        objectName: filename.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '').toUpperCase(),
        location: 'Maple Valley, WA',
        equipment: 'SeeStar S50',
        exposure: 'Unknown'
      };
      return { src, filename, ...imageMetadata };
    });
  }
}

// Helper function to determine if an image should show YouTube contemplation controls
// Only astrophotography images should have contemplative videos
function shouldShowContemplationControls(image: ImageMetadata): boolean {
  // Must have a YouTube link
  if (!image.youtubeLink || !image.youtubeLink.startsWith('https://')) {
    return false;
  }
  
  // Must be astrophotography (have catalog designation or be celestial object)
  const isAstrophotography = !!(image.catalogDesignation || 
    (image.objectName && !image.name && !image.equipmentName));
  
  // Should not be terrestrial or equipment
  const isTerrestrial = !!image.name && !image.catalogDesignation && !image.objectName;
  const isEquipment = !!image.equipmentName;
  
  return isAstrophotography && !isTerrestrial && !isEquipment;
}

// Helper function to extract YouTube video ID from various URL formats
function getYouTubeVideoId(url: string): string {
  if (!url) return '';
  
  // Handle regular YouTube URLs (watch?v=)
  if (url.includes('watch?v=')) {
    return url.split('v=')[1]?.split('&')[0] || '';
  }
  
  // Handle YouTube Shorts URLs (/shorts/)
  if (url.includes('/shorts/')) {
    return url.split('/shorts/')[1]?.split('?')[0] || '';
  }
  
  // Handle YouTube embed URLs (/embed/)
  if (url.includes('/embed/')) {
    return url.split('/embed/')[1]?.split('?')[0] || '';
  }
  
  // Handle youtu.be short URLs
  if (url.includes('youtu.be/')) {
    return url.split('youtu.be/')[1]?.split('?')[0] || '';
  }
  
  return '';
}

// Helper function to check if file is a video
function isVideoFile(filename: string): boolean {
  const videoExtensions = ['.mp4', '.mov', '.avi', '.webm'];
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return videoExtensions.includes(extension);
}

export default function GalleryTemplate({ title, backgroundImage, imageFolder }: GalleryTemplateProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [currentImage, setCurrentImage] = useState(0);
  const [showYouTubeOverlay, setShowYouTubeOverlay] = useState(false);
  let images = getGalleryImages(imageFolder);

  // Sort images by newest first ONLY on specific gallery pages that show individual images
  const shouldSortByNewest = 
    imageFolder === 'astrophotography/deep-sky/nebulas' ||     // Nebulas gallery
    imageFolder === 'astrophotography/deep-sky/galaxies' ||    // Galaxies gallery  
    imageFolder === 'astrophotography/deep-sky/star-clusters' || // Star Clusters gallery
    imageFolder === 'astrophotography/deep-sky/wide-field' ||  // Deep Sky Wide Field gallery
    imageFolder === 'astrophotography/deep-sky/Hubble-Palette' || // Hubble Palette gallery
    imageFolder === 'astrophotography/solar-system/solar' ||   // Solar gallery
    imageFolder === 'astrophotography/solar-system/lunar' ||   // Lunar gallery
    imageFolder === 'astrophotography/solar-system/planets' || // Planets gallery
    imageFolder === 'astrophotography/solar-system/events' ||  // Celestial Events gallery
    imageFolder === 'astrophotography/featured' ||             // Featured gallery
    imageFolder === 'equipment' ||                             // Equipment gallery
    imageFolder === 'terrestrial/yellowstone' ||               // Yellowstone gallery
    imageFolder === 'terrestrial/grand-tetons';                // Grand Tetons gallery

  // Temporary debugging
  console.log('🔍 Gallery Debug:', {
    imageFolder,
    shouldSortByNewest,
    imagesCount: images.length,
    firstThreeImages: images.slice(0, 3).map(img => img.filename)
  });

  if (shouldSortByNewest) {
    images = [...images].sort((a, b) => {
      // Get actual file modification times from captured timestamps
      const getFileModTime = (imageData: { filename: string }) => {
        // Look for the file in timestamps using the exact imageFolder path
        const filename = imageData.filename;
        const fullPath = `${imageFolder}/${filename}`;
        
        if (fileTimestamps[fullPath as keyof typeof fileTimestamps]) {
          // Use Date Modified (mtime) instead of created time
          return fileTimestamps[fullPath as keyof typeof fileTimestamps].mtimeMs;
        }
        
        // Fallback: extract date from filename if present
        const extractDateFromFilename = (filename: string) => {
          const datePatterns = [
            /(\d{4})[_-](\d{1,2})[_-](\d{1,2})/,  // YYYY-MM-DD or YYYY_MM_DD
            /(\d{1,2})[_-](\d{1,2})[_-](\d{4})/,  // MM-DD-YYYY or MM_DD_YYYY
            /(\d{4})(\d{2})(\d{2})/,              // YYYYMMDD
          ];
          
          for (const pattern of datePatterns) {
            const match = filename.match(pattern);
            if (match) {
              let year, month, day;
              if (pattern === datePatterns[0] || pattern === datePatterns[2]) {
                [, year, month, day] = match;
              } else {
                [, month, day, year] = match;
              }
              return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime();
            }
          }
          return 0;
        };
        
        return extractDateFromFilename(filename);
      };
      
      // Get modification times for both files
      const timeA = getFileModTime(a);
      const timeB = getFileModTime(b);
      
      // Sort by modification time (newest first)
      if (timeA !== timeB) {
        return timeB - timeA; // Higher timestamp = newer = first
      }
      
      // Final fallback: reverse alphabetical (assumes newer files have "later" names)
      return b.filename.localeCompare(a.filename);
    });
  }

  const openModal = (index: number) => {
    setCurrentImage(index);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setShowYouTubeOverlay(false); // Close YouTube overlay when modal closes
  };

  const openYouTubeOverlay = () => {
    setShowYouTubeOverlay(true);
  };

  const closeYouTubeOverlay = () => {
    setShowYouTubeOverlay(false);
  };

  const nextImage = () => {
    setCurrentImage((prev) => (prev + 1) % images.length);
    setShowYouTubeOverlay(false); // Close YouTube overlay when changing images
  };

  const prevImage = () => {
    setCurrentImage((prev) => (prev - 1 + images.length) % images.length);
    setShowYouTubeOverlay(false); // Close YouTube overlay when changing images
  };

  // Swipe gesture handling
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null); // Reset touch end
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && images.length > 1) {
      nextImage(); // Swipe left = next image
    }
    if (isRightSwipe && images.length > 1) {
      prevImage(); // Swipe right = previous image
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!modalOpen) return;

    const handleKeydown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          closeModal();
          break;
        case 'ArrowLeft':
          prevImage();
          break;
        case 'ArrowRight':
          nextImage();
          break;
      }
    };

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [modalOpen, nextImage, prevImage]);

  return (
    <SiteLayout>
      <div className="min-h-screen bg-black">
        {/* Background Image */}
        <div className="fixed inset-0 z-0">
          <Image
            src={backgroundImage}
            alt="Background"
            fill
            className="object-cover opacity-50"
            quality={85}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/5 to-black/20" />
        </div>

        {/* Gallery Content */}
      <main className="relative z-10 pt-16 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          {/* Gallery Title */}
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-light text-white tracking-[0.2em] mb-8">
              {title.toUpperCase()}
            </h1>
          </div>

          {/* Gallery Grid - Centered */}
          <div className="flex justify-center">
            <div className="flex flex-wrap justify-center gap-6 max-w-[1400px]">
              {images.map((image: ImageMetadata, index: number) => (
              <div
                key={image.filename}
                className="group cursor-pointer transform transition-all duration-300 hover:scale-105 touch-manipulation"
                style={{ width: '280px', minHeight: '44px' }}
                onClick={() => openModal(index)}
              >
                {/* Glass Card - Enhanced for touch */}
                <div className="relative bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 overflow-hidden shadow-2xl hover:bg-white/10 hover:border-white/20 transition-all duration-300 active:scale-95">
                  {/* Image/Video Container */}
                  <div className="aspect-[3/4] relative">
                    {isVideoFile(image.src) ? (
                      <>
                        <video
                          src={image.src}
                          className="object-cover w-full h-full"
                          preload="metadata"
                          muted
                        />
                        {/* Video Play Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-all duration-300">
                          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                            <div className="w-0 h-0 border-l-[16px] border-l-black border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent ml-1"></div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <Image
                        src={image.src}
                        alt={
                          image.objectName 
                            ? `${image.objectName} ${image.catalogDesignation ? `(${image.catalogDesignation})` : ''} - Astrophotography by Maple Valley Observatory`
                            : image.equipmentName 
                            ? `${image.equipmentName} - Telescope and Astrophotography Equipment`
                            : image.name 
                            ? `${image.name} - Photography by Maple Valley Observatory`
                            : 'Astronomy and Photography by Maple Valley Observatory'
                        }
                        fill
                        className="object-contain bg-black/20"
                        quality={90}
                      />
                    )}
                  </div>
                  
                  {/* Bottom Label with Thicker Border - Two Lines */}
                  <div className="relative bg-black/60 backdrop-blur-sm border-t-2 border-white/20 p-3 min-h-[60px] flex flex-col justify-center">
                    {/* For astrophotography images */}
                    {(image.catalogDesignation || image.objectName) ? (
                      <>
                        {image.catalogDesignation && (
                          <h3 className="text-white/90 text-xs font-medium tracking-widest text-center mb-1">
                            {image.catalogDesignation}
                          </h3>
                        )}
                        {image.objectName && (
                          <h4 className="text-white text-sm font-medium tracking-wide text-center">
                            {image.objectName}
                          </h4>
                        )}
                      </>
                    ) : image.equipmentName ? (
                      /* For equipment images */
                      <>
                        <h4 className="text-white text-sm font-medium tracking-wide text-center">
                          {image.equipmentName}
                        </h4>
                        {image.equipmentInfo && (
                          <p className="text-white/70 text-xs text-center mt-1">
                            {image.equipmentInfo}
                          </p>
                        )}
                      </>
                    ) : (
                      /* For terrestrial images */
                      image.name && (
                        <h4 className="text-white text-sm font-medium tracking-wide text-center">
                          {image.name}
                        </h4>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      </main>

      {/* Modal with Metadata */}
      {modalOpen && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 flex items-center justify-center bg-black/95 backdrop-blur-lg"
          style={{ zIndex: 99999 }}
        >
          {/* Close button - Enhanced for mobile */}
          <button
            onClick={closeModal}
            className="absolute top-3 right-3 md:top-2 md:right-2 text-white/90 hover:text-white text-xl md:text-2xl font-light bg-black/60 hover:bg-black/80 backdrop-blur-sm transition-all duration-300 ease-out touch-manipulation"
            aria-label="Close full screen image"
            style={{ 
              zIndex: 100000,
              position: 'absolute',
              width: '44px',
              height: '44px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              fontSize: '20px',
              fontWeight: 300
            }}
          >
            ✕
          </button>

          {/* Previous Image Button - Enhanced for mobile */}
          {images.length > 1 && (
            <button
              onClick={prevImage}
              className="absolute left-3 md:left-4 top-1/2 transform -translate-y-1/2 text-white/90 hover:text-white text-3xl md:text-4xl font-light bg-black/60 hover:bg-black/80 backdrop-blur-sm transition-all duration-300 ease-out touch-manipulation"
              aria-label="Previous image"
              style={{ 
                zIndex: 100000,
                width: '56px',
                height: '56px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                fontSize: '28px',
                fontWeight: 300
              }}
            >
              ‹
            </button>
          )}

          {/* Next Image Button - Enhanced for mobile */}
          {images.length > 1 && (
            <button
              onClick={nextImage}
              className="absolute right-3 md:right-4 top-1/2 transform -translate-y-1/2 text-white/90 hover:text-white text-3xl md:text-4xl font-light bg-black/60 hover:bg-black/80 backdrop-blur-sm transition-all duration-300 ease-out touch-manipulation"
              aria-label="Next image"
              style={{ 
                zIndex: 100000,
                width: '56px',
                height: '56px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                fontSize: '28px',
                fontWeight: 300
              }}
            >
              ›
            </button>
          )}

          {/* Media Container - Maximized for fullscreen viewing */}
          <div className="flex flex-col items-center justify-center w-full h-full p-2">
            {/* YouTube Contemplation Control - Enhanced for mobile */}
            {shouldShowContemplationControls(images[currentImage]) && (
              <div 
                className="fixed top-4 right-4 md:right-24 z-10 bg-white/10 backdrop-blur-md rounded-lg px-4 py-4 border border-white/20 cursor-pointer hover:bg-white/15 hover:border-white/30 transition-all duration-300 group shadow-2xl touch-manipulation"
                onClick={openYouTubeOverlay}
                style={{ minHeight: '44px', minWidth: '44px' }}
              >
                <div className="flex flex-col items-center justify-center gap-2 text-white/90 max-w-[168px]">
                  <div className="flex-shrink-0">
                    <svg className="w-6 h-6 md:w-5 md:h-5 text-white/90 group-hover:text-white transition-colors duration-300" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                  </div>
                  <div className="text-sm leading-tight text-center hidden md:block">
                    <div className="font-light tracking-wide group-hover:text-white transition-colors duration-300">
                      Contemplative Sounds
                    </div>
                    <div className="text-xs text-white/70 group-hover:text-white/80 transition-colors duration-300 font-light">
                      Click to play while exploring
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* YouTube Video Overlay - Enhanced for mobile */}
            {showYouTubeOverlay && shouldShowContemplationControls(images[currentImage]) && (
              <div className="fixed top-4 right-4 md:right-20 z-[100001] bg-black/90 backdrop-blur-sm rounded-lg border border-white/20 overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between bg-black/60 px-3 py-2 border-b border-white/10">
                  <span className="text-white/90 text-xs">{images[currentImage].youtubeTitle || "Contemplative Sounds"}</span>
                  <button
                    onClick={closeYouTubeOverlay}
                    className="text-white/90 hover:text-white transition-colors duration-200 touch-manipulation p-1 ml-2"
                    aria-label="Close video"
                    style={{ minHeight: '32px', minWidth: '32px' }}
                  >
                    ✕
                  </button>
                </div>
                <iframe
                  src={`https://www.youtube.com/embed/${getYouTubeVideoId(images[currentImage].youtubeLink || '')}?autoplay=1&controls=1&rel=0`}
                  title="Contemplative Music"
                  width="320"
                  height="180"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="border-0"
                />
              </div>
            )}
            
            <div 
              className="relative max-w-[98vw] max-h-[92vh] rounded-lg overflow-hidden shadow-2xl bg-black"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              {isVideoFile(images[currentImage].src) ? (
                <video
                  src={images[currentImage].src}
                  controls
                  className="object-contain w-full h-full"
                  style={{ 
                    width: 'auto', 
                    height: 'auto',
                    maxWidth: '98vw',
                    maxHeight: '92vh',
                    minWidth: '300px'
                  }}
                  preload="metadata"
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <Image
                  src={images[currentImage].src}
                  alt={
                    images[currentImage].objectName 
                      ? `${images[currentImage].objectName} ${images[currentImage].catalogDesignation ? `(${images[currentImage].catalogDesignation})` : ''} - Astrophotography by Maple Valley Observatory`
                      : images[currentImage].equipmentName 
                      ? `${images[currentImage].equipmentName} - Telescope and Astrophotography Equipment`
                      : images[currentImage].name 
                      ? `${images[currentImage].name} - Photography by Maple Valley Observatory`
                      : 'Astronomy and Photography by Maple Valley Observatory'
                  }
                  width={1400}
                  height={1000}
                  className="object-contain w-full h-full"
                  priority
                  style={{ 
                    width: 'auto', 
                    height: 'auto',
                    maxWidth: '98vw',
                    maxHeight: '92vh',
                    minWidth: '300px'
                  }}
                />
              )}
            </div>
            
            {/* Compact Metadata Overlay */}
            <div className="mt-2 bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/10 max-w-[98vw] mx-auto">
              <div className="flex flex-wrap items-center justify-center gap-2 text-white/90 text-xs">
                {(() => {
                  const metadataItems = [];
                  
                  // Check if this is an astrophotography, equipment, or terrestrial image
                  const isAstrophotography = images[currentImage].catalogDesignation || images[currentImage].objectName;
                  const isEquipment = images[currentImage].equipmentName;
                  
                  if (isAstrophotography) {
                    // Astrophotography: Object name (catalog designation + object name or either one)
                    if (images[currentImage].catalogDesignation && images[currentImage].objectName) {
                      metadataItems.push(
                        <span key="name" className="font-medium tracking-wide">
                          {`${images[currentImage].catalogDesignation} - ${images[currentImage].objectName}`}
                        </span>
                      );
                    } else if (images[currentImage].catalogDesignation || images[currentImage].objectName) {
                      metadataItems.push(
                        <span key="name" className="font-medium tracking-wide">
                          {images[currentImage].catalogDesignation || images[currentImage].objectName}
                        </span>
                      );
                    }
                    
                    // Date taken (for astrophotography)
                    if (images[currentImage].dateTaken) {
                      metadataItems.push(
                        <span key="dateTaken">{images[currentImage].dateTaken}</span>
                      );
                    }
                  } else if (isEquipment) {
                    // Equipment: Show equipment name and info
                    metadataItems.push(
                      <span key="equipmentName" className="font-medium tracking-wide">
                        {images[currentImage].equipmentName}
                      </span>
                    );
                    if (images[currentImage].equipmentInfo) {
                      metadataItems.push(
                        <span key="equipmentInfo" className="text-white/70">
                          {images[currentImage].equipmentInfo}
                        </span>
                      );
                    }
                  } else {
                    // Terrestrial: Show name if available
                    if (images[currentImage].name) {
                      metadataItems.push(
                        <span key="name" className="font-medium tracking-wide">
                          {images[currentImage].name}
                        </span>
                      );
                    }
                    
                    // Date taken (for terrestrial)
                    if (images[currentImage].dateTaken) {
                      metadataItems.push(
                        <span key="dateTaken">{images[currentImage].dateTaken}</span>
                      );
                    }
                  }
                  
                  // Location
                  if (images[currentImage].location) {
                    metadataItems.push(
                      <span key="location">{images[currentImage].location}</span>
                    );
                  }
                  
                  // Equipment (only for astrophotography)
                  if (isAstrophotography && images[currentImage].equipment && images[currentImage].equipment.trim() !== '') {
                    metadataItems.push(
                      <span key="equipment">{images[currentImage].equipment}</span>
                    );
                  }
                  
                  // Exposure (only for astrophotography)
                  if (isAstrophotography && images[currentImage].exposure && images[currentImage].exposure.trim() !== '') {
                    metadataItems.push(
                      <span key="exposure">{images[currentImage].exposure}</span>
                    );
                  }
                  
                  // Join with bullet separators
                  return metadataItems.map((item, index) => (
                    <React.Fragment key={index}>
                      {item}
                      {index < metadataItems.length - 1 && <span className="text-white/60">•</span>}
                    </React.Fragment>
                  ));
                })()}
              </div>
            </div>

            {/* Image Counter */}
            {images.length > 1 && (
              <div className="mt-3 text-center">
                <span className="text-white/60 text-sm font-light tracking-wide">
                  {currentImage + 1} of {images.length}
                </span>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
      </div>
    </SiteLayout>
  );
}
