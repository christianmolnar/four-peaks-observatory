# Admin Page Design Document
**Maple Valley Observatory - Site Management Interface**

## Overview
Create a comprehensive admin interface for managing site assets, specifically image metadata and organization. This page will provide real-time editing capabilities for all image metadata stored in `metadata.json`.

## Security & Access Control
**✅ IMPLEMENTED:** Vercel Build Exclusion approach using `vercel.json`
- **Development**: Admin interface fully functional at `/admin/asset-manager`
- **Production**: Routes completely excluded from Vercel deployment (404 response)
- **Security Method**: `vercel.json` excludes `src/app/admin/**` from build and returns 404 for `/admin.*` routes
- **Benefits**: No code changes required, simple configuration, complete production security

## Page Structure

### 1. Header Section
- **Maple Valley Observatory Logo** (same as main site)
- **Main Title**: "MAPLE VALLEY OBSERVATORY"
- **Subtitle**: "Site Asset Management"

### 2. Statistics Dashboard
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

### 3. Save/Discard Controls
Positioned between statistics and main table:
- **Save Changes** button (enabled when there are unsaved changes)
- **Discard Changes** button (revert to last saved state)
- **Status indicator** showing "All changes saved" or "X unsaved changes"

**✅ DECIDED:** Manual Save/Discard buttons for better control over when changes are committed

### 4. Main Data Table

#### Columns (in this order):
1. **Image Name** (filename, non-editable, acts as row identifier)
2. **Catalog Designation** (editable)
3. **Object Name** (editable)
4. **Date Taken** (editable - Month, Year format)
5. **Location** (editable)
6. **Equipment** (editable)
7. **Exposure** (editable)
8. **YouTube Link** (editable)
9. **YouTube Title** (editable)
10. **Protected** (editable - checkbox/toggle)

#### Table Features:
- **Inline Editing**: Click any cell to edit (except Image Name)
- **Real-time Validation**: Immediate feedback for invalid data
- **Sort Capabilities**: Click column headers to sort
- **Search/Filter**: Global search box + category filtering from cards
- **Row Highlighting**: Different colors for modified rows, new images, etc.
- **Pagination**: Handle large datasets efficiently

**✅ DECIDED:** 
- Bulk delete functionality included
- All fields editable in real-time (no separate edit buttons needed)
- Focus on editing existing images (add/delete handled via file system)

### 5. Styling & Visual Design
- **Consistent with main site**: Use same color scheme, typography, and design tokens
- **Dark theme**: Match the astronomy site aesthetic
- **Responsive**: Works on desktop and tablet (mobile secondary priority)
- **Professional**: Clean, organized, easy to scan

## Technical Considerations

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

0. **Access Method**: Hidden page `/admin/asset-manager` - SECURED FOR PRODUCTION VIA VERCEL.JSON
1. **Authentication**: Vercel build exclusion - admin routes completely inaccessible in production
2. **Image count source**: Check both filesystem AND metadata.json - auto-sync discrepancies
3. **Save behavior**: Manual Save/Discard buttons positioned above table
4. **Editing**: All fields editable in real-time, no edit buttons + Bulk Delete function
5. **File system scanning**: Auto-detect new images and sync with metadata.json
6. **Error handling**: Inline validation with toast notifications
7. **Mobile support**: Responsive design, low priority

## COMPREHENSIVE METADATA REFACTOR PLAN

### Background: Current System Issues
The current admin interface uses a hardcoded `fileLocationMappings.ts` system that:
- ❌ Requires manual updates for every new image
- ❌ Creates maintenance burden and scalability issues
- ❌ Doesn't utilize the existing rich metadata.json system
- ❌ Forces hardcoded categorization logic

### Solution: Metadata-Driven Categorization
Replace hardcoded mapping system with category/subcategory fields in metadata.json:

**New Metadata Schema (Addition):**
```json
{
  "filename.jpg": {
    "catalogDesignation": "M42",
    "objectName": "Orion Nebula", 
    "dateTaken": "February 2005",
    "location": "Maple Valley Observatory",
    "equipment": "Canon 20D",
    "exposure": "20x240sec",
    "youtubeLink": "",
    "youtubeTitle": "",
    "protected": false,
    "category": "astrophotography",        // NEW FIELD
    "subcategory": "deep-sky/nebulas"      // NEW FIELD
  }
}
```

**Static Category System:**
- **astrophotography**
  - `deep-sky/nebulas`
  - `deep-sky/galaxies` 
  - `deep-sky/star-clusters`
  - `deep-sky/wide-field`
  - `solar-system/solar`
  - `solar-system/lunar`
  - `solar-system/planets`
  - `solar-system/events`
- **terrestrial**
  - `yellowstone`
  - `grand-tetons`
- **equipment**

## Implementation Phases:

### Phase 0: Security Implementation ✅ COMPLETED
- ✅ Created `vercel.json` with admin route exclusion for production deployment
- ✅ Admin interface secured from public access while maintaining development functionality

### Phase 1: Metadata Schema Enhancement 🔄 READY TO START
- Add `category` and `subcategory` fields to metadata.json TypeScript interfaces
- Update `update-metadata.js` script to populate new fields for existing images
- Implement automatic category detection based on file system paths
- Preserve existing functionality while adding new metadata structure

### Phase 2: Asset Manager Core Updates
- Replace `fileLocationMappings.ts` hardcoded system with metadata-driven categorization
- Update category counting logic to read from metadata.json
- Implement new editable category/subcategory fields in admin table
- Add dropdown selectors for category assignment

### Phase 3: Enhanced Asset Manager Features  
- Add table sorting functionality (click column headers)
- Implement bulk delete with confirmation dialog
- Add search/filter capabilities across all metadata fields
- Enhanced UI with better responsive design

### Phase 4: Migration & Cleanup
- Remove deprecated `fileLocationMappings.ts` file  
- Update all references to use metadata-driven system
- Comprehensive testing of new categorization system
- Documentation updates for new workflow

**✅ SECURITY COMPLETED, READY TO START PHASE 1** - Admin interface secured for production, comprehensive refactor plan approved.
