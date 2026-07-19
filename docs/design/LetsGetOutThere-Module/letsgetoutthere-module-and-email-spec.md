# "Let's Get Out There" Observation Module & Email System

## Overview
This document outlines the specification and plan for developing an observation recommendation module that displays nightly stargazing conditions on the site (below the Clear Sky Clock) and sends automated email notifications with recommendations.

---

## Objectives
1. **Observation Module**:
   - Create a site module to display nightly observation recommendations directly below the Clear Sky Clock.
   - Provide a summary of conditions in a visually appealing and mobile-friendly format.

2. **Criteria Configuration Interface**:
   - Allow customization of criteria for determining observation quality.
   - Include parameters such as:
     - Clear skies until a specific time (e.g., 3:00 AM).
     - Transparency
     - Seeing
     - Rain forecast (to protect equipment).
     - Moon phase, rise and set times, and maximum altitude.

3. **Daily Email Notifications**:
   - Send an email every day to the user's "Contact Us" email address.
   - Provide a recommendation on whether the night is suitable for stargazing or astrophotography.

---

## Data Sources
1. **Clear Sky Chart**:
   - Provides cloud cover, transparency, seeing, and darkness data.
   - URL: [Clear Sky Chart for Four Peaks Observatory](https://www.cleardarksky.com/c/FourPksObWAkey.html)

2. **Moon Data**:
   - Source for moon phase, rise/set times, and altitude:
     - [US Naval Observatory API](https://aa.usno.navy.mil/data)
     - [Time and Date API](https://www.timeanddate.com/services/api/)
     - [AstronomyAPI](https://astronomyapi.com/)

---

## Implementation Plan

### 1. **Observation Module**
- **Purpose**:
  - Display the nightly observation recommendation directly on the site, below the Clear Sky Clock.
  - Provide a summary of conditions in a visually appealing and mobile-friendly format.

- **Design**:
  - Use inline CSS to match the site's existing style (no Tailwind CSS).
  - Ensure the module visually complements the Clear Sky Clock.
  - Responsive design for mobile compatibility.

- **Content**:
  - Recommendation: "Yes, it's a good night," "Dubious," or "Not a good night."
  - Summary of conditions:
    - Cloud cover and transparency.
    - Seeing conditions.
    - Moon phase, rise/set times, and altitude.
    - Rain forecast.
    - Additional notes (e.g., "Great night until 1:00 AM due to moonrise.")

- **Implementation**:
  - Create a React component for the module.
  - Fetch data from the Clear Sky Chart and moon data APIs.
  - Evaluate conditions based on configurable parameters.
  - Display the recommendation and summary in a clean, concise format.

- **Placement**:
  - Position the module directly below the Clear Sky Clock on the site.
  - Ensure the layout and design make sense in the context of the Clear Sky Clock.

- **Mobile Compatibility**:
  - Use responsive design techniques to ensure the module looks great on all screen sizes.
  - Test the module on various devices to ensure usability and readability.

### 2. **Criteria Configuration Interface**
- **Purpose**:
  - Allow the user to configure observation criteria directly from the admin panel.
  - Provide granular control over each observing parameter.

- **Placement**:
  - Integrate the interface into the existing admin panel at `http://localhost:3000/admin/asset-manager`.

- **Detailed Configuration Parameters**:

  #### **Moon Phase Configuration**
  - **Good for Observing**: 
    - Checkbox options: New Moon (±2 days), Waxing Crescent (≤25%), Waning Crescent (≤25%)
  - **Dubious for Observing**: 
    - Checkbox options: First Quarter (25-50%), Third Quarter (50-75%), Waxing Gibbous (50-75%)
  - **Poor for Observing**: 
    - Checkbox options: Full Moon (±3 days), Waxing Gibbous (75-100%), Waning Gibbous (75-100%)
  - **Moon Altitude Threshold**: Slider (0-90°) - "Consider moon problematic when above X degrees"
  
  #### **Moon Rise/Set Time Configuration**
  - **Good Observing Window**: 
    - Start Time: Time picker (default: sunset)
    - End Time: Time picker (default: 3:00 AM)
  - **Moon Impact Rules**:
    - Radio buttons: 
      - "Moon doesn't matter if it sets before my session starts"
      - "Moon matters even if it sets during my session"
      - "Moon only matters if it's up for majority of session"

  #### **Cloud Cover Configuration**
  - **Excellent**: ≤10% cloud cover (checkbox: "Required for rating 'Excellent'")
  - **Good**: ≤25% cloud cover (checkbox: "Acceptable for 'Good'")
  - **Dubious**: 26-50% cloud cover (checkbox: "Mark as 'Dubious'")
  - **Poor**: >50% cloud cover (checkbox: "Mark as 'Poor'")
  - **Time Duration**: "Require clear skies for at least X consecutive hours" (number input)

  #### **Transparency Configuration**
  - **Excellent**: "Above Average" or "Transparent" (checkbox)
  - **Good**: "Average" transparency (checkbox)
  - **Dubious**: "Below Average" transparency (checkbox)
  - **Poor**: "Poor" transparency or "Too cloudy to forecast" (checkbox)

  #### **Seeing Configuration**
  - **Excellent**: "Excellent (5/5)" or "Good (4/5)" seeing (checkboxes)
  - **Good**: "Average (3/5)" seeing (checkbox)
  - **Dubious**: "Poor (2/5)" seeing (checkbox)
  - **Poor**: "Bad (1/5)" or "Too cloudy to forecast" (checkboxes)
  - **Observation Type Weight**: 
    - Radio buttons: "Prioritize for planetary observation", "Prioritize for deep sky", "Balanced"

  #### **Weather/Rain Configuration**
  - **Rain Forecast**: 
    - Checkbox: "Any rain forecast = automatic 'Poor' rating"
    - Checkbox: "Rain probability >X% = 'Dubious'" (number input for percentage)
  - **Humidity Threshold**: "High dew risk when humidity >X%" (slider 70-95%)
  - **Wind Speed**: "Problematic when wind >X mph" (number input, default: 15)

  #### **Temperature Configuration**
  - **Comfort Range**: 
    - Min temp for "Good": number input (°F)
    - Min temp for "Dubious": number input (°F)
  - **Equipment Considerations**: 
    - Checkbox: "Factor in mirror cooling time for thick primaries"
    - Checkbox: "Warn about battery performance in cold"

- **Logic Engine Integration**:
  - Button: "Test Current Configuration" - sends sample data to OpenAI for validation
  - Text area: "Custom Instructions for AI" - allows user to add specific preferences
  - Dropdown: "Observation Priority" - Deep Sky Objects, Planetary, General Stargazing, Astrophotography

### 3. **AI-Powered Logic Engine**
- **Purpose**:
  - Use OpenAI API to intelligently evaluate all configured criteria and provide nuanced recommendations.

- **Implementation**:
  - **API Integration**: 
    - Use OpenAI GPT-4 API to process observation data
    - Send structured data payload with all current conditions and user preferences
    - Receive detailed recommendation with reasoning
  
  - **Data Payload Structure**:
    ```json
    {
      "location": "Four Peaks Observatory, WA",
      "date": "2025-10-07",
      "userPreferences": {
        "observationType": "deep-sky",
        "sessionDuration": "3-4 hours",
        "moonTolerances": {...},
        "weatherTolerances": {...}
      },
      "currentConditions": {
        "cloudCover": [...], // hourly data
        "transparency": [...],
        "seeing": [...],
        "moonPhase": 0.85,
        "moonRise": "20:30",
        "moonSet": "08:15",
        "weather": {...}
      }
    }
    ```

  - **AI Prompt Engineering**:
    - System prompt defining role as "expert astronomer and stargazing advisor"
    - Include user's specific equipment and experience level
    - Request structured response with overall rating, time windows, and specific advice

  - **Response Processing**:
    - Parse AI response for structured recommendations
    - Extract overall rating ("Excellent", "Good", "Dubious", "Poor")
    - Identify optimal time windows
    - Extract specific warnings or opportunities

### 4. **Enhanced Data Sources**
- **Clear Sky Chart**: Cloud cover, transparency, seeing, darkness
- **Moon Data API**: 
  - Primary: [USNO Web Services](https://aa.usno.navy.mil/data/api)
  - Backup: [IPGeolocation Astronomy API](https://ipgeolocation.io/astronomy-api.html)
- **Weather Data**: 
  - Integrate additional weather API for rain/precipitation forecasts
  - [OpenWeatherMap API](https://openweathermap.org/api) for detailed weather
- **OpenAI API**: GPT-4 for intelligent recommendation logic
- **Functionality**:
  - Fetch Clear Sky Chart data.
  - Fetch moon data (phase, rise/set times, altitude).
  - Evaluate conditions based on configurable parameters.
  - Generate a recommendation and detailed summary.

- **Technologies**:
  - Node.js for scripting.
  - Libraries:
    - `axios` for HTTP requests.
    - `nodemailer` for sending emails.

- **Steps**:
  1. Fetch Clear Sky Chart data.
  2. Fetch moon data from an external API.
  3. Evaluate conditions based on:
     - Cloud cover.
     - Transparency.
     - Seeing.
     - Moon phase and rise/set times.
     - Rain forecast.
  4. Generate a recommendation and detailed summary.
  5. Send the email.

### 5. **Daily Evaluation Script**
- **Functionality**:
  - Fetch Clear Sky Chart data.
  - Fetch moon data (phase, rise/set times, altitude).
  - Fetch additional weather data.
  - Load user configuration preferences.
  - Send data to OpenAI API for evaluation.
  - Generate recommendation and detailed summary.

- **Technologies**:
  - Node.js for scripting.
  - Libraries:
    - `axios` for HTTP requests.
    - `openai` for AI API integration.
    - `nodemailer` for sending emails.

- **Steps**:
  1. Fetch Clear Sky Chart data.
  2. Fetch moon data from USNO API.
  3. Fetch weather data from OpenWeatherMap.
  4. Load user preferences from configuration file.
  5. Structure data payload for AI analysis.
  6. Send to OpenAI API and receive recommendation.
  7. Format results for display and email.
  8. Update site module and send email notification.

### 6. **Email Notification**
- **Content**:
  - Subject: "Observation Conditions for [Date]"
  - Body:
    - Recommendation: "Yes, it's a good night," "Dubious," or "Not a good night."
    - Detailed summary with bullet points.

- **Technologies**:
  - Use `nodemailer` to send emails.
  - Use the "Contact Us" email address configured by the user.

### 5. **Scheduling**
- **Task Scheduler**:
  - Use `cron` to run the script daily.
  - Example: Schedule the script to run at 12:00 PM every day.

---

## Future Enhancements
1. **SMS Notifications**:
   - Integrate with Twilio or email-to-SMS gateways to send text notifications.

2. **Web Dashboard**:
   - Create a web interface to view recommendations and update configuration.

3. **Advanced Weather Data**:
   - Integrate additional weather APIs for more detailed forecasts.

---

## Next Steps
1. Develop the daily evaluation script.
2. Integrate email notifications using `nodemailer`.
3. Test the system with real data.
4. Deploy the script and schedule it to run daily.

---

## References
- [Clear Sky Chart](https://www.cleardarksky.com/c/FourPksObWAkey.html)
- [US Naval Observatory API](https://aa.usno.navy.mil/data)
- [Time and Date API](https://www.timeanddate.com/services/api/)
- [AstronomyAPI](https://astronomyapi.com/)

## Detailed Implementation Plan

### **Phase 1: Foundation Setup (Week 1)**

#### **Step 1.1: Create Configuration Data Structure**
- Create `/src/config/observation-criteria.json` with default values
- Define TypeScript interfaces for all configuration options
- Create validation schema for configuration data

#### **Step 1.2: Admin Interface Integration**
- Add new section to `/src/app/admin/asset-manager/page.tsx`
- Create observation criteria configuration form with:
  - Moon phase checkboxes and sliders
  - Cloud cover percentage inputs
  - Transparency dropdown selections
  - Seeing quality checkboxes
  - Weather threshold inputs
  - Custom AI instructions text area
- Add save/load functionality for configuration

#### **Step 1.3: API Route Setup**
- Create `/src/app/api/observation-config/route.ts` for saving/loading config
- Create `/src/app/api/observation-evaluate/route.ts` for getting recommendations
- Set up OpenAI API integration with error handling

### **Phase 2: Data Integration (Week 2)**

#### **Step 2.1: Clear Sky Chart Parser**
- Create utility to parse Clear Sky Chart data
- Extract hourly cloud cover, transparency, seeing values
- Handle different time zones and data formats

#### **Step 2.2: Moon Data Integration**
- Integrate USNO Web Services API
- Calculate moon phase, rise/set times, altitude
- Create backup system with alternative APIs

#### **Step 2.3: Weather Data Enhancement**
- Add OpenWeatherMap API integration
- Get precipitation forecast, humidity, wind speed
- Combine with Clear Sky Chart data

### **Phase 3: AI Logic Engine (Week 2-3)**

#### **Step 3.1: OpenAI Integration**
- Design system prompt for astronomical advisor role
- Create structured data payload format
- Implement response parsing and validation

#### **Step 3.2: Recommendation Logic**
- Build prompt that considers all user preferences
- Include time-based recommendations (good until X time)
- Handle edge cases and fallback scenarios

#### **Step 3.3: Testing Framework**
- Create test scenarios with known conditions
- Validate AI responses against expected recommendations
- Fine-tune prompts based on results

### **Phase 4: Site Module Development (Week 3-4)**

#### **Step 4.1: React Component Creation**
- Create `ObservationModule.tsx` component
- Design layout to complement Clear Sky Clock
- Implement responsive design for mobile

#### **Step 4.2: Visual Design**
- Use inline CSS matching site's design tokens
- Create status indicators (Good/Dubious/Poor)
- Design expandable details section
- Add loading states and error handling

#### **Step 4.3: Integration**
- Add module to homepage below Clear Sky Clock
- Implement real-time data fetching
- Add refresh functionality

### **Phase 5: Email System (Week 4)**

#### **Step 5.1: Email Template Design**
- Create HTML email template
- Include recommendation summary
- Add detailed conditions breakdown
- Ensure mobile email compatibility

#### **Step 5.2: Scheduling System**
- Set up daily cron job
- Configure email sending via nodemailer
- Add error handling and retry logic

#### **Step 5.3: Testing and Deployment**
- Test email delivery and formatting
- Validate recommendation accuracy
- Deploy scheduling system

### **Technical Requirements**

#### **Environment Variables Needed**
```
OPENAI_API_KEY=your_openai_api_key
OPENWEATHER_API_KEY=your_openweather_api_key
EMAIL_HOST=your_smtp_host
EMAIL_USER=your_email_user
EMAIL_PASS=your_email_password
```

#### **New Dependencies**
```json
{
  "openai": "^4.0.0",
  "node-cron": "^3.0.0",
  "nodemailer": "^6.9.0"
}
```

#### **File Structure**
```
src/
├── components/
│   └── ObservationModule.tsx
├── config/
│   └── observation-criteria.json
├── lib/
│   ├── clear-sky-parser.ts
│   ├── moon-data.ts
│   ├── weather-data.ts
│   └── ai-evaluator.ts
├── app/
│   ├── api/
│   │   ├── observation-config/
│   │   └── observation-evaluate/
│   └── admin/asset-manager/
└── types/
    └── observation.ts
```
