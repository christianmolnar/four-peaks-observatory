// Global Site Configuration
// This file contains all configurable aspects of the site structure, content, and branding

import { observatoryConfig } from './observatory';

// Navigation Configuration
export const navigationConfig = {
  logo: {
    src: '/images/logo/Logo.png',
    alt: `${observatoryConfig.name} Logo`,
    width: 1352,
    height: 349
  },
  items: [
    { label: 'Home', href: '/' },
    { label: 'Deep Sky', href: '/astrophotography/deep-sky' },
    { label: 'Solar System', href: '/astrophotography/solar-system' },
    { label: 'Smart Telescopes', href: '/smart-telescopes' },
    { label: 'Terrestrial', href: '/terrestrial' },
    { label: 'Gear', href: '/equipment' },
    { label: 'Good Stuff', href: '/resources' },
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
    { label: 'ZWO SeeStar S50 Pro', href: '/smart-telescopes/zwo-seestar-s50-pro' },
    { label: 'ZWO SeeStar S30 Pro', href: '/smart-telescopes/zwo-seestar-s30-pro' },
    { label: 'Unistellar Odyssey', href: '/smart-telescopes/unistellar-odyssey' },
    { label: 'Dwarflab Dwarf 3', href: '/smart-telescopes/dwarflab-dwarf-3' },
  ]
};

