# Admin Page Design Document
**Maple Valley Observatory - Site Management Interface**

## Overview
Create a comprehensive admin interface for managing site assets, specifically image metadata and organization. This page will provide real-time editing capabilities for all image metadata stored in `metadata.json`.

## Current Issues Identified (August 2025)

### YouTube Contemplation Feature Problems:
1. **Not Working on Site**: YouTube contemplation controls don't appear in gallery images
2. **Data Duplication**: YouTube links exist in two places:
   - `/src/data/contemplation-inventory.json` (has actual data, not integrated)
   - `/src/data/metadata.json` (empty fields, but integrated with site)
3. **Integration Gap**: Site looks for `youtubeLink` in metadata.json but all entries are empty strings

### Solution: Tabbed Admin Interface
- **Tab 1**: Metadata Management (existing design without YouTube fields)
- **Tab 2**: YouTube Contemplation Management (dedicated interface for YouTube links)

## Security & Access Control
**✅ DECIDED:** Development environment only access (`NODE_ENV=development`) at hidden route `/admin/asset-manager`

## Page Structure

### 1. Header Section
- **Maple Valley Observatory Logo** (same as main site)
- **Main Title**: "MAPLE VALLEY OBSERVATORY"
- **Subtitle**: "Site Asset Management"

### 2. Tab Navigation
Two-tab interface for different management aspects:
- **Tab 1: "Image Metadata"** - Main image metadata management (existing functionality)
- **Tab 2: "Contemplation Videos"** - YouTube video assignments for astrophotography images

### 3. Statistics Dashboard (Tab 1: Image Metadata)
Display summary cards with total counts and filtering capabilities:

#### Summary Cards:
- **Total Images**: Count of all images in metadata.json
- **New Images**: Images missing `catalogDesignation` OR `objectName` (either field empty/missing)
- **Astrophotography Categories**:
  - Featured (from `/public/images/astrophotography/featured/`)
  - Deep Sky - Galaxies (from `/public/images/astrophotography/deep-sky/galaxies/`)
  - Deep Sky - Nebulas (from `/public/images/astrophotography/deep-sky/nebulas/`)
  - Deep Sky - Star Clusters (from `/public/images/astrophotography/deep-sky/star-clusters/`)
  - Deep Sky - Wide Field (from `/public/images/astrophotography/deep-sky/wide-field/`)
  - Solar System - Solar (from `/public/images/astrophotography/solar-system/solar/`)
  - Solar System - Lunar (from `/public/images/astrophotography/solar-system/lunar/`)
  - Solar System - Planets (from `/public/images/astrophotography/solar-system/planets/`)
  - Solar System - Events (from `/public/images/astrophotography/solar-system/events/`)
- **Terrestrial Categories**:
  - Yellowstone (from `/public/images/terrestrial/yellowstone/`)
  - Grand Tetons (from `/public/images/terrestrial/grand-tetons/`)
- **Equipment**: (from `/public/images/equipment/`)

**✅ DECIDED:** Check both filesystem AND metadata.json - auto-sync discrepancies

#### Card Functionality:
- Each card shows count and category name
- **Primary Categories** (Astrophotography, Terrestrial): Click to expand/collapse sub-category cards
- **Sub-Categories**: Click to filter the main table to show only images from that specific category
- **Individual Categories** (Total Images, New Images, Equipment): Click to filter directly
- Cards have visual states: normal, active (when filtering), expanded (for primary categories), hover
- "Clear Filter" option to show all images
- Smooth expand/collapse animations for better UX

### 4. Save/Discard Controls (Both Tabs)
Positioned between statistics and main table:
- **Save Changes** button (enabled when there are unsaved changes)
- **Discard Changes** button (revert to last saved state)
- **Status indicator** showing "All changes saved" or "X unsaved changes"

**✅ DECIDED:** Manual Save/Discard buttons for better control over when changes are committed

### 5. Main Data Table (Tab 1: Image Metadata)

#### Columns (in this order):
1. **Image Name** (filename, non-editable, acts as row identifier)
2. **Category** (editable - dropdown: astrophotography, terrestrial, equipment)
3. **Subcategory** (editable - dropdown based on category selection)
4. **Catalog Designation** (editable)
5. **Object Name** (editable)
6. **Date Taken** (editable - Month, Year format)
7. **Location** (editable)
8. **Equipment** (editable)
9. **Exposure** (editable)
10. **Protected** (editable - checkbox/toggle)

**⚠️ REMOVED:** YouTube Link and YouTube Title columns (moved to Tab 2)

### 6. Contemplation Videos Table (Tab 2: Contemplation Videos)

#### Purpose:
Manage YouTube video assignments for astrophotography images to provide contemplative viewing experiences.

#### Columns (in this order):
1. **Image Name** (filename, non-editable, acts as row identifier)
2. **Object Name** (editable - for display purposes)
3. **Catalog Designation** (editable - for reference)
4. **YouTube Link** (editable - full YouTube URL)
5. **YouTube Title** (editable - descriptive title for the video)
6. **Status** (computed - shows "Assigned" or "Available")

#### Table Features (Tab 2):
- **Filter by Status**: Show only "Assigned" or "Available" images
- **Astrophotography Only**: Only show astrophotography images (exclude terrestrial/equipment)
- **Inline Editing**: Click any cell to edit (except Image Name)
- **URL Validation**: Real-time validation for YouTube URLs
- **Bulk Operations**: 
  - Bulk clear assignments
  - Bulk assign from contemplation inventory
