// Global Site Configuration
// This file contains all configurable aspects of the site structure, content, and branding

import { observatoryConfig } from './observatory';

// Navigation Configuration
export const navigationConfig = {
  logo: {
    src: '/images/logo/Logo2.avif',
    alt: `${observatoryConfig.name} Logo`,
    width: 300,
    height: 100
  },
  items: [
    { label: 'Home', href: '/' },
    { label: 'Deep Sky', href: '/astrophotography/deep-sky' },
    { label: 'Solar System', href: '/astrophotography/solar-system' },
    { label: 'Terrestrial', href: '/terrestrial' },
    { label: 'Gear', href: '/equipment' },
    { label: 'Mindfulness', href: '/resources' },
    { label: 'Contact', href: '/contact' },
  ]
};

// Sub-Navigation Configuration
export const subNavigationConfig = {
  '/astrophotography/deep-sky': [
    { label: 'Galaxies', href: '/astrophotography/deep-sky/galaxies' },
    { label: 'Nebulas', href: '/astrophotography/deep-sky/nebulas' },
    { label: 'Star Clusters', href: '/astrophotography/deep-sky/star-clusters' },
    { label: 'Hubble Palette', href: '/astrophotography/deep-sky/hubble-palette' },
    { label: 'Wide Field', href: '/astrophotography/deep-sky/wide-field' }
  ],
  '/astrophotography/solar-system': [
    { label: 'Solar', href: '/astrophotography/solar-system/solar' },
    { label: 'Lunar', href: '/astrophotography/solar-system/lunar' },
    { label: 'Planets', href: '/astrophotography/solar-system/planets' },
    { label: 'Celestial Events', href: '/astrophotography/solar-system/events' }
  ],
  '/terrestrial': [
    { label: 'Yellowstone', href: '/terrestrial/yellowstone' },
    { label: 'Grand Tetons', href: '/terrestrial/grand-tetons' }
  ],
  '/resources': [
    { label: 'Astronomy & Astrophotography', href: '/resources/astronomy-astrophotography' },
    { label: 'Mindfulness & Wellbeing', href: '/resources/mindfulness' }
  ]
};

// Homepage Configuration
export const homepageConfig = {
  hero: {
    image: '/images/hero/NGC7000-Pelican-1.jpg',
    alt: 'NGC7000 Pelican Nebula - Maple Valley Observatory',
    title: observatoryConfig.name,
    tagline: observatoryConfig.tagline,
    description: [
      "Ever since I was a child, I've been obsessed with capturing photons from the distant past. Armed with modest gear and my love for astronomy and astrophotography, I set out to absorb light particles in all of their raw form and preserve the beauty of distant planets and deep sky objects forever, adding my interpretation in the painstaking processing of each image.",
      "This site is also a place where I can share the beauty of this planet we live in, so in it you will find my efforts to share the places I have had the good fortune to visit."
    ]
  },
  latestCaptures: {
    title: 'LATEST CAPTURES',
    subtitle: 'Fresh out of the oven. Careful. The plate is very hot!',
    backgroundImage: '/images/assets/NGC2070-Finished.jpg',
    showClearSkyClock: true
  }
};

