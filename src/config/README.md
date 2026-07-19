# Global Configuration System

This file centralizes all site configuration, making it extremely easy to customize branding, content structure, navigation, and styling across the entire observatory website.

## Quick Start

All configuration is centralized in `/src/config/global.ts`. Simply modify values in this file to customize:

- **Branding** (site name, tagline, logo)
- **Navigation** (menu items, links)
- **Content Structure** (categories, descriptions)
- **Background Images** (for all pages and cards)
- **Image Folders** (where to find images for each gallery)
- **Styling** (colors, fonts, layouts)

## Configuration Sections

### 1. Observatory Information (`observatory`)
```typescript
// From /src/config/observatory.ts
name: "Four Peaks Observatory"
tagline: "Capturing Photons Since Last Century"
location: { city, state, coordinates }
owner: { name, email, social media }
```

### 2. Navigation (`navigation`)
```typescript
logo: { src, alt, width, height }
items: [
  { label: 'Home', href: '/' },
  { label: 'Deep Sky', href: '/astrophotography/deep-sky' },
  // ... more nav items
]
```

### 3. Homepage Content (`homepage`)
```typescript
hero: {
  image: '/images/hero/NGC7000-Pelican-1.jpg',
  title: observatoryConfig.name,
  tagline: observatoryConfig.tagline,
  description: ["paragraph 1", "paragraph 2"]
}
latestCaptures: {
  title: 'LATEST CAPTURES',
  subtitle: 'Fresh out of the oven...',
  backgroundImage: '/images/assets/NGC2070-Finished.jpg',
  showClearSkyClock: true
}
```

### 4. Category Configurations

#### Deep Sky (`deepSky`)
- Galaxies, Nebulas, Star Clusters
- Each with title, href, backgroundImage, description, imageFolder

#### Solar System (`solarSystem`)
- Solar, Lunar, Planets, Celestial Events
- Note: Lunar eclipses moved to Celestial Events

#### Terrestrial (`terrestrial`)
- Yellowstone, Grand Tetons
- Each with dedicated image folders and backgrounds

### 5. Image Folder Mapping (`imageFolders`)
```typescript
imageFoldersConfig = {
  featured: 'astrophotography/featured',
  deepSky: {
    galaxies: 'astrophotography/galaxies',
    nebulas: 'astrophotography/nebulas',
    starClusters: 'astrophotography/star-clusters'
  },
  // ... etc
}
```

### 6. Styling System (`style`)
```typescript
colors: { primary: '#FFD700', secondary: '#FFFFFF', ... }
typography: { titleTracking: '0.2em', fontWeights: {...} }
layout: { maxWidth: '6xl', cardAspectRatio: '3/4', ... }
```

## How to Customize

### Change Site Branding
1. Update `observatoryConfig.name` and `observatoryConfig.tagline`
2. Replace logo file at `/public/images/logo/Logo2.avif`
3. Update `navigationConfig.logo.src` if using different logo

### Add New Navigation Items
```typescript
// In global.ts
navigationConfig.items.push({
  label: 'Blog',
  href: '/blog'
});
```

### Add New Category
```typescript
// Example: Add "Comets" to Solar System
solarSystemConfig.categories.push({
  title: 'Comets',
  href: '/astrophotography/solar-system/comets',
  backgroundImage: '/images/your-comet-image.jpg',
  description: 'Visitors from the outer solar system',
  imageFolder: 'astrophotography/comets'
});
```

### Change Background Images
```typescript
// For category page backgrounds
deepSkyConfig.backgroundImage = '/images/your-background.jpg';

// For individual category cards
deepSkyConfig.categories[0].backgroundImage = '/images/galaxy-card-bg.jpg';

// For gallery page backgrounds
// This happens automatically from category config
```

### Modify Homepage Content
```typescript
// Change hero image
homepageConfig.hero.image = '/images/hero/your-hero-image.jpg';

// Update description paragraphs
homepageConfig.hero.description = [
  "Your first paragraph about the observatory...",
  "Your second paragraph about terrestrial photography..."
];

// Change Latest Captures section
homepageConfig.latestCaptures.title = 'RECENT WORK';
homepageConfig.latestCaptures.subtitle = 'Hot off the presses!';
```

## File Structure

```
src/config/
├── global.ts          # Main configuration file
├── observatory.ts     # Observatory-specific details
└── README.md         # This documentation

src/components/
├── Navigation.tsx     # Uses globalConfig.navigation
├── CategoryTemplate.tsx
└── GalleryTemplate.tsx

src/app/
├── page.tsx          # Uses globalConfig.homepage
├── astrophotography/
│   ├── deep-sky/
│   │   ├── page.tsx  # Uses globalConfig.deepSky
│   │   ├── galaxies/page.tsx
│   │   ├── nebulas/page.tsx
│   │   └── star-clusters/page.tsx
│   └── solar-system/
│       ├── page.tsx  # Uses globalConfig.solarSystem
│       ├── solar/page.tsx
│       ├── lunar/page.tsx
│       ├── planets/page.tsx
│       └── events/page.tsx
└── terrestrial/
    ├── page.tsx      # Uses globalConfig.terrestrial
    ├── yellowstone/page.tsx
    └── grand-tetons/page.tsx
```

## Benefits of This System

1. **Single Source of Truth**: All configuration in one place
2. **Easy Rebranding**: Change observatory name/location in minutes
3. **Consistent Styling**: Colors and fonts defined once, used everywhere
4. **Flexible Content**: Add/remove categories without touching components
5. **Image Management**: Clear mapping of which images go where
6. **Maintainable**: Components automatically pick up config changes

## Image Organization

```
public/images/
├── hero/                    # Homepage hero images
├── logo/                    # Site logos
├── assets/                  # Background images for sections
├── astrophotography/
│   ├── featured/           # Homepage carousel images
│   ├── galaxies/           # Galaxy gallery images
│   ├── nebulas/            # Nebula gallery images
│   ├── star-clusters/      # Star cluster gallery images
│   ├── solar/              # Solar photography
│   ├── lunar/              # Lunar photography (no eclipses)
│   ├── planets/            # Planetary photography
│   └── events/             # Celestial events (includes eclipses)
├── terrestrial/
│   ├── yellowstone/        # Yellowstone photography
│   └── grand-tetons/       # Grand Tetons photography
└── equipment/              # Equipment/gear images
```

## Migration Notes

- **Lunar Eclipses**: Moved from Lunar to Celestial Events category
- **Background Images**: Now fully configurable for every page and card
- **Gallery Pages**: All connected to category tiles with proper image folder mapping
- **Fallback System**: If category folders don't exist, falls back to featured images

## Future Enhancements

The system is designed to easily support:
- Additional terrestrial locations
- New astrophotography categories
- Blog functionality (currently disabled)
- Print sales integration
- Multi-observatory support