- **Import from Inventory**: Button to load assignments from `/docs/design/contemplation-inventory.json`

#### Data Integration:
- **Primary Source**: metadata.json (youtubeLink, youtubeTitle fields)
- **Import Source**: `/docs/design/contemplation-inventory.json` (existing assignments)
- **Migration**: One-time import to transfer data from contemplation-inventory.json to metadata.json

#### Table Features:
- **Inline Editing**: Click any cell to edit (except Image Name)
- **Category/Subcategory Dropdowns**: Cascading dropdowns for category selection
- **Bulk Selection**: Checkbox column for selecting multiple rows
- **Bulk Delete**: Delete selected rows with "Are You Sure?" confirmation dialog
- **Real-time Validation**: Immediate feedback for invalid data
- **Sort Capabilities**: Click column headers to sort
- **Search/Filter**: Global search box + category filtering from cards
- **Row Highlighting**: Different colors for modified rows, new images, etc.
- **Pagination**: Handle large datasets efficiently

**✅ DECIDED:** 
- Category and Subcategory as primary editable columns (replaces fileLocationMappings.ts)
- Bulk delete with confirmation flow included
- All fields editable in real-time (no separate edit buttons needed)
- Focus on editing existing images (add/delete handled via file system)

### 5. Styling & Visual Design
- **Consistent with main site**: Use same color scheme, typography, and design tokens
- **Dark theme**: Match the astronomy site aesthetic
- **Responsive**: Works on desktop and tablet (mobile secondary priority)
- **Professional**: Clean, organized, easy to scan

## Technical Considerations

### Categorization System Redesign:
**✅ ENHANCED DESIGN:** Eliminate `fileLocationMappings.ts` and use metadata.json category fields

#### Current System Problems:
- Dual sources of truth: `fileLocationMappings.ts` + `metadata.json`
- Manual mapping maintenance required
- Inconsistencies between file-based and metadata-based categorization

#### New Integrated System:
- **Single Source**: All categorization stored in `metadata.json`
- **Editable Categories**: Category and Subcategory as table columns
- **Dropdown Validation**: Enforced category/subcategory relationships
- **Auto-sync**: Update script uses metadata categories (not file mappings)

#### Category Structure:
```typescript
type Category = 'astrophotography' | 'terrestrial' | 'equipment';
type Subcategory = {
  astrophotography: 'deep-sky/nebulas' | 'deep-sky/galaxies' | 'deep-sky/star-clusters' | 
                    'deep-sky/wide-field' | 'deep-sky/hubble-palette' | 'solar-system/solar' |
                    'solar-system/lunar' | 'solar-system/planets' | 'solar-eclipses' | 'featured';
  terrestrial: 'yellowstone' | 'grand-tetons';
  equipment: 'equipment';
}
```

### Data Management:
- Load metadata.json on page load
- Track changes in memory
- Batch save changes to metadata.json
- Handle concurrent editing (if multiple tabs open)

### Performance:
- Lazy loading for large tables
- Efficient filtering and searching
- Minimize re-renders during editing

### File System Integration:
**✅ DECIDED:** Auto-detect new images, sync with metadata.json, and show discrepancies between filesystem and metadata

## Final Implementation Plan

All design decisions have been finalized based on requirements:

0. **Access Method**: Hidden page `/admin/asset-manager` - DEVELOPMENT ONLY (NODE_ENV=development)
1. **Authentication**: Development environment only - no production access
2. **Image count source**: Check both filesystem AND metadata.json - auto-sync discrepancies
3. **Save behavior**: Manual Save/Discard buttons positioned above table
4. **Editing**: All fields editable in real-time, no edit buttons + Bulk Delete function
5. **File system scanning**: Auto-detect new images and sync with metadata.json
6. **Error handling**: Inline validation with toast notifications
7. **Mobile support**: Responsive design, low priority

## Implementation Phases:

### Phase 1: Basic Structure ✅ READY TO START
- Create admin page route: `/admin/asset-manager` (development only)
- Development environment check (NODE_ENV=development)
- Header with logo and title matching main site
- Empty statistics dashboard layout
- Empty table layout
- Basic styling using site's design tokens

### Phase 2: Data Loading & Display
- Load metadata.json
- Display basic statistics cards with counts
- Show data in table format (read-only initially)
- Basic filtering by category cards

### Phase 3: Enhanced Editing Functionality
- Make table cells editable (click to edit)
- **Category/Subcategory dropdown editors** with validation
- **Bulk selection checkboxes** for multiple row operations
- **Bulk delete with confirmation dialog** ("Are you sure?" flow)
- Track changes in memory
- Save/Discard buttons functionality
- Write changes back to metadata.json

### Phase 4: File System Integration & Legacy Cleanup
- Scan filesystem for images
- Detect discrepancies between files and metadata
- Auto-sync new images to metadata.json
- **Remove dependency on fileLocationMappings.ts**
- **Refactor site to use metadata.json categories exclusively**
- Bulk delete functionality (files + metadata)

### Phase 5: Polish & Validation
- Error handling and validation
- Loading states and toast notifications
- Performance optimizations

**✅ READY TO START IMPLEMENTATION** - All requirements clarified and design decisions finalized.
