'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import metadata from '@/data/metadata.json';

interface ImageData {
  src: string;
  alt: string;
  filename: string;
  catalogDesignation: string;
  objectName: string;
  location: string;
  // Split equipment fields (new)
  ota?: string;
  camera?: string;
  mount?: string;
  // Legacy combined field (fallback)
  equipment: string;
  exposure: string;
  description?: string;
}

/** Concatenates non-blank ota / camera / mount, falls back to equipment string */
function buildEquipmentString(img: { ota?: string; camera?: string; mount?: string; equipment: string }): string {
  const parts = [img.ota, img.camera, img.mount].filter(s => s && s.trim());
  if (parts.length > 0) return parts.join(' · ');
  return img.equipment?.trim() || '';
}

// Dynamically import all images from the featured folder
function getFeaturedImages(): ImageData[] {
  // @ts-expect-error - require.context is a webpack-specific function
  const context = require.context('../../public/images/astrophotography/featured', false, /\.(jpg|jpeg|png|avif|webp)$/);
  return context.keys().map((key: string) => {
    const src = key.replace(/^\./, '/images/astrophotography/featured');
    const filename = src.split('/').pop() || '';
    const alt = filename.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '') || 'Astrophotography';
    const imageMetadata = metadata[filename as keyof typeof metadata] || {
      catalogDesignation: '',
      objectName: filename.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '').toUpperCase(),
      location: 'Maple Valley, WA',
      equipment: 'SeeStar S50',
      exposure: 'Unknown'
    };
    return { src, alt, filename, ...imageMetadata };
  });
}

const images = getFeaturedImages();

