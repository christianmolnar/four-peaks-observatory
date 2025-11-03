# "Let's Get Out There Tonight!" Module - Astro Migration Documentation

## Overview
This document outlines the migration of the fully working Clear Sky Chart analysis system from the Next.js implementation to Astro. The Next.js system is working perfectly with RGB image analysis, OpenAI logic, and email/SMS scheduling.

## Working Next.js Implementation

### Core Components
- **Clear Sky Parser**: `/src/lib/clear-sky-parser.ts` - Complete RGB image analysis
- **Color Scale Mapping**: `/src/lib/clear-sky-color-scale.ts` - RGB to rating conversion
- **Chart Time Sync**: `/src/lib/chart-time-sync.ts` - Time correlation logic
- **Chart Configuration**: `/src/lib/chart-config.ts` - Universal coordinates
- **Observation Module**: `/src/components/ObservationModule.tsx` - UI component
- **API Endpoints**: 
  - `/api/observation-evaluate` - Real-time recommendations
  - `/api/send-daily-report` - Scheduled email/SMS

### Key Features Working in Next.js
1. **RGB Image Analysis**: Pixel-perfect color mapping from Clear Sky Chart images
2. **OpenAI Integration**: Intelligent recommendation logic with natural language output
3. **Email/SMS Scheduling**: Automated reports at 8 AM and 5 PM for good/excellent nights only
4. **Dynamic Time Correlation**: Syncs chart generation time with actual forecast hours
5. **Comprehensive Configuration**: User-customizable criteria for all observation parameters

## Migration Requirements for Astro

### 1. Server-Side Components (Astro API Routes)
All Next.js API routes need to be migrated to Astro API endpoints:

```
/astro-mvo/src/pages/api/observation-evaluate.ts
/astro-mvo/src/pages/api/send-daily-report.ts
```

### 2. Client-Side Components (Astro Components)
- Migrate `ObservationModule.tsx` to `ObservationModule.astro`
- Maintain all existing functionality and styling
- Ensure compatibility with Astro's client-side hydration

### 3. Utility Libraries (Direct Copy)
These can be copied directly from Next.js with minimal modifications:
- `clear-sky-parser.ts`
- `clear-sky-color-scale.ts`
- `chart-time-sync.ts`
- `chart-config.ts`

### 4. Environment Variables
Required environment variables for production:
```
OPENAI_API_KEY=sk-...
FORMSPREE_ENDPOINT=https://formspree.io/f/...
NOTIFICATION_EMAIL=your-email@domain.com
NOTIFICATION_PHONE=+1234567890
```

### 5. Dependencies
Required packages to add to Astro project:
```json
{
  "sharp": "^0.32.6",
  "openai": "^4.20.1",
  "formspree": "^2.0.1"
}
```

## Implementation Priority

### Phase 1: Core Migration
1. Copy utility libraries to `/astro-mvo/src/utils/`
2. Create Astro API routes for observation evaluation
3. Migrate ObservationModule component to Astro

### Phase 2: Email/SMS System
1. Implement scheduled notification system
2. Set up Formspree integration for email delivery
3. Configure SMS notifications (if applicable)

### Phase 3: Testing & Refinement
1. Verify pixel-perfect color analysis
2. Test OpenAI recommendation accuracy
3. Validate email/SMS scheduling

## Success Criteria
- Identical functionality to working Next.js implementation
- Same RGB analysis accuracy
- Preserved email/SMS scheduling capability
- OpenAI recommendations maintain quality and format
- No regression in user experience

## Notes
The Next.js implementation is the authoritative source. All migration decisions should preserve the existing functionality that users have validated as working correctly.