// Deep Sky Categories Configuration
export const deepSkyConfig = {
  title: 'Deep Sky Objects',
  backgroundImage: '/images/astrophotography/deep-sky/nebulas/North America and The Pelican.jpg',
  description: 'Explore the distant reaches of space with detailed captures of galaxies, nebulas, star clusters, and wide-field views millions of light-years away.',
  categories: [
    {
      title: 'Galaxies',
      href: '/astrophotography/deep-sky/galaxies',
      backgroundImage: '/images/astrophotography/deep-sky/galaxies/M33 - The Triangulum Galaxy.jpg',
      description: 'Distant island universes beyond our Milky Way',
      imageFolder: 'astrophotography/deep-sky/galaxies'
    },
    {
      title: 'Nebulas',
      href: '/astrophotography/deep-sky/nebulas',
      backgroundImage: '/images/astrophotography/deep-sky/nebulas/North America and The Pelican.jpg',
      description: 'Stellar nurseries and cosmic clouds of gas and dust',
      imageFolder: 'astrophotography/deep-sky/nebulas'
    },
    {
      title: 'Star Clusters',
      href: '/astrophotography/deep-sky/star-clusters',
      backgroundImage: '/images/astrophotography/deep-sky/star-clusters/M45 - Pleiades.jpg',
      description: 'Gravitationally bound groups of stars',
      imageFolder: 'astrophotography/deep-sky/star-clusters'
    },
    {
      title: 'Hubble Palette',
      href: '/astrophotography/deep-sky/hubble-palette',
      backgroundImage: '/images/astrophotography/deep-sky/Hubble-Palette/NGC7000 and IC5070-2.jpg',
      description: 'Images processed using the Hubble Space Telescope color palette',
      imageFolder: 'astrophotography/deep-sky/Hubble-Palette'
    },
    {
      title: 'Wide Field',
      href: '/astrophotography/deep-sky/wide-field',
      backgroundImage: '/images/astrophotography/deep-sky/wide-field/Orion-wide-death-valley.jpg',
      description: 'Expansive views of constellations and star fields',
      imageFolder: 'astrophotography/deep-sky/wide-field'
    }
  ]
};

// Solar System Categories Configuration
export const solarSystemConfig = {
  title: 'Solar System',
  backgroundImage: '/images/assets/NGC7000-Pelican-1.jpg',
  description: 'Explore our cosmic neighborhood with detailed captures of the Sun, Moon, planets, and celestial events within our solar system.',
  categories: [
    {
      title: 'Solar',
      href: '/astrophotography/solar-system/solar',
      backgroundImage: '/images/astrophotography/solar-system/solar/Sun.jpg',
      description: 'The Sun, solar eclipses, and solar phenomena',
      imageFolder: 'astrophotography/solar-system/solar'
    },
    {
      title: 'Lunar',
      href: '/astrophotography/solar-system/lunar',
      backgroundImage: '/images/astrophotography/solar-system/lunar/Full Moon.jpg',
      description: 'Moon phases and surface details',
      imageFolder: 'astrophotography/solar-system/lunar'
    },
    {
      title: 'Planets',
      href: '/astrophotography/solar-system/planets',
      backgroundImage: '/images/astrophotography/solar-system/planets/Hubble and Me.jpg',
      description: 'Jupiter, Saturn, Mars, and other planetary bodies',
      imageFolder: 'astrophotography/solar-system/planets'
    },
    {
      title: 'Celestial Events',
      href: '/astrophotography/solar-system/events',
      backgroundImage: '/images/astrophotography/solar-system/events/total-eclipse-2017/Eclipse2017.jpg',
      description: 'Eclipses, conjunctions, transits, and rare astronomical events',
      imageFolder: 'astrophotography/solar-system/events'
    }
  ]
};

// Celestial Events Categories Configuration
export const celestialEventsConfig = {
  title: 'Celestial Events',
  backgroundImage: '/images/astrophotography/solar-system/events/total-eclipse-2017/Eclipse2017.jpg',
  description: 'Capture rare and spectacular astronomical events including eclipses, conjunctions, transits, and other celestial phenomena.',
  categories: [
    {
      title: 'Total Eclipse 2017',
      href: '/astrophotography/solar-system/events/total-eclipse-2017',
      backgroundImage: '/images/astrophotography/solar-system/events/total-eclipse-2017/Eclipse2017.jpg',
      description: 'The Great Eclipse of August 21, 2017',
      imageFolder: 'astrophotography/solar-system/events/total-eclipse-2017'
    }
  ]
};

// Terrestrial Categories Configuration
export const terrestrialConfig = {
  title: 'Terrestrial Photography',
  backgroundImage: '/images/terrestrial/yellowstone/Upper Basin1.jpg',
  description: 'Capturing the natural beauty of our planet, from the geothermal wonders of Yellowstone to the majestic peaks of the Grand Tetons.',
  categories: [
    {
      title: 'Yellowstone',
      href: '/terrestrial/yellowstone',
      backgroundImage: '/images/terrestrial/yellowstone/Midway Basin1.jpg', // Replace with actual Yellowstone image
      description: 'Geysers, hot springs, and wildlife of America\'s first national park',
      imageFolder: 'terrestrial/yellowstone'
    },
    {
      title: 'Grand Tetons',
      href: '/terrestrial/grand-tetons',
      backgroundImage: '/images/terrestrial/grand-tetons/Grand Tetons1.jpg', // Replace with actual Tetons image
      description: 'Majestic peaks and alpine landscapes of Wyoming',
      imageFolder: 'terrestrial/grand-tetons'
    }
  ]
};

