# Implementation Details - Clear Sky Chart System

## Working Next.js Implementation Analysis

### RGB Color Analysis System
The Next.js implementation uses a sophisticated RGB color mapping system that analyzes Clear Sky Chart images pixel by pixel.

#### Color Scale Mapping (`clear-sky-color-scale.ts`)
- **Scale**: 1-5 rating system (5 = excellent conditions, 1 = poor)
- **Method**: Euclidean distance calculation between sampled RGB and known color scale
- **Accuracy**: Pixel-perfect matching with error tolerance
- **Coverage**: 22 distinct color mappings from dark blue (excellent) to white (poor)

#### Image Parser (`clear-sky-parser.ts`)
- **Library**: Sharp.js for image processing
- **Method**: Universal coordinate system works across all Clear Sky Chart locations
- **Sampling**: 3x3 pixel area averaging for noise reduction
- **Parameters**: Cloud cover, transparency, seeing conditions
- **Time Sync**: Dynamic correlation with chart generation timestamps

### OpenAI Integration
The system uses GPT-4 for intelligent analysis of forecast conditions.

#### Prompt Engineering
- **Role**: Expert astronomer and stargazing advisor
- **Context**: User location, equipment, experience level
- **Input**: Structured forecast data + user preferences
- **Output**: Natural language recommendations with specific time windows

#### Data Structure
```json
{
  "location": "Four Peaks Observatory, WA",
  "currentConditions": {
    "cloudCover": [4, 4, 3, 2, ...],
    "transparency": [3, 4, 4, 3, ...],
    "seeing": [3, 3, 4, 4, ...]
  },
  "userPreferences": {
    "observationType": "deep-sky",
    "sessionDuration": "3-4 hours",
    "equipment": "8-inch SCT"
  }
}
```

### Email/SMS Notification System

#### Scheduling Logic
- **Times**: 8:00 AM and 5:00 PM daily
- **Triggers**: Only for "Good" or "Excellent" rated nights
- **Provider**: Formspree.io for reliable email delivery
- **Format**: HTML email with detailed forecast breakdown

#### Notification Content
- **Subject**: "Great Night for Stargazing Tonight!"
- **Content**: 
  - Overall recommendation (Good/Excellent)
  - Best observing time windows
  - Specific equipment recommendations
  - Weather alerts or special notes
  - Clear Sky Chart image embedded

### Configuration System

#### Observation Criteria (`observation-criteria.json`)
Complete user customization of rating thresholds:
- **Moon Phase Preferences**: Tolerance levels for different lunar phases
- **Cloud Cover Thresholds**: Percentage limits for each rating level
- **Transparency Requirements**: Minimum acceptable transparency
- **Seeing Standards**: Prioritization for planetary vs deep-sky
- **Weather Limits**: Rain, wind, humidity thresholds

#### Chart Configuration (`chart-config.ts`)
Universal coordinate system that works for any Clear Sky Chart:
```typescript
{
  parameters: {
    cloudCover: { x: 163, y: 35 },
    transparency: { x: 163, y: 50 },
    seeing: { x: 163, y: 65 }
  },
  hourlySpacing: 14,
  maxHours: 48
}
```

## Technical Implementation Details

### Image Processing Pipeline
1. **Fetch**: Download GIF image from Clear Sky Chart URL
2. **Decode**: Convert to raw pixel data using Sharp.js
3. **Sample**: Extract RGB values at precise coordinates
4. **Average**: 3x3 area sampling for noise reduction
5. **Map**: Convert RGB to 1-5 rating using color scale
6. **Sync**: Correlate pixel columns with actual forecast hours

### Error Handling
- **Network Failures**: Graceful degradation with cached data
- **Parse Errors**: Detailed logging for debugging
- **API Limits**: Rate limiting and retry logic
- **Invalid Data**: Fallback to manual assessment prompts

### Performance Optimization
- **Caching**: Forecast data cached for 30 minutes
- **Compression**: Efficient image processing with Sharp
- **Batching**: Multiple parameter rows processed in single pass
- **Async**: Non-blocking operations throughout pipeline

## Migration Considerations for Astro

### Server-Side Requirements
- **Sharp.js**: Image processing library compatibility
- **Node.js APIs**: File system and network operations
- **Environment Variables**: Secure API key storage
- **Cron Jobs**: Scheduled notification system

### Client-Side Considerations
- **Hydration**: Interactive components need client-side JavaScript
- **State Management**: Forecast data state across components
- **Error Boundaries**: User-friendly error handling
- **Loading States**: Smooth UX during data fetching

### API Route Structure
Astro API routes will need to handle:
- **GET /api/observation-evaluate**: Real-time forecast analysis
- **POST /api/send-daily-report**: Triggered email notifications
- **GET /api/forecast-data**: Cached forecast data retrieval

This level of detail ensures the Astro migration maintains 100% feature parity with the proven Next.js implementation.
