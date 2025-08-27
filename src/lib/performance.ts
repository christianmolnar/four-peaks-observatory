// Core Web Vitals and Performance Optimization Utilities

// Image optimization settings
export const IMAGE_OPTIMIZATION = {
  // Quality settings for different contexts
  quality: {
    thumbnail: 75,
    gallery: 85,
    hero: 90,
    background: 80,
  },
  
  // Responsive image sizes for Next.js Image component
  sizes: {
    thumbnail: '(max-width: 640px) 150px, (max-width: 768px) 200px, 250px',
    gallery: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
    hero: '100vw',
    background: '100vw',
  },
  
  // Preload priority images
  preload: {
    hero: true,
    firstFew: 3, // Preload first 3 gallery images
  }
};

// Lazy loading intersection observer options
export const LAZY_LOADING_OPTIONS = {
  rootMargin: '50px 0px', // Start loading 50px before element enters viewport
  threshold: 0.1,
};

// Performance monitoring for Core Web Vitals
export function reportWebVitals(metric: {
  name: string;
  value: number;
  id: string;
  rating: 'good' | 'needs-improvement' | 'poor';
}) {
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`${metric.name}: ${metric.value}`);
  }
  
  // Send to analytics in production
  if (process.env.NODE_ENV === 'production') {
    // You can send metrics to your analytics service here
    // Example: Google Analytics 4, Vercel Analytics, etc.
    
    // For Vercel Analytics (already included in layout)
    // The SpeedInsights component automatically handles this
    
    // For custom analytics:
    // analytics.track('Web Vital', {
    //   metric_name: metric.name,
    //   metric_value: metric.value,
    //   metric_id: metric.id,
    //   metric_rating: metric.rating,
    // });
  }
}

// Optimize images for better Core Web Vitals
export function getOptimizedImageProps(
  src: string,
  context: 'thumbnail' | 'gallery' | 'hero' | 'background' = 'gallery',
  priority: boolean = false
) {
  return {
    quality: IMAGE_OPTIMIZATION.quality[context],
    sizes: IMAGE_OPTIMIZATION.sizes[context],
    priority,
    placeholder: 'blur' as const,
    blurDataURL: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmkn//Z',
  };
}

// Preload critical resources
export function preloadCriticalResources() {
  // Preload critical fonts (if not using next/font)
  const preloadLink = document.createElement('link');
  preloadLink.rel = 'preload';
  preloadLink.as = 'font';
  preloadLink.type = 'font/woff2';
  preloadLink.crossOrigin = 'anonymous';
  preloadLink.href = '/fonts/poppins-v20-latin-200.woff2'; // Adjust path as needed
  document.head.appendChild(preloadLink);
}

// Optimize Cumulative Layout Shift (CLS)
export function preventLayoutShift() {
  // Add CSS to prevent layout shift during image loading
  const style = document.createElement('style');
  style.textContent = `
    .gallery-image-container {
      aspect-ratio: 4/3; /* Default aspect ratio for gallery images */
      background-color: #1a1a1a; /* Dark placeholder */
    }
    
    .hero-image-container {
      aspect-ratio: 16/9; /* Hero image aspect ratio */
      background-color: #000;
    }
    
    .thumbnail-container {
      aspect-ratio: 1/1; /* Square thumbnails */
      background-color: #2a2a2a;
    }
  `;
  document.head.appendChild(style);
}

// Resource hints for better performance
export function addResourceHints() {
  // DNS prefetch for external domains
  const dnsPrefetch = [
    'https://fonts.googleapis.com',
    'https://www.google-analytics.com',
    'https://vitals.vercel-insights.com',
  ];
  
  dnsPrefetch.forEach(domain => {
    const link = document.createElement('link');
    link.rel = 'dns-prefetch';
    link.href = domain;
    document.head.appendChild(link);
  });
  
  // Preconnect to critical third-party origins
  const preconnect = [
    'https://fonts.gstatic.com',
  ];
  
  preconnect.forEach(origin => {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
}

// Initialize performance optimizations
export function initPerformanceOptimizations() {
  if (typeof window !== 'undefined') {
    // Run optimizations after DOM is loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        preventLayoutShift();
        addResourceHints();
      });
    } else {
      preventLayoutShift();
      addResourceHints();
    }
  }
}

// Monitor and optimize Largest Contentful Paint (LCP)
export function optimizeLCP() {
  // Ensure hero images are optimized and prioritized
  const heroImages = document.querySelectorAll('[data-hero-image]');
  heroImages.forEach(img => {
    if (img instanceof HTMLImageElement) {
      img.loading = 'eager';
      img.fetchPriority = 'high';
    }
  });
}

// Optimize First Input Delay (FID) by avoiding long tasks
export function optimizeFID() {
  // Use requestIdleCallback for non-critical tasks
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      // Perform non-critical initialization here
      console.log('Performing non-critical initialization during idle time');
    });
  }
}

// Service Worker registration for offline support and caching
export function registerServiceWorker() {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  }
}
