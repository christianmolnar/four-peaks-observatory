# Four Peaks Observatory - Site Management Guide

## Quick Reference

### 🚀 Starting the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the site.

### 📸 Adding New Images
```bash
# 1. Add image files to appropriate folders (see Image Organization below)
# 2. Update metadata
node update-metadata.js

# 3. Optionally add contemplation video
node update-metadata.js add-video "your-image.jpg" "https://youtube.com/..." "Video Title"
```

### 🎵 Managing Contemplation Videos
```bash
# Check current inventory
node update-metadata.js inventory

# Add video to image
node update-metadata.js add-video "image.jpg" "youtube-url" "Video Title"

# Remove video from image
node update-metadata.js remove-video "image.jpg"
```

## Development Workflow

### Starting Development
1. **Start the development server:**
   ```bash
   npm run dev
   ```
   The site will be available at http://localhost:3000

2. **For production build:**
   ```bash
   npm run build
   npm start
   ```

### Available NPM Commands
- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production (includes timestamp capture)
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run capture-timestamps` - Update file timestamps

## Adding New Images

### Step 1: Image Organization

Place images in the appropriate folders within `/public/images/`:

#### Astrophotography (`/public/images/astrophotography/`)
- **Deep Sky** (`deep-sky/`): Nebulae, galaxies, star clusters
  - `galaxies/` - M31, M33, Leo Triplet, etc.
  - `nebulas/` - Orion, Heart, Soul, Eagle, etc.
  - `star-clusters/` - Pleiades, Double Cluster, etc.
  - `wide-field/` - Large regions, constellation views

- **Solar System** (`solar-system/`):
  - `lunar/` - Moon phases, lunar features
  - `planets/` - Jupiter, Saturn, Mars, etc.
  - `solar/` - Sun photography, solar eclipses
  - `events/` - Eclipses, transits, conjunctions

- **Featured** (`featured/`): Your best showcase images

#### Terrestrial (`/public/images/terrestrial/`)
- `grand-tetons/` - Grand Teton National Park
- `yellowstone/` - Yellowstone National Park
- Add new location folders as needed

#### Equipment (`/public/images/equipment/`)
- Equipment photos, observatory setups

### Step 2: File Naming Convention
- Use descriptive names: `orion-nebula-m42.jpg`
- Include catalog designations: `andromeda-galaxy-m31.jpg`
- Use lowercase with hyphens: `heart-and-soul-nebulas.jpg`

### Step 3: Update Metadata
After adding images, run:
```bash
node update-metadata.js
```

This will:
- Scan all image directories
- Update `src/data/metadata.json` with new images
- Capture file timestamps
- Update the contemplation inventory

### Step 4: Image Optimization Tips
- **Resolution**: 2048x2048px maximum for web
- **File Size**: Keep under 1MB for fast loading
- **Format**: JPG for photos, PNG for graphics with transparency
- **Quality**: 85-95% JPG quality is usually optimal

## Contemplation Video Management

### Overview
The contemplation system allows you to pair YouTube videos with astrophotography images for a meditative viewing experience.

### Current Statistics
Run this to see current assignments:
```bash
node update-metadata.js inventory
```

### Adding Videos to Images

#### Method 1: Direct Assignment
```bash
node update-metadata.js add-video "M42 The Orion Nebula.jpg" "https://www.youtube.com/watch?v=abc123" "Cosmic Meditation Music"
```

#### Method 2: Update Curated List First
1. Edit `docs/youtube-contemplation-links.md` to add new videos
2. Run inventory to see available videos:
   ```bash
   node update-metadata.js inventory
   ```
3. Assign from available videos using add-video command

### Video Content Guidelines
Match content to astronomical subjects:
- **Deep sky objects** → Cosmic, instrumental, jazz
- **Planets/Moon** → Mindfulness, poetry, meditation  
- **Wide fields** → Progressive rock, classical
- **Nebulae** → Ambient, experimental, contemplative

### Managing Assignments
```bash
# Remove video from an image
node update-metadata.js remove-video "image.jpg"

