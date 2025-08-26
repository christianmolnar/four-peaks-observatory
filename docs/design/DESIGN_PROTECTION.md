# Design Protection Document

**DO NOT MODIFY PROTECTED ELEMENTS WITHOUT EXPLICIT USER PERMISSION**

This document establishes design protection for critical UI elements that should remain stable unless explicitly approved by the user. All protected elements are marked with `DESIGN-PROTECTED` comments in the code.

## Change Control Protocol

### Before Making Any Changes:
1. **Check for `DESIGN-PROTECTED` comments** in relevant files
2. **Identify if the change affects any protected element** listed below
3. **Ask explicit permission**: "This change would affect [protected element]. Should I proceed?"
4. **Explain the impact** of the proposed change
5. **Wait for explicit user approval** before proceeding

### Protected Change Categories:
- ❌ **Positioning** (fixed, absolute, z-index, top/left/right values)
- ❌ **Visibility Logic** (when components show/hide)
- ❌ **Visual Styling** (colors, fonts, shadows, backgrounds)
- ❌ **Layout Structure** (flex, grid, spacing, containers)
- ❌ **Component Hierarchy** (parent-child relationships)

---

## Protected Design Elements

### 1. SubNavigation Component (`/src/components/SubNavigation.tsx`)

**Protected Behaviors:**
- ✅ Floats directly over background images with NO backdrop/background
- ✅ Only appears on leaf pages (galleries), hidden on category pages with square cards
- ✅ Fixed positioning at `top-[160px]` to align below main navigation

**Protected Styling:**
```tsx
// Container positioning - PROTECTED
className="fixed top-[160px] left-0 right-0 z-30"

// Text styling - PROTECTED  
className="text-lg font-normal tracking-wide transition-colors duration-200 drop-shadow-lg"

// Active/inactive colors - PROTECTED
isActive ? 'text-amber-400' : 'text-white hover:text-white/90'
```

**Protected Layout:**
- Max width container: `max-w-5xl mx-auto px-6`
- Vertical padding: `py-3`
- Horizontal spacing: `space-x-8`
- Center alignment: `flex items-center justify-center`

---

### 2. SubNavigation Visibility Logic (`/src/components/SiteLayout.tsx`)

**Protected Functions:**
- `getBasePath()` - Determines which sub-navigation to show
- `isLeafPage()` - Controls when sub-navigation appears
- `shouldShowSubNav` - Final visibility decision

**Protected Behaviors:**
- ✅ Shows sub-nav ONLY on leaf pages (actual galleries)
- ✅ Hides sub-nav on category pages (with square cards)
- ✅ Supports both astrophotography and terrestrial navigation patterns

**Protected Logic Patterns:**
```typescript
// Astrophotography: 3+ segments = leaf page
if (segments.length >= 3 && segments[0] === 'astrophotography') {
  return true;
}

// Terrestrial: 2+ segments = leaf page  
if (segments.length >= 2 && segments[0] === 'terrestrial') {
  return true;
}
```

---

### 3. Navigation Timing and Positioning

**Protected Spacing:**
- Main navigation height affects SubNavigation positioning
- Page content padding: `pt-[148px]` accounts for both navs
- No overlapping or covering of page titles

---

### 4. Manual Metadata Entries (`/src/data/metadata.json`)

**Simple Protection System:**
All metadata entries now include a `"protected": true/false` field for complete user control.

**How It Works:**
- `"protected": false` → Entry can be automatically updated
- `"protected": true` → Entry is fully protected from any automatic changes

**Protected Entry Example:**
```json
{
  "my-telescope.jpg": {
    "equipmentName": "My Custom Telescope Name", 
    "equipmentInfo": "Special details I wrote",
    "protected": true  // ← This prevents ANY automatic updates
  },
  "auto-generated.jpg": {
    "equipmentName": "Auto Generated Name",
    "equipmentInfo": "",
    "protected": false  // ← This allows automatic updates
  }
}
```

**Benefits:**
- ✅ Simple boolean control - no guessing about protection logic
- ✅ Complete protection when enabled - no edge cases
- ✅ Granular control - protect individual entries, not entire categories
- ✅ Clear intent - easy to see which entries are manually customized

---

## Example Protected vs Allowed Changes

### ❌ **REQUIRES PERMISSION:**
- Changing `top-[160px]` to any other value
- Adding background/backdrop to SubNavigation
- Modifying visibility logic (when sub-nav shows/hides)
- Changing text colors or drop-shadow
- Altering the floating behavior over images

### ✅ **GENERALLY ALLOWED:**
- Adding new sub-navigation items to config
- Updating href paths in navigation config
- Adding analytics/tracking to existing links
- Minor accessibility improvements that don't affect visual design
- Bug fixes that preserve existing behavior

---

## Current State Baseline (Established: December 2024)

### SubNavigation Behavior:
- ✅ Appears on: `/astrophotography/deep-sky/galaxies`, `/terrestrial/yellowstone`
- ✅ Hidden on: `/astrophotography/deep-sky`, `/terrestrial`, `/`
- ✅ Styling: Large white text with amber active state, drop shadow for visibility
- ✅ Layout: Centered horizontally, fixed position floating over content

### Key Design Decisions:
1. **No background/backdrop** - maintains clean overlay aesthetic
2. **Leaf pages only** - prevents confusion on category selection pages  
3. **Drop shadow** - ensures text visibility over varied background images
4. **Fixed positioning** - consistent placement regardless of content scroll

---

## Violation Response

If protected elements are modified without permission:
1. **Immediately revert** the change
2. **Apologize** for the violation
3. **Re-confirm** the protection protocol
4. **Ask permission** before proceeding with any alternative approach

---

## Document Updates

This document should be updated whenever:
- New protected elements are identified
- Design decisions are explicitly approved by user
- Protection status changes for existing elements

**Last Updated:** December 2024  
**Next Review:** When major design changes are requested
