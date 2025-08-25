# MapleValleyObservatory.com - Design Document

## Project Overview
A complete redesign of MapleValleyObservatory.com to create a modern, beautiful portfolio website showcasing astrophotography and terrestrial photography using a collection-based approach.

## Brand Identity
- **Site Name**: Maple Valley Observatory
- **Tagline**: "Capturing Photons Since Last Century"
- **Location**: Maple Valley, WA 98038
- **Owner**: Christian Molnar
- **Mission**: "Ever since I was a child, I've been obsessed with capturing photons from the distant past. Armed with modest gear and my love for astronomy and astrophotography, I set out to absorb light particles in all of their raw form and preserve the beauty of distant planets and deep sky objects forever, adding my interpretation in the painstaking processing of each image."

## Site Structure

### 1. Home (`/`)
**Hero Section:**
- Large featured astrophotography image (rotating carousel)
- Site logo and tagline prominently displayed
- Brief introduction paragraph from current site
- Call-to-action buttons: "View Astrophotography" | "Explore Terrestrial"

**Featured Sections:**
- Latest captures (dynamically loads all images from a folder; new images appear automatically)
- Equipment spotlight (SeeStar telescopes)
- Clear Sky Clock widget integration
- Quick stats (total images, years capturing, equipment used)

### 2. Astrophotography (`/astrophotography`)
**Landing Page:**
- Grid overview of all sub-categories with representative images
- Search and filter capabilities
- Sort by: Date, Object Type, Equipment Used

**Sub-categories:**

#### Deep Sky Objects (`/astrophotography/deep-sky`)
- Nebulae (M42 Orion Nebula, Running Man, etc.)
- Galaxies
- Star clusters
- Each image with metadata: equipment, exposure details, processing notes

#### Solar System (`/astrophotography/solar`)
- Sun photography
- Solar eclipses
- Solar features and phenomena
- Moon phases and features
- Planets (Jupiter, Saturn, Mars, etc.)
- Solar system objects

#### Wide Field (`/astrophotography/wide-field`)
- Milky Way photography
- Constellation photography
- Star field images

### 3. Terrestrial Photography (`/terrestrial`)
**Collection-Based Structure:**

#### Collections Overview (`/terrestrial/collections`)
- Grid view of all collections with hero images
- Each collection shows: title, location, date range, image count

**Initial Collections:**
- **National Parks Adventures** (`/terrestrial/collections/national-parks`)
- **Pacific Northwest Landscapes** (`/terrestrial/collections/pacific-northwest`)
- **Maple Valley Local** (`/terrestrial/collections/maple-valley-local`)
- **Seasonal Washington** (`/terrestrial/collections/seasonal`)
- **Wildlife Encounters** (`/terrestrial/collections/wildlife`)

Each collection page includes:
- Collection story/description
- Image gallery with lightbox viewing
- Location map (when applicable)
- Trip details and highlights

### 4. Equipment (`/equipment`)

#### Smart All-In-One Telescopes (`/equipment/smart-telescopes`)
**SeeStar S30:**
- Specifications
- Sample images taken with this equipment
- Use cases and advantages
- Setup and operation notes

**SeeStar S50:**
- Detailed specifications
- Image gallery showcasing capabilities
- Comparison with S30
- User experience and tips

#### Observatory (`/equipment/observatory`)
**Main Observatory Setup:**
- Telescope mounts
- Traditional telescopes
- Camera equipment
- Accessories and filters
- Computer equipment
- Software used for processing

**Equipment Cards Format:**
- Product image
- Specifications
- Personal review/experience
- Sample images taken with each piece
- Purchase links (if affiliate program)

### 5. About (`/about`)
- Extended biography and astronomy journey
- Observatory location and setup details
- Photography philosophy and approach
- Technical methodology
- Clear Sky Clock integration and explanation
- Contact information

### 6. Contact (`/contact`)
- Contact form (Name, Email, Phone, Subject, Message)
- Social media links (Facebook, LinkedIn)
- Location: Maple Valley, WA 98038
- Print sales information (if applicable)
- Commission/collaboration inquiries

## Design Specifications

### Color Palette
**Primary Colors - Deep Space Theme:**
- Deep Space Black: #000000 (pure black backgrounds)
- Space Black: #0a0a0a (subtle variation)
- Dark Gray: #1a1a1a (elevated surfaces)
- Nebula Purple: #6366F1 (highlights and accents)
- Star White: #FFFFFF (primary text)
- Cosmic Gold: #F59E0B (CTAs and highlights)

**Secondary Colors:**
- Meteor Gray: #404040 (secondary text)
- Galaxy Silver: #9CA3AF (borders, subtle elements)
- Aurora Green: #10B981 (success states)

**Configurable Color System:**
- CSS custom properties (CSS variables) for all colors
- True black gradient backgrounds optimized for astrophotography
- Easy brand color customization through design tokens
- Consistent color naming convention
- Location-agnostic theming system

### Typography
**System Font Stack (Apple-inspired):**
- **Primary Font**: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif`
- **Fallback Chain**: `"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- **Complete Stack**: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

**Font Usage:**
- **Headings**: SF Pro Display style (larger, bolder weights)
- **Body Text**: SF Pro Text style (optimized for reading)
- **Code/Technical**: `"SF Mono", "Monaco", "Cascadia Code", "Roboto Mono", "Courier New", monospace`

**Configurable Font System:**
- CSS custom properties for easy theming
- Weight scale: 300 (Light), 400 (Regular), 500 (Medium), 600 (Semibold), 700 (Bold)
- Size scale: 12px, 14px, 16px, 18px, 20px, 24px, 32px, 48px, 64px

