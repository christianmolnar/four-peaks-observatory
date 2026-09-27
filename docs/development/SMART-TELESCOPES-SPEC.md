# Smart Telescopes Section — Implementation Spec
**Date**: July 6, 2026  
**Status**: Planning  

---

## Overview

A new top-level section called **Smart Telescopes** that organizes images by the instrument that captured them, rather than by object type. Provides an alternate navigation path into the existing photo library, filtered by telescope.

---

## Current Inventory (from metadata.json)

| Telescope | Image Count | Subcategories present |
|-----------|-------------|----------------------|
| SeeStar S50 | 15 | deep-sky/nebulas, deep-sky/galaxies, deep-sky/star-clusters, deep-sky/wide-field |
| SeeStar S30 | 7 | deep-sky/nebulas, deep-sky/galaxies, deep-sky/star-clusters, deep-sky/hubble-palette |
| Unistellar | 0 | — (no images tagged yet, but add as a placeholder tile) |

**Key finding**: All 22 smart scope images are currently Deep Sky only. No Solar System images are tagged to these scopes yet. The Solar System tile will be added to the structure now and will populate as images are added.

---

## Information Architecture

```
Nav: Smart Telescopes
│
├── /smart-telescopes                     ← Level 1: Scope selector
│   ├── [tile] SeeStar S50
│   ├── [tile] SeeStar S30
│   └── [tile] Unistellar
│
├── /smart-telescopes/seestar-s50         ← Level 2: Category selector
│   ├── [tile] Deep Sky  (15 images)
│   └── [tile] Solar System  (0 images — shown, navigates to empty state)
│
├── /smart-telescopes/seestar-s30         ← Level 2: Category selector
│   ├── [tile] Deep Sky  (7 images)
│   └── [tile] Solar System  (0 images)
│
├── /smart-telescopes/unistellar          ← Level 2: Category selector
│   ├── [tile] Deep Sky
│   └── [tile] Solar System
│
├── /smart-telescopes/seestar-s50/deep-sky      ← Level 3: Gallery
├── /smart-telescopes/seestar-s50/solar-system  ← Level 3: Gallery
├── /smart-telescopes/seestar-s30/deep-sky      ← Level 3: Gallery
├── /smart-telescopes/seestar-s30/solar-system  ← Level 3: Gallery
├── /smart-telescopes/unistellar/deep-sky       ← Level 3: Gallery
└── /smart-telescopes/unistellar/solar-system   ← Level 3: Gallery
```

---

## Design

### Tiles (Levels 1 and 2)
Use the **exact same `CategoryTemplate`** that powers Deep Sky and Solar System pages.
- Same `w-72 h-72` glass card design
- Same hover scale + yellow title color transition
- Same diagonal arrow indicator
- Same background image / description / title layout

### Level 1 Tile Images (scope selector)
| Tile | Background Image |
|------|-----------------|
| SeeStar S50 | `NGC7635 - The Bubble Nebula-Wide.jpg` (nebulas) |
| SeeStar S30 | `North America and The Pelican.jpg` (nebulas) |
| Unistellar | Fallback to a strong nebula or galaxy image — TBD when images arrive |

### Level 2 Tile Images (Deep Sky / Solar System)
| Tile | Background Image |
|------|-----------------|
| Deep Sky | Best image from that scope's deep-sky collection |
| Solar System | Solar/lunar image placeholder until scope-specific images are tagged |

### Level 3 Gallery
Use the existing `GalleryTemplate` component with a filtered image set.
- Filter `metadata.json` entries by: `equipment === scope` AND category prefix matches `deep-sky` or `solar-system`
- Display count in page title: e.g. "SeeStar S50 — Deep Sky (15)"
- Same gallery grid, modal, navigation as all other gallery pages

---

## Data Strategy

**No image duplication.** Images stay in their existing folders under `public/images/astrophotography/`.

The Smart Telescopes galleries query metadata by the `equipment` field:

| Scope slug | Equipment string match |
|------------|------------------------|
| `seestar-s50` | `"SeeStar S50"` |
| `seestar-s30` | `"SeeStar S30"` |
| `unistellar` | `"Unistellar"` (partial match, handles future model names) |

Category filter:
| Category slug | Subcategory prefix match |
|---------------|--------------------------|
| `deep-sky` | starts with `"deep-sky/"` |
| `solar-system` | starts with `"solar-system/"` |

---

## Files to Create

```
src/app/smart-telescopes/
├── page.tsx                           ← Level 1 (scope tiles)
├── seestar-s50/
│   ├── page.tsx                       ← Level 2 (Deep Sky / Solar System tiles)
│   └── [category]/
│       └── page.tsx                   ← Level 3 (gallery — dynamic route)
├── seestar-s30/
│   ├── page.tsx
│   └── [category]/
│       └── page.tsx
└── unistellar/
    ├── page.tsx
    └── [category]/
        └── page.tsx
```