// Homepage Configuration
export const homepageConfig = {
  hero: {
    image: '/images/astrophotography/deep-sky/Hubble-Palette/NGC7000 and IC5070-2.jpg',
    alt: 'NGC7000 Pelican Nebula - Four Peaks Observatory',
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
    backgroundImage: '/images/hero/m45-hero.jpg',
    showClearSkyClock: false
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
    },
    {
      title: 'Essays & Perspectives',
      href: '/resources/the-machine-does-not-need-to-wake-up',
      backgroundImage: '/images/articles/the-machine-does-not-need-to-wake-up/ai-quantum.jpg',
      description: 'Longer-form writing on AI, consciousness, and risk',
      imageFolder: 'resources/essays'
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
      backgroundImage: '/images/equipment/smart/s50.png',
      categoryImages: {
        'deep-sky': '/images/astrophotography/deep-sky/nebulas/Heart and Soul Nebulas-4.jpg',
        'solar-system': '/images/astrophotography/deep-sky/nebulas/Heart and Soul Nebulas-4.jpg',
      },
      description: 'The versatile all-rounder — powerful enough for challenging targets, light enough to take anywhere.',
      intro: 'The ZWO SeeStar S50 is the sweet spot in the smart telescope market — a 50mm f/5 all-in-one instrument that punches well above its size. With a built-in dual-band light pollution filter, automated polar alignment, and a sophisticated stacking engine, the S50 consistently delivers publication-worthy results of nebulas, galaxies, and star clusters straight from the app. Its EQ mode and WiFi Station integration make it equally at home on a backyard patio or a remote dark sky site.',
      specs: {
        aperture: '50mm f/5',
        focalLength: '250mm',
        sensor: 'Sony IMX462 (color)',
        fov: '0.73° × 1.29°',
        weight: '2.5 kg',
        filter: 'Built-in dual-band (Ha/OIII)',
        power: 'USB-C, 5V/3A',
        connectivity: 'WiFi (AP & Station mode)',
        extras: 'Built-in dew heater, EQ mode, mosaic, plan mode',
        pricingNew: 'Not available (discontinued/sold out — superseded by S50 Pro)',
        pricingUsed: '~$350–$450 USD',
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
        'Now superseded by the S50 Pro',
        'Hard to find in stock — high demand, limited availability',
        'Older Sony IMX462 sensor — due for an update',
        'Slightly larger and heavier than the S30, though still remarkably portable',
        'WiFi Station mode can be finicky to set up and occasionally drops',
        'Not usable for planets — focal length too short for planetary detail',
        'Stacking solution is good but not best-in-class compared to dedicated software',
      ],
    },
    {
      slug: 'zwo-seestar-s50-pro',
      title: 'ZWO SeeStar S50 Pro',
      equipmentMatch: 'SeeStar S50 Pro',
      href: '/smart-telescopes/zwo-seestar-s50-pro',
      // TODO: replace with an actual equipment photo of the S50 Pro
      backgroundImage: '/images/equipment/smart/s50.png',
      categoryImages: {
        'deep-sky': '/images/astrophotography/deep-sky/nebulas/Heart and Soul Nebulas-4.jpg',
        'solar-system': '/images/astrophotography/deep-sky/nebulas/Heart and Soul Nebulas-4.jpg',
      },
      description: 'The next-generation flagship — a larger sensor, dual-lens design, and pro-grade tracking for serious deep sky work.',
      intro: 'The ZWO SeeStar S50 Pro is a significant leap over the original S50: a larger 1/1.2" telephoto sensor paired with a dedicated 4K wide-angle camera, a 4-element apochromatic lens with ED glass, and a triple filter system (light pollution, dark frame, and IR-cut). A new 10,000mAh battery delivers up to 9 hours of runtime, and the upgraded two-section tripod adds far more flexibility in the field. Equatorial Mode enables longer, smoother tracked exposures, while the wide-angle camera unlocks one-tap Milky Way arch stitching and 8K panoramas that the standard S50 simply can\'t do.',
      specs: {
        aperture: 'Telephoto: 50mm f/5.2 · Wide-angle: 3.4mm f/1.75',
        focalLength: 'Telephoto: 260mm (880mm equiv.) · Wide-angle: 6mm (35mm equiv.)',
        sensor: 'Telephoto: OmniVision OS08B10, 1/1.2" (8.3MP) · Wide-angle: Sony IMX586 (8.3MP)',
        fov: 'Telephoto: 2.8° (portrait) · Wide-angle: 63° (portrait)',
        weight: '2.8 kg',
        filter: 'Dual-band (OIII 30nm/Hα 20nm) + dark frame + UV/IR-cut (telephoto); UV/IR-cut (wide-angle)',
        power: 'USB-C, 5V/3A or 12V/3A',
        connectivity: 'WiFi (5GHz/2.4GHz), Bluetooth, USB-C',
        extras: '10,000mAh battery (~9h runtime), 128GB storage, Equatorial Mode, Plan Mode, ASCOM Alpaca support, dual 4K cameras',
        pricingNew: '~$899–$999 USD (launch pricing)',
        pricingUsed: 'Not yet available on the used market (2026 release)',
      },
      pros: [
        'Larger telephoto sensor than the S50 — noticeably more detail on deep sky targets',
        'Dedicated wide-angle 4K camera enables one-tap Milky Way arch and 8K panorama stitching',
        'Triple filter system (light pollution + dark frame + IR-cut) improves signal quality',
        'Massive 10,000mAh battery — up to 9 hours of unattended imaging',
        '128GB of onboard storage (~100GB usable)',
        'ASCOM Alpaca support opens the door to N.I.N.A. and other advanced astro software',
        'Upgraded two-section tripod with more angle flexibility',
        'Equatorial Mode plus Plan Mode for fully unattended overnight sessions',
      ],
      cons: [
        'New and expensive relative to the standard S50 and S30 Pro',
        'Larger and heavier than the S30 Pro — less pocketable',
        'Very new to market — limited real-world track record and used pricing data',
        'Same focal length constraints as other SeeStars — not built for planetary imaging',
      ],
    },
    {
      slug: 'zwo-seestar-s30-pro',
      title: 'ZWO SeeStar S30 Pro',
      equipmentMatch: 'SeeStar S30 Pro',
      href: '/smart-telescopes/zwo-seestar-s30-pro',
      // TODO: replace with an actual equipment photo of the S30 Pro
      backgroundImage: '/images/equipment/smart/s30-pro.png',
      categoryImages: {
        'deep-sky': '/images/astrophotography/deep-sky/nebulas/Heart and Soul Nebulas-4.jpg',
        'solar-system': '/images/astrophotography/deep-sky/nebulas/Heart and Soul Nebulas-4.jpg',
      },
      description: 'The ultimate travel scope — dual 4K cameras, a bigger sensor, and pro-grade tracking in a bottle-sized, featherweight body.',
      intro: 'The ZWO SeeStar S30 Pro upgrades the original S30 with a dual-lens 4K camera system: a 30mm telephoto with a 1/1.2" sensor (4x the surface area of the standard S30) plus a wide-angle 4K camera for panoramas and Milky Way stitching. A 4-element apochromatic lens with ED glass, triple filter system, active anti-dew control, and 128GB of storage round out the upgrades — all while staying just as pocketable at 1.65kg. ASCOM Alpaca support opens the door to N.I.N.A. and other advanced astro software.',
      specs: {
        aperture: 'Tele: 30mm f/5.3 · Wide: 3.4mm f/1.75',
        focalLength: 'Tele: 160mm · Wide: 6mm',
        sensor: 'Tele: Sony IMX585 (8.3MP) · Wide: Sony IMX586 (8.3MP)',
        fov: 'Tele: 4.6° · Wide: 63°',
        weight: '1.65 kg',
        filter: 'Dual-band (OIII 30nm/Hα 20nm) + UV/IR-cut + dark field',
        power: 'USB-C',
        connectivity: 'Dual-band WiFi (2.4G/5G), Bluetooth',
        extras: '128GB storage, Equatorial Mode, Plan Mode, ASCOM Alpaca support, active anti-dew control, dual 4K cameras, Milky Way stitching',
        pricingNew: '~$699 USD',
        pricingUsed: 'Limited used market data (recent release)',
      },
      pros: [
        'Best in class for large deep sky objects — the wide FOV is a superpower for big nebulas',
        'Larger telephoto sensor than the base S30 — 4x the sensor area, noticeably more detail',
        'Dedicated 4K wide-angle camera enables Milky Way arch and mosaic stitching',
        'Triple filter system improves signal quality on deep-sky targets',
        '128GB of onboard storage',
        'ASCOM Alpaca support opens the door to N.I.N.A. and other advanced astro software',
        'Active anti-dew control keeps optics clear on long sessions',
        'Still the size and weight of a soda bottle — extremely portable',
        'Equatorial Mode (with TH10 mount) plus Plan Mode for unattended sessions',
      ],
      cons: [
        'Requires the separate TH10 mount/tripod accessory for full EQ mode functionality',
        'Very new to market — limited real-world track record and used pricing data',
        'Same focal length constraints as other SeeStars — not built for planetary imaging',
        'The wide field of view means you run out of good targets to image sooner',
        'Milky Way / wide sky mode does not work reliably yet — ZWO is reportedly fixing this',
      ],
    },
    {
      slug: 'unistellar-odyssey',
      title: 'Unistellar Odyssey',
      equipmentMatch: 'Unistellar Odyssey',
      href: '/smart-telescopes/unistellar-odyssey',
      backgroundImage: '/images/equipment/smart/unistellar.png',
      categoryImages: {
        'deep-sky': '/images/astrophotography/deep-sky/nebulas/Heart and Soul Nebulas-4.jpg',
        'solar-system': '/images/astrophotography/deep-sky/nebulas/Heart and Soul Nebulas-4.jpg',

      },
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
        pricingNew: '~$2,599 USD (Odyssey Pro w/ Nikon eyepiece: ~$4,599 USD)',
        pricingUsed: '~$1,500–$1,900 USD',
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
    {
      slug: 'dwarflab-dwarf-3',
      title: 'Dwarflab Dwarf 3',
      equipmentMatch: 'Dwarflab Dwarf 3',
      href: '/smart-telescopes/dwarflab-dwarf-3',
      // TODO: replace with an actual equipment photo of the Dwarf 3
      backgroundImage: '/images/equipment/smart/s30-pro.png',
      categoryImages: {
        'deep-sky': '/images/astrophotography/deep-sky/nebulas/Heart and Soul Nebulas-4.jpg',
        'solar-system': '/images/astrophotography/deep-sky/nebulas/Heart and Soul Nebulas-4.jpg',
      },
      description: 'A dictionary-sized, budget-friendly all-rounder — dual-lens imaging with a surprisingly capable Sony Starvis 2 sensor.',
      intro: 'The Dwarflab Dwarf 3 packs a 6-element apochromatic dual-camera lens group into a body about the size of a dictionary, weighing just 1.35 kg. Its 1/1.8" Sony IMX678 Starvis 2 telephoto sensor offers excellent quantum efficiency and low read noise for its price point, while a companion wide-angle lens handles panoramas and landscape astrophotography. With a 3° field of view, 60-second exposures, Equatorial Mount Mode, and switchable VIS/Astro/Dual-Band filters, the Dwarf 3 punches well above its ~$549 price — making it one of the most accessible serious smart telescopes on the market.',
      specs: {
        aperture: 'Telephoto: 1/1.8" · Wide-angle: 1/2.8"',
        focalLength: 'Telephoto: 150mm (737mm equiv.) · Wide-angle: 6.7mm (45mm equiv.)',
        sensor: 'Telephoto: Sony IMX678 Starvis 2 (8.3MP) · Wide-angle: Sony IMX307 (2MP)',
        fov: 'Telephoto: 3.38° diagonal · Wide-angle: 50.6° diagonal',
        weight: '1.35 kg',
        filter: 'Switchable VIS / Astro (IR-pass) / Dual-Band (OIII 500.7nm + Hα 656.3nm)',
        power: 'USB-C, supports external USB charging',
        connectivity: 'WiFi & Bluetooth (up to 20m), NFC quick pairing',
        extras: 'Built-in 10,000mAh battery (~5.5h), 128GB storage, Equatorial Mount Mode, up to 60s exposures, mosaic mode, RTSP streaming',
        pricingNew: '~$549 USD',
        pricingUsed: 'Limited used market data (recent release)',
      },
      pros: [
        'Exceptional value — most affordable serious smart telescope in this lineup',
        'Sony IMX678 Starvis 2 sensor delivers excellent low-light sensitivity and low noise',
        '60-second exposures supported in Equatorial Mount Mode',
        'Dual-band, astro, and standard filters switchable directly on the device',
        'Very portable at 1.35 kg — comparable to the SeeStar S30 Pro',
        'Multiple export formats (JPG, PNG, FITS, TIFF) for serious post-processing',
        'NFC one-touch pairing speeds up setup',
        'IP54 dust/moisture resistance for outdoor use',
      ],
      cons: [
        'Smaller aperture limits reach on fainter, smaller deep-sky targets',
        'Shorter battery life (~5.5h) than SeeStar competitors',
        'Newer brand with a smaller community and less third-party support than ZWO',
        'Not usable for planetary imaging — focal length too short',
        'App and ecosystem less mature than ZWO\'s SeeStar app',
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
