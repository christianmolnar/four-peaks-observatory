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
    { label: 'Smart Telescopes', href: '/smart-telescopes' },
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
  ],
  '/smart-telescopes': [
    { label: 'ZWO SeeStar S50', href: '/smart-telescopes/zwo-seestar-s50' },
    { label: 'ZWO SeeStar S30', href: '/smart-telescopes/zwo-seestar-s30' },
    { label: 'Unistellar Odyssey', href: '/smart-telescopes/unistellar-odyssey' },
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

// Smart Telescopes Configuration
export const smartTelescopesConfig = {
  title: 'Smart Telescopes',
  backgroundImage: '/images/astrophotography/deep-sky/nebulas/NGC7635 - The Bubble Nebula-Wide.jpg',
  description: 'A new generation of app-controlled smart telescopes has made deep sky imaging accessible to anyone. Explore images captured with ZWO SeeStar and Unistellar instruments — powerful, portable, and remarkably capable.',
  scopes: [
    {
      slug: 'zwo-seestar-s50',
      title: 'ZWO SeeStar S50',
      equipmentMatch: 'SeeStar S50',
      href: '/smart-telescopes/zwo-seestar-s50',
      backgroundImage: '/images/astrophotography/deep-sky/nebulas/SH2-132-The-LobsterClaw.jpg',
      description: 'The versatile all-rounder — powerful enough for challenging targets, light enough to take anywhere.',
      intro: 'The ZWO SeeStar S50 is the sweet spot in the smart telescope market — a 50mm f/5 all-in-one instrument that punches well above its size. With a built-in dual-band light pollution filter, automated polar alignment, and a sophisticated stacking engine, the S50 consistently delivers publication-worthy results of nebulas, galaxies, and star clusters straight from the app. Its EQ mode and WiFi Station integration make it equally at home on a backyard patio or a remote dark sky site.',
      specs: {
        aperture: '50mm f/5',
        focalLength: '250mm',
        sensor: 'Sony IMX462 (color)',
        fov: '1.7° × 1.3°',
        weight: '2.5 kg',
        filter: 'Built-in dual-band (Ha/OIII)',
        power: 'USB-C, 5V/3A',
        connectivity: 'WiFi (AP & Station mode)',
        extras: 'Built-in dew heater, EQ mode, mosaic, plan mode',
        pricingNew: '~$499 USD',
        pricingUsed: '~$350–$420 USD (eBay, Astrobin classifieds)',
      },
      pros: [
        'Best for mid-size deep sky objects — nebulas and galaxies look excellent',
        'Mosaics make it easy to cover larger targets across multiple frames',
        'Plan mode enables fully unattended overnight imaging sessions',
        'Very capable on the Sun and Moon — stunning solar detail',
        'Excellent terrestrial photography, including auto-tracking video',
        'Exceptional price point for what you get',
        'EQ mode significantly improves long-exposure tracking accuracy',
        'WiFi Station mode lets you control it from the house without being outside',
      ],
      cons: [
        'Hard to find in stock — high demand, limited availability',
        'Older Sony IMX462 sensor — due for an update',
        'Slightly larger and heavier than the S30, though still remarkably portable',
        'WiFi Station mode can be finicky to set up and occasionally drops',
        'Not usable for planets — focal length too short for planetary detail',
        'Stacking solution is good but not best-in-class compared to dedicated software',
      ],
    },
    {
      slug: 'zwo-seestar-s30',
      title: 'ZWO SeeStar S30',
      equipmentMatch: 'SeeStar S30',
      href: '/smart-telescopes/zwo-seestar-s30',
      backgroundImage: '/images/astrophotography/deep-sky/nebulas/North America and The Pelican.jpg',
      description: 'The ultimate travel scope — bottle-sized, featherweight, and shockingly good on wide-field targets.',
      intro: 'The ZWO SeeStar S30 Pro is the most portable serious astrophotography instrument ever made. At the size of a large Yeti bottle and weighing next to nothing, it fits in a carry-on, a day pack, or the corner of any bag. The 30mm aperture and wider field of view are ideal for large emission nebulas, sweeping star fields, and grand mosaic projects spanning degrees of sky. The same intelligent stacking engine, plan mode, and app experience as the S50 — in a package you\'ll actually have with you.',
      specs: {
        aperture: '30mm f/5',
        focalLength: '150mm',
        sensor: 'Sony IMX462 (color)',
        fov: '2.8° × 2.1°',
        weight: '1.35 kg',
        filter: 'Built-in dual-band (Ha/OIII)',
        power: 'USB-C, 5V/2A',
        connectivity: 'WiFi (AP & Station mode)',
        extras: 'Built-in dew heater, EQ mode, mosaic, plan mode',
        pricingNew: '~$299 USD (S30 Pro)',
        pricingUsed: '~$200–$260 USD',
      },
      pros: [
        'Best in class for large deep sky objects — the wide FOV is a superpower for big nebulas',
        'Mosaic mode spans enormous swaths of sky in a single session',
        'Plan mode enables fully unattended overnight imaging sessions',
        'Very capable on the Sun and Moon — great solar detail',
        'Excellent terrestrial photography, including auto-tracking video',
        'Exceptional price point — the most accessible serious smart scope available',
        'Most portable smart telescope made — the size and weight of a large Yeti bottle',
        'EQ mode for improved tracking on long exposures',
        'WiFi Station mode for comfortable indoor control',
        'Excellent sky atlas with a polished, intuitive graphical interface for finding objects',
        'Good integrated stacking solution right in the app',
      ],
      cons: [
        'The S30 (non-Pro) is not worth the money — get the S30 Pro',
        'The wide field of view means you run out of good targets to image sooner',
        'Milky Way / wide sky mode does not work reliably yet — ZWO is reportedly fixing this',
        'WiFi Station mode can be finicky and occasionally drops connection',
        'Not usable for planets — focal length too short for planetary detail',
      ],
    },
    {
      slug: 'unistellar-odyssey',
      title: 'Unistellar Odyssey',
      equipmentMatch: 'Unistellar',
      href: '/smart-telescopes/unistellar-odyssey',
      backgroundImage: '/images/astrophotography/deep-sky/nebulas/Heart Nebula.jpg',
      description: 'Premium optics and AI-driven processing — a different philosophy in smart telescope design.',
      intro: 'The Unistellar Odyssey takes a different approach to smart telescoping: a faster f/2 aperture, proprietary Smart Light Pollution Rejection technology, and deep integration with the Unistellar citizen science network. Its AI-driven processing pipeline handles heavy lifting invisibly, delivering beautiful results with minimal user input. The Odyssey also participates in real scientific campaigns — variable star monitoring, asteroid occultations, and exoplanet observations — making it a telescope that contributes to actual astronomical research.',
      specs: {
        aperture: '85mm f/2',
        focalLength: '170mm',
        sensor: 'Sony IMX347 (color, 4MP)',
        fov: '~2.2° × 1.7°',
        weight: '3.5 kg',
        filter: 'Smart Light Pollution Rejection (proprietary)',
        power: 'Internal battery + USB-C',
        connectivity: 'WiFi (AP mode only)',
        extras: 'Citizen science integration, UNISTELLAR network, AI processing',
        pricingNew: '~$999 USD',
        pricingUsed: '~$600–$800 USD',
      },
      pros: [
        'Excellent results on mid-size deep sky objects — nebulas and galaxies look beautiful',
        'Very capable lunar and solar imaging',
        'AI processing pipeline does the heavy lifting — results feel effortless',
        'Fast f/2 aperture collects light quickly',
        'Citizen science integration — contribute to real astronomical research',
      ],
      cons: [
        'Expensive — even used pricing is significantly higher than SeeStar alternatives',
        'Less portable than the SeeStar line — heavier and bulkier',
        'WiFi reliability is inconsistent, especially at distance',
        'No WiFi Station mode — must stay connected directly to the scope\'s AP',
        'No plan mode — cannot schedule unattended imaging sessions',
        'Exporting images from the app is cumbersome and non-intuitive',
        'Sky catalog is more basic — not as strong for browsing and discovering objects',
        'No Milky Way / wide sky imaging mode',
      ],
    },
  ],
  categories: [
    {
      slug: 'deep-sky',
      title: 'Deep Sky',
      subcategoryPrefix: 'deep-sky/',
      description: 'Galaxies, nebulas, star clusters, and deep space objects',
    },
    {
      slug: 'solar-system',
      title: 'Solar System',
      subcategoryPrefix: 'solar-system/',
      description: 'Sun, Moon, planets, and solar system objects',
    },
  ],
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
  smartTelescopes: smartTelescopesConfig,
  imageFolders: imageFoldersConfig,
  style: styleConfig,
  wideField: deepSkyConfig.categories[4] // Wide Field category
};

export default globalConfig;
