# Clear Sky Chart Parser Analysis & Cleanup Plan

## Pixel Coordinate Analysis Results ✅

Based on the sample Clear Sky Chart analysis, here are the **PRECISE PIXEL COORDINATES**:

### Chart Dimensions
- **Image Size**: 1284x292 pixels
- **Chart Area**: Left=0, Right=1279, Top=33, Bottom=291
- **Data Area**: 1279x258 pixels
- **Square Width**: 14 pixels (average)

### Parameter Row Coordinates (Y-positions)
```typescript
const PARAMETER_ROWS = {
  cloudCover: { centerY: 71, startY: 61, endY: 81 },      // 15% from top
  ecmwfCloud: { centerY: 97, startY: 87, endY: 107 },     // 25% from top  
  transparency: { centerY: 123, startY: 113, endY: 133 }, // 35% from top
  seeing: { centerY: 149, startY: 139, endY: 159 },       // 45% from top
  darkness: { centerY: 174, startY: 164, endY: 184 },     // 55% from top
  smoke: { centerY: 200, startY: 190, endY: 210 },        // 65% from top
  wind: { centerY: 226, startY: 216, endY: 236 },         // 75% from top
  humidity: { centerY: 252, startY: 242, endY: 262 },     // 85% from top
  temperature: { centerY: 278, startY: 268, endY: 288 }   // 95% from top
};
```

### Column Structure
- **First Data Column**: X ≈ 146 (after labels)
- **Column Width**: 14 pixels per time period
- **Column Spacing**: 14 pixels between centers
- **Total Columns**: ~81 columns (48 hours + header/footer)

### Detected Colors in Sample Chart
From the row analysis, we can see:
- **ECMWF Cloud (y=97)**: BLUE RGB(0,63,127) ✅
- **Seeing (y=149)**: RED RGB(255,202,109) ❌ (unexpected for seeing)
- **Smoke (y=200)**: BLUE RGB(0,63,127) ✅  
- **Wind (y=226)**: RED RGB(254,198,0) ❌ (unexpected for wind)
- **Humidity (y=252)**: GREEN RGB(93,253,157) ✅ (expected range)

## Code That Needs CLEANUP 🧹

### 1. Main Parser File (BROKEN LOGIC)
📁 `/src/lib/clear-sky-parser.ts` - **877 lines of problematic code**

**Problems:**
- Incorrect RGB color mapping functions
- Wrong coordinate detection logic  
- Hardcoded/guessed row positions
- No proper validation
- Overly complex and unreliable

**Functions to Replace:**
- `mapCloudCoverColor()` - Lines 352-415 ❌
- `mapTransparencyColor()` - Lines 416-443 ❌
- `mapSeeingColor()` - Lines 444-471 ❌
- `analyzeImageWithSharp()` - Lines 127-229 ❌
- `analyzeChartLayoutWithECMWF()` - Lines 231-300 ❌

### 2. Broken Test Files
📁 `/__tests__/clear-sky-parser.test.ts` - **Incorrect expectations**
📁 `/tests/clear-sky-parser.test.ts` - **Duplicate with wrong assertions**

**Problems:**
- Tests expect wrong RGB mappings
- No validation of coordinate detection
- Hardcoded test values that are incorrect

### 3. Debug/Testing Scripts (TEMPORARY FILES)
📁 `/test-parser-direct.js` ❌
📁 `/test-url-parsing.js` ❌  
📁 `/manual-url-test.js` ❌
📁 `/test-parser-improvements.js` ❌
📁 `/analyze-chart.js` ❌ (cleanup after use)

### 4. API Routes Using Broken Parser
📁 `/src/app/api/clear-sky-debug/route.ts` - **Uses broken functions**
📁 `/src/app/api/observation-evaluate/route.ts` - **Depends on broken data**

## NEW IMPLEMENTATION PLAN 🚀

### Step 1: Create New Precise Parser
```typescript
// NEW FILE: /src/lib/clear-sky-parser-v2.ts

interface ChartCoordinates {
  chartBounds: { left: number; right: number; top: number; bottom: number };
  parameterRows: {
    cloudCover: { centerY: 71; startY: 61; endY: 81 };
    ecmwfCloud: { centerY: 97; startY: 87; endY: 107 };
    transparency: { centerY: 123; startY: 113; endY: 133 };
    seeing: { centerY: 149; startY: 139; endY: 159 };
    darkness: { centerY: 174; startY: 164; endY: 184 };
    smoke: { centerY: 200; startY: 190; endY: 210 };
    wind: { centerY: 226; startY: 216; endY: 236 };
    humidity: { centerY: 252; startY: 242; endY: 262 };
    temperature: { centerY: 278; startY: 268; endY: 288 };
  };
  columnGrid: {
    firstDataColumn: 146;
    columnWidth: 14;
    totalColumns: 81;
  };
}
```

### Step 2: RGB Color Scale Definition
**WE NEED YOUR INPUT FOR THESE SCALES:**

#### Cloud Cover Scale (Blue to White)
```typescript
// PLEASE PROVIDE CORRECT MAPPINGS:
const CLOUD_COVER_SCALE = {
  // Example: RGB(0,63,127) → 15% cloud cover
  // What should RGB(255,255,255) map to?
  // What should RGB(0,0,100) map to?
};
```

#### Transparency Scale (Blue to White, 1-5)
```typescript
// PLEASE PROVIDE CORRECT MAPPINGS:
const TRANSPARENCY_SCALE = {
  // Example: RGB(0,63,127) → 4/5 rating
  // What should other RGB values map to?
};
```

#### Other Parameter Scales
- **Seeing**: Blue to White (1-5 scale)
- **Darkness**: Blue to White (magnitude scale)  
- **Smoke**: Blue to White (0-5 scale)
- **Wind**: Blue to White (mph ranges)
- **Humidity**: Full spectrum (Blue→Green→Yellow→Red, 0-100%)
- **Temperature**: Full spectrum (Purple→Blue→Green→Yellow→Red, temperature ranges)

### Step 3: Cleanup Actions

#### Immediate Cleanup:
1. **Archive broken parser**: Move `clear-sky-parser.ts` → `clear-sky-parser-legacy.ts`
2. **Delete test scripts**: Remove all `test-*.js` files
3. **Update test files**: Fix test expectations
4. **Clean up debug APIs**: Simplify debug routes

#### Files to Delete:
- `/test-parser-direct.js`
- `/test-url-parsing.js`  
- `/manual-url-test.js`
- `/test-parser-improvements.js`
- `/analyze-chart.js` (after we're done)

#### Files to Update:
- All API routes importing from clear-sky-parser
- Test files with correct RGB expectations
- Documentation references

## NEXT STEPS - YOUR INPUT NEEDED 🤝

### 1. Validate Pixel Coordinates
**Are these coordinates correct for your sample chart?**
- Cloud Cover row at y=71?
- ECMWF Cloud row at y=97?
- Column width of 14 pixels?
- First data column at x=146?

### 2. Define Color Scales
**For each parameter, what should these RGB values map to?**

#### Cloud Cover (most critical):
- RGB(0,63,127) → __% cloud cover?
- RGB(255,255,255) → __% cloud cover?
- RGB(100,150,200) → __% cloud cover?

#### Other Parameters:
- What are the exact RGB→value mappings for each scale?
- Should we use lookup tables or mathematical functions?

### 3. Validation Strategy
- Should we create a visual validation tool?
- How do you want to verify the parser accuracy?

**Once you provide the color scale mappings, I can implement the new precise parser and clean up all the broken code.**