// Equipment Page Configuration
export const equipmentConfig = {
  title: 'MY GEAR',
  backgroundImage: '/images/assets/NGC7000-Pelican-1.jpg',
  imageFolder: 'equipment',
  description: observatoryConfig.equipmentDescription
};

// Gallery Image Folders Configuration
export const imageFoldersConfig = {
  featured: 'astrophotography/featured',
  deepSky: {
    galaxies: 'astrophotography/deep-sky/galaxies',
    nebulas: 'astrophotography/deep-sky/nebulas',
    starClusters: 'astrophotography/deep-sky/star-clusters',
    wideField: 'astrophotography/deep-sky/wide-field'
  },
  solarSystem: {
    solar: 'astrophotography/solar-system/solar',
    lunar: 'astrophotography/solar-system/lunar',
    planets: 'astrophotography/solar-system/planets',
    events: 'astrophotography/solar-system/events'
  },
  celestialEvents: {
    totalEclipse2017: 'astrophotography/solar-system/events/total-eclipse-2017'
  },
  terrestrial: {
    yellowstone: 'terrestrial/yellowstone',
    grandTetons: 'terrestrial/grand-tetons'
  },
  equipment: 'equipment'
};

// Styling and Theme Configuration
export const styleConfig = {
  colors: {
    primary: '#FFD700', // Gold/Yellow
    secondary: '#FFFFFF',
    background: '#000000',
    overlay: 'rgba(0, 0, 0, 0.5)'
  },
  typography: {
    titleTracking: '0.2em',
    fontWeights: {
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700
    },
    navigation: {
      fontSize: '1rem', // 16px - base size for better readability
      fontWeight: 400,   // Normal weight instead of light
      letterSpacing: '0.025em' // Subtle letter spacing
    }
  },
  layout: {
    maxWidth: '6xl', // Tailwind class
    cardAspectRatio: '3/4', // For portrait gallery cards
    squareCardSize: '288px' // For category cards
  }
};

// Resources Configuration
export const resourcesConfig = {
  title: 'Resources',
  backgroundImage: '/images/astrophotography/deep-sky/nebulas/North America and The Pelican.jpg',
  description: 'Curated resources for astronomy, astrophotography, mindfulness, and wellbeing. Discover guides, articles, and tools to enhance your journey.',
  categories: [
    {
      title: 'Astronomy & Astrophotography',
      href: '/resources/astronomy-astrophotography',
      backgroundImage: '/images/astrophotography/deep-sky/nebulas/North America and The Pelican.jpg',
      description: 'Guides, tools, and communities for exploring the cosmos',
      imageFolder: 'resources/astronomy-astrophotography'
    },
    {
      title: 'Mindfulness & Wellbeing',
      href: '/resources/mindfulness',
      backgroundImage: '/images/astrophotography/deep-sky/galaxies/M33 - The Triangulum Galaxy.jpg',
      description: 'Resources for meditation, contemplation, and inner peace',
      imageFolder: 'resources/mindfulness'
    }
  ]
};

// Default export combines all configurations
export const globalConfig = {
  observatory: observatoryConfig,
  navigation: navigationConfig,
  subNavigation: subNavigationConfig,
  homepage: homepageConfig,
  deepSky: deepSkyConfig,
  solarSystem: solarSystemConfig,
  celestialEvents: celestialEventsConfig,
  terrestrial: terrestrialConfig,
  equipment: equipmentConfig,
  resources: resourcesConfig,
  imageFolders: imageFoldersConfig,
  style: styleConfig,
  wideField: deepSkyConfig.categories[4] // Wide Field category
};

export default globalConfig;