### Layout Principles
- **Dark theme** optimized for astrophotography viewing
- **High contrast** for excellent readability
- **Large, immersive images** with minimal distraction
- **Mobile-first** responsive design
- **Fast loading** with optimized images
- **Accessible** design following WCAG guidelines

### Image Gallery Design
**Grid Layout:**
- Masonry or justified grid for varied aspect ratios
- Hover effects revealing image metadata
- Quick preview on hover
- Click to open lightbox
- All galleries (Latest Captures, Deep Sky, Solar System, Wide Field, Terrestrial, Equipment) load images dynamically from their respective folders or metadata files. Adding new images to a folder automatically updates the gallery—no code changes required.

**Lightbox Features:**
- Full-screen viewing
- Image metadata overlay (equipment, settings, date, location)
- Previous/next navigation
- Zoom capabilities
- Social sharing buttons
- Download options (wallpaper sizes)

**Image Metadata Display:**
- Equipment used
- Exposure settings (ISO, shutter, aperture)
- Processing software
- Capture date and time
- Location coordinates
- Object information (for astrophotography)

### Interactive Elements

#### Clear Sky Clock Integration
- Embedded widget on homepage and about page
- Direct link to full forecast
- Credit to Attilla Danko and Adam Rahill

#### Search and Filter System
- Global search across all images
- Filter by:
  - Equipment used
  - Date range
  - Location
  - Object type (for astro)
  - Collection (for terrestrial)
- Sort options: Date, Name, Equipment

#### Equipment Showcase
- Interactive equipment cards
- Hover effects showing sample images
- Click to see all images taken with that equipment
- Specifications in expandable sections

## Technical Architecture

### Recommended Framework Options

#### Option 1: Next.js (Recommended)
**Pros:**
- Excellent SEO with SSG/SSR
- Image optimization built-in
- Great performance
- Large ecosystem
- Easy deployment

**Tech Stack:**
- Next.js 14+ with App Router
- TypeScript for type safety
- Tailwind CSS for styling
- Framer Motion for animations
- MDX for content management
- Vercel for hosting

#### Option 2: Astro
**Pros:**
- Lightning fast static sites
- Component agnostic
- Built-in image optimization
- Great for content-heavy sites

**Tech Stack:**
- Astro with React/Vue components
- TypeScript
- Tailwind CSS
- Content Collections for organization

#### Option 3: Custom Static Site
**Pros:**
- Full control
- Minimal dependencies
- Fast performance

**Tech Stack:**
- Vanilla HTML/CSS/JS
- Build tools (Vite/Webpack)
- Static site generator

### Content Management Strategy

#### Option A: File-Based (Recommended for Start)
- Markdown files for content
- JSON for image metadata
- Images loaded dynamically from folders for all galleries
- Git-based workflow
- Easy to version control

#### Option B: Headless CMS
- Strapi, Sanity, or Contentful
- Easy content updates
- Client-friendly editing
- API-driven approach

### Image Optimization Strategy
- **WebP/AVIF** formats for modern browsers
- **Progressive loading** for galleries
- **Responsive images** with multiple sizes
- **Lazy loading** for performance
- **CDN delivery** for global performance

### SEO Optimization
- **Meta tags** optimized for each page
- **Schema markup** for photography
- **Sitemap** generation
- **Open Graph** tags for social sharing
- **Alt text** for all images
- **Page speed** optimization

## Development Phases

### Phase 1: Foundation (Week 1-2)
- Set up development environment
- Implement basic layout and navigation
- Create homepage design
- Set up image optimization pipeline

### Phase 2: Core Features (Week 3-4)
- Build astrophotography galleries
- Implement terrestrial collections
- Create equipment showcase pages
- Add search and filter functionality

### Phase 3: Polish & Content (Week 5-6)
- Migrate existing content
- Implement lightbox and advanced interactions
- Add Clear Sky Clock integration
- Mobile optimization and testing

### Phase 4: Launch Preparation (Week 7)
- SEO optimization
- Performance testing
- Domain setup and deployment
- Content review and final additions

## Content Migration Plan

### Current Content Inventory
From existing Wix site:
- Astrophotography images (Deep Sky, Solar System)
- Equipment information (SeeStar S50 focus)
- About page content
- Contact information
- Clear Sky Clock integration
- Terrestrial photography section

### Migration Strategy
1. **Download all images** at highest resolution
2. **Catalog metadata** for each image
3. **Organize into new structure** (collections-based)
4. **Enhance descriptions** and technical details
5. **Add missing equipment information**

## Performance Goals
- **Page Load Speed:** < 3 seconds on 3G
- **Lighthouse Score:** 90+ in all categories
- **Core Web Vitals:** Pass all metrics
- **Mobile Performance:** Optimized for all devices

## Accessibility Features
- **Keyboard navigation** support
- **Screen reader** compatibility
- **High contrast** mode support
- **Focus indicators** for interactive elements
- **Alt text** for all images
- **ARIA labels** where appropriate

## Future Enhancements
- **Blog section** for observing sessions and equipment reviews
- **Print shop** integration for selling prints
- **Newsletter signup** for updates
- **User accounts** for favorites and collections
- **API** for mobile app development
- **Social features** for community building

## Success Metrics
- **User Engagement:** Time on site, pages per session
- **Image Views:** Gallery interaction rates
- **Mobile Usage:** Mobile vs desktop traffic
- **Search Performance:** Organic traffic growth
- **Contact Inquiries:** Form submissions and social follows

---

## Next Steps
1. Choose technical framework (Next.js recommended)
2. Set up development environment
3. Create wireframes and mockups
4. Begin Phase 1 development
5. Content migration planning