# Check which images need videos
node update-metadata.js inventory
```

## Key Files and Their Purpose

### Site Configuration
- `src/config/global.ts` - Global site settings
- `src/config/observatory.ts` - Observatory-specific configuration

### Content Management
- `src/data/metadata.json` - Primary image metadata and video assignments
- `docs/youtube-contemplation-links.md` - Curated contemplation content
- `contemplation-inventory.json` - Automated inventory tracking

### Scripts
- `update-metadata.js` - Main content management script
- `scripts/capture-file-times.js` - Image timestamp capture

### Core Components
- `src/components/GalleryTemplate.tsx` - Gallery display with contemplation overlay
- `src/components/Navigation.tsx` - Site navigation
- `src/app/layout.tsx` - Site layout and metadata

## Site Structure and Pages

### Main Pages
- `/` - Homepage with latest captures
- `/astrophotography/` - Main astrophotography gallery
  - `/astrophotography/deep-sky/` - Deep sky objects
  - `/astrophotography/solar-system/` - Solar system
- `/terrestrial/` - Landscape photography
- `/equipment/` - Equipment showcase
- `/resources/` - Resources and learning
- `/about/` - About the observatory
- `/contact/` - Contact information

### Adding New Pages
1. Create page component in `src/app/[page-name]/page.tsx`
2. Update navigation in `src/components/Navigation.tsx`
3. Add metadata and SEO information

## Troubleshooting

### Common Issues

#### Images Not Showing
1. Check file paths are correct
2. Ensure images are in `/public/images/` subdirectories
3. Run `node update-metadata.js` to refresh metadata
4. Check browser console for 404 errors

#### Metadata Issues
1. Run `node update-metadata.js` to regenerate
2. Check `src/data/metadata.json` for correct entries
3. Verify file timestamps in `src/data/file-timestamps.json`

#### Development Server Issues
1. Clear Next.js cache: `rm -rf .next`
2. Reinstall dependencies: `npm install`
3. Restart development server: `npm run dev`

#### Contemplation System Issues
1. Check inventory: `node update-metadata.js inventory`
2. Verify YouTube URLs are valid
3. Check assignment annotations in `docs/youtube-contemplation-links.md`

### Debug Commands
```bash
# Check current inventory status
node update-metadata.js inventory

# Regenerate all metadata
node update-metadata.js

# Check file timestamps
npm run capture-timestamps

# Lint and check for errors
npm run lint
```

## Production Deployment

### Building for Production
```bash
npm run build
```

This automatically:
1. Captures file timestamps
2. Builds optimized production version
3. Generates sitemap
4. Optimizes images

### Environment Variables
Create `.env.local` for any needed environment variables:
```bash
# Example
NEXT_PUBLIC_ANALYTICS_ID=your-analytics-id
```

## Best Practices

### Content Management
1. **Regular Updates**: Run `node update-metadata.js` after adding images
2. **Inventory Checks**: Use `inventory` command to track contemplation assignments
3. **Image Optimization**: Optimize images before upload
4. **Backup**: Keep backups of `metadata.json` and `docs/youtube-contemplation-links.md`

### Development
1. **Use TypeScript**: All components are TypeScript for better reliability
2. **Component Structure**: Follow existing patterns in components
3. **Responsive Design**: Test on mobile and desktop
4. **Performance**: Monitor image loading and optimize as needed

### Content Curation
1. **Quality Over Quantity**: Choose your best images for featured sections
2. **Contemplation Pairings**: Match video mood to astronomical subject
3. **SEO**: Use descriptive filenames and metadata
4. **Accessibility**: Ensure good contrast and alt text

## Documentation References

- **Contemplation System**: See `docs/CONTEMPLATION_INVENTORY_GUIDE.md`
- **Image Organization**: See `public/images/README.md`
- **SEO Setup**: See `docs/SEO_SETUP_GUIDE.md`
- **Contact Setup**: See `docs/CONTACT_SETUP.md`
- **Design Guidelines**: See `docs/DESIGN_DOCUMENT.md`

## Getting Help

### File Locations for Common Tasks
- **Adding images**: `/public/images/[category]/`
- **Updating metadata**: `node update-metadata.js`
- **Site configuration**: `src/config/`
- **Component styling**: `src/components/`
- **Content data**: `src/data/`

### Key Commands Summary
```bash
# Development
npm run dev                                    # Start dev server

# Content Management  
node update-metadata.js                       # Update all metadata
node update-metadata.js inventory             # Check contemplation status
node update-metadata.js add-video [args]      # Add video to image
node update-metadata.js remove-video [image]  # Remove video from image

# Production
npm run build                                  # Build for production
npm start                                      # Start production server
```

This guide covers the essential workflows for managing your observatory website. For specific features like the contemplation inventory system, refer to the dedicated guides mentioned above.