// ...existing code...
export default function LatestCapturesCarousel() {
  const [autoScroll, setAutoScroll] = useState(true);
  const goTo = (idx: number) => setCurrent(idx);
  const [current, setCurrent] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const length = images.length;

  useEffect(() => {
    if (modalOpen || !autoScroll) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % length);
    }, 4000);
    return () => clearInterval(timer);
  }, [length, modalOpen, autoScroll]);
  
  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);

  const nextImage = useCallback(() => {
    setCurrent((prev) => (prev + 1) % length);
  }, [length]);

  const prevImage = useCallback(() => {
    setCurrent((prev) => (prev - 1 + length) % length);
  }, [length]);

  // Full-screen functions
  const toggleFullScreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      // Enter full-screen
      try {
        await document.documentElement.requestFullscreen();
        setIsFullScreen(true);
      } catch (err) {
        console.error('Error attempting to enable fullscreen:', err);
      }
    } else {
      // Exit full-screen
      try {
        await document.exitFullscreen();
        setIsFullScreen(false);
      } catch (err) {
        console.error('Error attempting to exit fullscreen:', err);
      }
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard navigation for modal
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
        case 'f':
        case 'F':
          toggleFullScreen();
          break;
      }
    };

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [modalOpen, nextImage, prevImage, toggleFullScreen]);

  return (
    <section className="w-full flex flex-col items-center py-2">
      {/* Gallery container - Enhanced for mobile responsiveness */}
      <div
        className="relative w-full max-w-4xl mx-auto flex items-center justify-center mt-4 md:mt-8"
        style={{ minHeight: '400px', height: '50vh', maxHeight: '600px' }}
      >
        <div
          className="flex items-center justify-center w-full h-full gap-2 md:gap-4"
          style={{ position: 'relative', zIndex: 2, height: '100%', alignItems: 'center', justifyContent: 'center' }}
        >
          {/* Left Image - previous */}
          <div className="hidden md:block" style={{ width: '220px', height: '320px', zIndex: 1 }}>
            <Image
              src={images[(current - 1 + length) % length].src}
              alt={images[(current - 1 + length) % length].alt}
              width={220}
              height={320}
              className="object-contain w-full h-full"
              quality={95}
              draggable={false}
            />
          </div>
          {/* Left Chevron */}
          <button
            onClick={() => {
              setAutoScroll(false);
              setCurrent((current - 1 + length) % length);
            }}
            className="mx-1 md:mx-2 text-white text-2xl md:text-4xl font-bold bg-black/60 rounded-full px-2 py-1 hover:bg-yellow-400/80 transition-colors z-10 touch-manipulation"
            aria-label="Previous image"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.3)', height: '40px', minHeight: '40px' }}
          >
            {'<'}
          </button>
          {/* Center Image - current - Enhanced for mobile */}
          <div 
            className="flex-1 max-w-[300px] md:max-w-[600px] h-full flex items-center justify-center z-2 cursor-pointer" 
            onClick={openModal}
            style={{ zIndex: 2 }}
          >
            <Image
              src={images[current].src}
              alt={images[current].alt}
              width={600}
              height={810}
              className="object-contain w-full h-full cursor-pointer"
              quality={98}
              draggable={false}
            />
          </div>
          {/* Right Chevron */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setAutoScroll(false);
              setCurrent((current + 1) % length);
            }}
            className="mx-1 md:mx-2 text-white text-2xl md:text-4xl font-bold bg-black/60 rounded-full px-2 py-1 hover:bg-yellow-400/80 transition-colors z-10 touch-manipulation"
            aria-label="Next image"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.3)', height: '40px', minHeight: '40px' }}
          >
            {'>'}
          </button>
          {/* Right Image - next */}
          <div className="hidden md:block" style={{ width: '220px', height: '320px', zIndex: 1 }}>
            <Image
              src={images[(current + 1) % length].src}
              alt={images[(current + 1) % length].alt}
              width={220}
              height={320}
              className="object-contain w-full h-full"
              quality={95}
              draggable={false}
            />
          </div>
        </div>
        {/* Dots */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2 z-20">
          {images.map((_: ImageData, idx: number) => (
            <button
              key={idx}
              onClick={() => goTo(idx)}
              className={`w-3 h-3 rounded-full ${idx === current ? 'bg-yellow-400' : 'bg-white/40'} transition-colors`}
              aria-label={`Go to image ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Modal rendered as a portal to document.body for complete independence */}
      {modalOpen && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 flex items-center justify-center bg-black/95 backdrop-blur-lg"
          style={{ 
            zIndex: 99999,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0
          }}
        >
          {/* Close button with elegant, subtle design */}
          <button
            onClick={closeModal}
            className="absolute top-2 right-2 text-white/80 hover:text-white text-2xl font-light bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-all duration-300 ease-out"
            aria-label="Close full screen image"
            style={{ 
              zIndex: 100000,
              position: 'absolute',
              top: '8px',
              right: '8px',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: '18px',
              fontWeight: 300
            }}
          >
            ✕
          </button>

          {/* Full-screen button */}
          <button
            onClick={toggleFullScreen}
            className="absolute top-2 right-12 text-white/80 hover:text-white text-2xl font-light bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-all duration-300 ease-out"
            aria-label={isFullScreen ? "Exit full screen" : "Enter full screen"}
            style={{ 
              zIndex: 100000,
              position: 'absolute',
              top: '8px',
              right: '52px',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: '14px',
              fontWeight: 300
            }}
          >
            {isFullScreen ? (
              // Exit full-screen icon
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
              </svg>
            ) : (
              // Enter full-screen icon
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
              </svg>
            )}
          </button>

          {/* Previous Image Button */}
          {images.length > 1 && (
            <button
              onClick={prevImage}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/80 hover:text-white text-4xl font-light bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-all duration-300 ease-out"
              aria-label="Previous image"
              style={{ 
                zIndex: 100000,
                width: '48px',
                height: '48px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                fontSize: '24px',
                fontWeight: 300
              }}
            >
              ‹
            </button>
          )}

          {/* Next Image Button */}
          {images.length > 1 && (
            <button
              onClick={nextImage}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white/80 hover:text-white text-4xl font-light bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-all duration-300 ease-out"
              aria-label="Next image"
              style={{ 
                zIndex: 100000,
                width: '48px',
                height: '48px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                fontSize: '24px',
                fontWeight: 300
              }}
            >
              ›
            </button>
          )}
          {/* Image and Metadata Container */}
          <div className="flex flex-col items-center justify-center w-full h-full p-6">
            <div className={`relative rounded-2xl overflow-hidden shadow-2xl bg-black ${
              isFullScreen 
                ? 'max-w-[100vw] max-h-[100vh]' 
                : 'max-w-[85vw] max-h-[70vh]'
            }`}>
              <Image
                src={images[current].src}
                alt={images[current].alt}
                width={1400}
                height={1000}
                className="object-contain w-full h-full"
                priority
                style={{ 
                  width: 'auto', 
                  height: 'auto',
                  maxWidth: isFullScreen ? '100vw' : '85vw',
                  maxHeight: isFullScreen ? '100vh' : '70vh',
                  minWidth: '300px'
                }}
              />
            </div>
            
            {/* Metadata Bar - Hidden in full-screen */}
            {!isFullScreen && (
              <div className="mt-6 bg-black/60 backdrop-blur-sm rounded-lg px-6 py-3 border border-white/10">
              <div className="flex flex-wrap items-center justify-center gap-2 text-white/90 text-sm">
                {(() => {
                  const metadataItems = [];
                  
                  // Use trim() to handle empty strings properly
                  const hasCatalogDesignation = images[current].catalogDesignation && images[current].catalogDesignation.trim() !== '';
                  const hasObjectName = images[current].objectName && images[current].objectName.trim() !== '';
                  
                  // Object name (catalog designation + object name or either one)
                  if (hasCatalogDesignation && hasObjectName) {
                    metadataItems.push(
                      <span key="name" className="font-medium tracking-wide">
                        {`${images[current].catalogDesignation} - ${images[current].objectName}`}
                      </span>
                    );
                  } else if (hasCatalogDesignation || hasObjectName) {
                    metadataItems.push(
                      <span key="name" className="font-medium tracking-wide">
                        {images[current].catalogDesignation || images[current].objectName}
                      </span>
                    );
                  }
                  
                  // Location
                  if (images[current].location && images[current].location.trim() !== '') {
                    metadataItems.push(
                      <span key="location">{images[current].location}</span>
                    );
                  }
                  
                  // Equipment
                  const eqStr = buildEquipmentString(images[current]);
                  if (eqStr) {
                    metadataItems.push(
                      <span key="equipment">{eqStr}</span>
                    );
                  }
                  
                  // Exposure
                  if (images[current].exposure && images[current].exposure.trim() !== '') {
                    metadataItems.push(
                      <span key="exposure">{images[current].exposure}</span>
                    );
                  }
                  
                  // Fallback: Ensure every image has at least something to display
                  if (metadataItems.length === 0) {
                    const displayName = images[current].filename
                      ? images[current].filename
                          .replace(/\.[^.]+$/, '') // Remove extension
                          .replace(/[-_]/g, ' ') // Replace dashes and underscores with spaces
                          .replace(/\b\w/g, l => l.toUpperCase()) // Capitalize first letters
                      : 'Featured Image';
                    
                    metadataItems.push(
                      <span key="filename" className="font-medium tracking-wide">
                        {displayName}
                      </span>
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
              
              {/* AI Description - Centered on new line */}
              {images[current].description && (
                <div className="mt-3 text-center">
                  <p className="text-white/80 text-sm leading-relaxed max-w-4xl mx-auto px-2">
                    {images[current].description.replace(/^"|"$/g, '')}
                  </p>
                </div>
              )}
            </div>
            )}

            {/* Image Counter - Hidden in full-screen */}
            {images.length > 1 && !isFullScreen && (
              <div className="mt-3 text-center">
                <span className="text-white/60 text-sm font-light tracking-wide">
                  {current + 1} of {images.length}
                </span>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}