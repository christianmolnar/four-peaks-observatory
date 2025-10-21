# Factor Weights Implementation Plan

## Overview
Implement site-wide factor weight configuration accessible through the asset-manager interface, with those settings being respected across all components.

## Current Issues Analysis

### Phase 1: Critical Fixes (Before Push)

#### TypeScript Errors (14 issues):
1. **Test file corruption** - `clear-sky-parser.test.ts` has mangled import statements and duplicate content
2. **Missing exports** - `mapRgbToRating` not exported from `clear-sky-parser.ts`
3. **Broken import syntax** - Corrupted import lines with `rtData` and malformed statements
4. **Function name mismatches** - Still using `mapRgbToSeeingRating` instead of `mapRgbToRating`

#### Test Failures (28 tests):
1. **Import failures** - Tests can't import required functions due to export issues
2. **Function name errors** - Tests calling non-existent `mapRgbToSeeingRating`
3. **Broken test structure** - Corrupted test file syntax preventing execution
4. **Module resolution** - Import paths pointing to non-exported functions

### Phase 1 Implementation Steps:

#### Step 1: Fix Test File Corruption
- Clean up `clear-sky-parser.test.ts` import statements
- Remove duplicate and mangled content
- Fix all `mapRgbToSeeingRating` references to `mapRgbToRating`
- Ensure proper test structure

#### Step 2: Fix Missing Exports
- Export `mapRgbToRating` from `clear-sky-parser.ts`
- Verify all required functions are properly exported
- Update import statements in test files

#### Step 3: Validate All Tests
- Run full test suite to ensure 0 failures
- Fix any remaining property name mismatches
- Ensure TypeScript compilation succeeds

## Phase 2: Factor Weights Site-Wide Configuration

### Current State Analysis:
- Factor weights currently stored in localStorage (browser-specific)
- Default values hardcoded: `{ cloudCover: 40, transparency: 30, seeing: 30 }`
- Asset-manager has working Factor Weight Configuration UI
- No way to set organization-wide defaults for production

### Proposed Solution:

#### Architecture Overview:
```
Asset Manager (Admin) → Server-Side Storage → All Components
```

#### Component Flow:
1. **Factor Weight Configuration UI** - Always visible in asset-manager Clear Sky Analysis
2. **Centralized Storage** - Server-side storage for site-wide defaults
3. **Fallback Chain** - User localStorage → Site defaults → Hardcoded defaults

#### Implementation Strategy:

##### Step 1: Create Site-Wide Storage API
```typescript
// New API endpoints:
// GET  /api/admin/factor-weights - Get current site defaults
// POST /api/admin/factor-weights - Set site defaults (admin only)
```

##### Step 2: Update Factor Weight Configuration Component
- Move component to shared location (`/src/components/FactorWeightConfiguration.tsx`)
- Add "site-wide" vs "personal" mode toggle
- Integrate with both localStorage and site-wide API

##### Step 3: Create Site Defaults Storage
```typescript
// /src/lib/site-factor-weights.ts
interface SiteFactorWeights {
  cloudCover: number;
  transparency: number;
  seeing: number;
  lastUpdated: Date;
  updatedBy: string;
}
```

##### Step 4: Update All Components to Use Hierarchy
```typescript
// Priority order:
// 1. User localStorage (if exists and valid)
// 2. Site-wide defaults (from API)
// 3. Hardcoded fallback (40/30/30)
```

##### Step 5: Asset Manager Integration
- Factor Weight Configuration always visible below Clear Sky Chart
- Admin can set site-wide defaults
- Visual indicator showing current active values (personal vs site-wide)

#### File Changes Required:

##### New Files:
- `/src/components/FactorWeightConfiguration.tsx` (extract from ObservationModuleCustom)
- `/src/lib/site-factor-weights.ts` (site-wide storage logic)
- `/src/app/api/admin/factor-weights/route.ts` (API endpoints)

##### Modified Files:
- `/src/components/ObservationModuleCustom.tsx` (use shared component)
- `/src/app/admin/asset-manager/page.tsx` (always show factor config)
- `/src/lib/observation-evaluator.ts` (use factor weight hierarchy)

#### Data Flow:
1. **Admin sets site defaults** via Asset Manager → Server storage
2. **Components load factors** in priority order: localStorage → Site defaults → Hardcoded
3. **Users can override** with personal preferences (localStorage)
4. **Site defaults apply** to all users without personal overrides

#### Benefits:
- ✅ Site-wide factor control for production
- ✅ Users can still personalize if needed
- ✅ Clean fallback hierarchy
- ✅ Admin-friendly interface
- ✅ No breaking changes to existing localStorage usage

#### Storage Implementation Options:

##### Option A: JSON File Storage (Simple)
```typescript
// /src/data/site-factor-weights.json
{
  "cloudCover": 40,
  "transparency": 30,
  "seeing": 30,
  "lastUpdated": "2025-10-20T10:30:00Z",
  "updatedBy": "admin"
}
```

##### Option B: Database Storage (Future-proof)
- If planning user accounts/multi-admin in future
- More robust for production environment

**Recommendation**: Start with Option A (JSON file) for simplicity, easy to migrate to database later.

#### Security Considerations:
- Admin-only access to site-wide factor setting
- Validate factor weights (must total 100%)
- Rate limiting on factor weight API calls
- Audit trail of changes

#### Testing Strategy:
- Unit tests for factor weight hierarchy logic
- Integration tests for API endpoints
- E2E tests for asset manager functionality
- Backward compatibility tests for localStorage

#### Rollout Plan:
1. **Phase 2A**: Create shared component and site storage
2. **Phase 2B**: Add API endpoints and admin interface
3. **Phase 2C**: Update all components to use hierarchy
4. **Phase 2D**: Testing and validation
5. **Phase 2E**: Production deployment

#### Success Criteria:
- ✅ Admin can set site-wide defaults via Asset Manager
- ✅ All components respect site-wide defaults
- ✅ Users can still override with personal preferences
- ✅ Clean, maintainable code without repeated hardcoded values
- ✅ Zero breaking changes for existing functionality

## Timeline Estimate:
- **Phase 1** (Critical Fixes): 1-2 hours
- **Phase 2** (Factor Configuration): 4-6 hours

## Risk Assessment:
- **Low Risk**: Well-defined scope, existing UI can be reused
- **Mitigation**: Thorough testing before production deployment
- **Rollback**: localStorage fallback ensures no functionality loss