Alternative: use a single `[scope]/[category]/page.tsx` dynamic route pair to avoid repetition. Recommended — see below.

### Recommended Dynamic Route Structure
```
src/app/smart-telescopes/
├── page.tsx                           ← Level 1 (static, scope tiles)
└── [scope]/
    ├── page.tsx                       ← Level 2 (static per scope, category tiles)
    └── [category]/
        └── page.tsx                   ← Level 3 (gallery, filtered by scope+category)
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/config/global.ts` | Add `smartTelescopesConfig`, add nav item |
| `src/components/Navigation.tsx` | Add "Smart Telescopes" to nav items list (already driven by config) |

---

## Config Structure (global.ts additions)

```typescript
export const smartTelescopesConfig = {
  title: 'Smart Telescopes',
  backgroundImage: '/images/astrophotography/deep-sky/nebulas/NGC7635 - The Bubble Nebula-Wide.jpg',
  description: 'Images captured with smart telescopes — automated, app-controlled instruments designed for one-touch deep sky imaging.',
  scopes: [
    {
      slug: 'seestar-s50',
      title: 'SeeStar S50',
      equipmentMatch: 'SeeStar S50',
      href: '/smart-telescopes/seestar-s50',
      backgroundImage: '/images/astrophotography/deep-sky/nebulas/NGC7635 - The Bubble Nebula-Wide.jpg',
      description: 'ZWO SeeStar S50 — 50mm smart telescope',
    },
    {
      slug: 'seestar-s30',
      title: 'SeeStar S30',
      equipmentMatch: 'SeeStar S30',
      href: '/smart-telescopes/seestar-s30',
      backgroundImage: '/images/astrophotography/deep-sky/nebulas/North America and The Pelican.jpg',
      description: 'ZWO SeeStar S30 — 30mm smart telescope',
    },
    {
      slug: 'unistellar',
      title: 'Unistellar',
      equipmentMatch: 'Unistellar',
      href: '/smart-telescopes/unistellar',
      backgroundImage: '/images/astrophotography/deep-sky/nebulas/Heart Nebula.jpg',
      description: 'Unistellar smart telescope',
    },
  ],
  categories: [
    {
      slug: 'deep-sky',
      title: 'Deep Sky',
      subcategoryPrefix: 'deep-sky/',
      backgroundImage: '/images/astrophotography/deep-sky/nebulas/North America and The Pelican.jpg',
      description: 'Galaxies, nebulas, star clusters, and deep space objects',
    },
    {
      slug: 'solar-system',
      title: 'Solar System',
      subcategoryPrefix: 'solar-system/',
      backgroundImage: '/images/astrophotography/solar-system/solar/Sun.jpg',
      description: 'Sun, Moon, planets, and solar system objects',
    },
  ],
};
```

---

## Empty State

When a scope+category combination has 0 images, the gallery shows:
> *"No [Deep Sky / Solar System] images from the [SeeStar S50] yet. Check back soon."*

Don't hide the tile — keep it visible so the structure is ready for future images.

---

## Open Questions Before Implementation

1. **Unistellar background image** — which image should represent it? (No metadata entries yet)
2. **SeeStar S50 Deep Sky tile background** — best single image from that set? Suggestion: `NGC7635 - The Bubble Nebula-Wide.jpg` or `Thor's Helmet.jpg`
3. **SeeStar S30 Deep Sky tile background** — suggestion: `North America and The Pelican.jpg`  
4. **Do you want a scope description/intro paragraph** on the level 2 page, or straight to tiles?
5. **"Smart Telescopes" nav label** — is that the exact label, or would you prefer "Smart Scopes", "Auto Telescopes", etc.?
6. **Wide Field categorization** — S50 has `deep-sky/wide-field` images. Should those appear under Deep Sky in the smart scope galleries? (Recommended: yes, since `wide-field` starts with `deep-sky/`)

---

## Implementation Order

1. Add config to `global.ts`
2. Add nav item
3. Create `src/app/smart-telescopes/page.tsx` (Level 1)
4. Create `src/app/smart-telescopes/[scope]/page.tsx` (Level 2)
5. Create filtered gallery at `src/app/smart-telescopes/[scope]/[category]/page.tsx` (Level 3)
6. Test all 6 gallery routes (3 scopes × 2 categories)
7. Verify existing Deep Sky / Solar System pages are unchanged

Estimated files: ~5 new files + 1 modified config. No image moves or database changes needed.
