import { Metadata } from 'next';

interface SEOConfig {
  title: string;
  description: string;
  keywords?: string[];
  canonical?: string;
  images?: {
    url: string;
    alt: string;
    width?: number;
    height?: number;
  }[];
  noindex?: boolean;
  category?: 'astrophotography' | 'terrestrial' | 'equipment' | 'resources';
  subcategory?: string;
}

export function generateMetadata(config: SEOConfig): Metadata {
  const {
    title,
    description,
    keywords = [],
    canonical,
    images = [],
    noindex = false,
    category,
    subcategory
  } = config;

  const baseURL = "https://www.fourpeaksobservatory.com";
  const fullTitle = `${title} | Four Peaks Observatory`;
  
  // Base keywords for astrophotography site
  const baseKeywords = [
    "astrophotography",
    "astronomy",
    "telescope",
    "Fountain Hills",
    "Washington",
    "observatory",
    "celestial photography",
    "space photography",
    "night sky"
  ];

  // Category-specific keywords
  const categoryKeywords: Record<string, string[]> = {
    astrophotography: [
      "deep sky objects",
      "nebula",
      "galaxy",
      "star cluster",
      "solar system",
      "astronomical imaging",
      "SeeStar S50",
      "Meade telescope"
    ],
    terrestrial: [
      "landscape photography",
      "nature photography",
      "Yellowstone",
      "Grand Tetons",
      "national parks"
    ],
    equipment: [
      "telescope equipment",
      "astronomy gear",
      "astrophotography setup",
      "telescope reviews"
    ],
    resources: [
      "astronomy resources",
      "astrophotography guide",
      "astronomy education",
      "clear sky clock"
    ]
  };

  // Subcategory-specific keywords
  const subcategoryKeywords: Record<string, string[]> = {
    nebulas: ["emission nebula", "planetary nebula", "reflection nebula", "dark nebula", "NGC", "IC"],
    galaxies: ["spiral galaxy", "elliptical galaxy", "Messier galaxy", "NGC galaxy", "deep space"],
    "star-clusters": ["open cluster", "globular cluster", "Messier cluster", "stellar association"],
    "wide-field": ["wide field astrophotography", "constellation", "Milky Way", "dark sky"],
    "hubble-palette": ["Hubble palette", "narrowband", "SHO", "emission lines", "Ha", "OIII", "SII"],
    solar: ["solar photography", "sun", "solar flares", "sunspots", "solar eclipse"],
    lunar: ["moon photography", "lunar phases", "crater", "lunar surface"],
    planets: ["planetary photography", "Jupiter", "Saturn", "Mars", "Venus", "planetary imaging"],
    events: ["solar eclipse", "lunar eclipse", "transit", "astronomical events"],
    yellowstone: ["Yellowstone National Park", "geysers", "hot springs", "wildlife photography"],
    "grand-tetons": ["Grand Teton National Park", "mountain photography", "alpine lakes"]
  };

  // Combine keywords intelligently
  const allKeywords = [
    ...baseKeywords,
    ...(category ? categoryKeywords[category] || [] : []),
    ...(subcategory ? subcategoryKeywords[subcategory] || [] : []),
    ...keywords
  ];

  // Generate Open Graph image
  const ogImage = images.length > 0 ? images[0] : {
    url: `${baseURL}/images/og-preview.jpg`,
    alt: "Four Peaks Observatory Astrophotography",
    width: 1200,
    height: 675
  };

  const metadata: Metadata = {
    title: fullTitle,
    description,
    keywords: allKeywords,
    alternates: {
      canonical: canonical ? `${baseURL}${canonical}` : undefined,
    },
    openGraph: {
      title: fullTitle,
      description,
      url: canonical ? `${baseURL}${canonical}` : baseURL,
      siteName: "Four Peaks Observatory",
      images: [
        {
          url: `${baseURL}${ogImage.url}`,
          width: ogImage.width || 1200,
          height: ogImage.height || 675,
          alt: ogImage.alt,
        },
      ],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [`${baseURL}${ogImage.url}`],
    },
    robots: {
      index: !noindex,
      follow: !noindex,
      googleBot: {
        index: !noindex,
        follow: !noindex,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };

  return metadata;
}

// Specific generators for common page types
export function generateAstrophysicsMetadata(
  subcategory: string,
  title: string,
  description: string,
  featuredImage?: string
): Metadata {
  return generateMetadata({
    title,
    description,
    canonical: `/astrophotography/deep-sky/${subcategory}`,
    category: 'astrophotography',
    subcategory,
    images: featuredImage ? [{
      url: featuredImage,
      alt: `${title} - Astrophotography by Four Peaks Observatory`,
      width: 1200,
      height: 800
    }] : undefined
  });
}

export function generateSolarSystemMetadata(
  subcategory: string,
  title: string,
  description: string,
  featuredImage?: string
): Metadata {
  return generateMetadata({
    title,
    description,
    canonical: `/astrophotography/solar-system/${subcategory}`,
    category: 'astrophotography',
    subcategory,
    images: featuredImage ? [{
      url: featuredImage,
      alt: `${title} - Astrophotography by Four Peaks Observatory`,
      width: 1200,
      height: 800
    }] : undefined
  });
}

export function generateTerrestrialMetadata(
  location: string,
  title: string,
  description: string,
  featuredImage?: string
): Metadata {
  return generateMetadata({
    title,
    description,
    canonical: `/terrestrial/${location}`,
    category: 'terrestrial',
    subcategory: location,
    images: featuredImage ? [{
      url: featuredImage,
      alt: `${title} - Photography by Four Peaks Observatory`,
      width: 1200,
      height: 800
    }] : undefined
  });
}

// Structured data generators
export function generateImageGalleryStructuredData(
  title: string,
  description: string,
  images: Array<{
    url: string;
    name: string;
    description?: string;
    dateCreated?: string;
    author?: string;
  }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    "name": title,
    "description": description,
    "url": "https://www.fourpeaksobservatory.com",
    "author": {
      "@type": "Organization",
      "name": "Four Peaks Observatory"
    },
    "image": images.map(img => ({
      "@type": "ImageObject",
      "url": `https://www.fourpeaksobservatory.com${img.url}`,
      "name": img.name,
      "description": img.description || `${img.name} - Captured by Four Peaks Observatory`,
      "dateCreated": img.dateCreated,
      "author": {
        "@type": "Organization",
        "name": img.author || "Four Peaks Observatory"
      },
      "contentLocation": {
        "@type": "Place",
        "name": "Fountain Hills, Arizona"
      }
    }))
  };
}

export function generateBreadcrumbStructuredData(breadcrumbs: Array<{
  name: string;
  url: string;
}>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbs.map((crumb, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": crumb.name,
      "item": `https://www.fourpeaksobservatory.com${crumb.url}`
    }))
  };
}
