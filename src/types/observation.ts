// TypeScript interfaces for observation criteria and recommendations

export interface LocationConfig {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  clearSkyChartUrl: string;
  clearSkyChartImageUrl: string;
}

export interface ObservingWindowConfig {
  startOffset: number; // minutes after sunset
  endOffset: number; // minutes before sunrise
  description: string;
}

export interface MoonPhaseConfig {
  goodPhases: string[]; // e.g., ["new", "waxing_crescent_25", "waning_crescent_25"]
  dubiousPhases: string[]; // e.g., ["first_quarter", "third_quarter", "waxing_gibbous_50-75"]
  poorPhases: string[]; // e.g., ["full", "waxing_gibbous_75-100", "waning_gibbous_75-100"]
  altitudeThreshold: number; // degrees 0-90
}

export interface MoonTimingConfig {
  observingWindowStart: string; // "sunset" or HH:MM format
  observingWindowEnd: string; // HH:MM format, default "03:00"
  moonImpactRule: "sets_before_session" | "sets_during_session" | "up_majority_session";
}

export interface CloudCoverConfig {
  excellent: { threshold: number; required: boolean }; // ≤10%
  good: { threshold: number; acceptable: boolean }; // ≤25%
  dubious: { threshold: number; mark: boolean }; // 26-50%
  poor: { threshold: number; mark: boolean }; // 51-75%
  overcast: { threshold: number; automatic_poor: boolean }; // >75% = automatic poor
  consecutiveHours: number; // minimum clear hours required
}

export interface TransparencyConfig {
  excellent: string[]; // ["above_average", "transparent"]
  good: string[]; // ["average"]
  dubious: string[]; // ["below_average"]
  poor: string[]; // ["poor", "too_cloudy"]
}

export interface SeeingConfig {
  excellent: string[]; // ["excellent_5", "good_4"]
  good: string[]; // ["average_3"]
  dubious: string[]; // ["poor_2"]
  poor: string[]; // ["bad_1", "too_cloudy"]
  observationType: "planetary" | "deep_sky" | "balanced";
}

export interface WeatherConfig {
  rainAutomatic: boolean; // any rain = poor
  rainProbabilityThreshold: number; // percentage for dubious
  humidityThreshold: number; // 70-95% for dew risk
  windSpeedThreshold: number; // mph for problematic
}

export interface TemperatureConfig {
  goodMinTemp: number; // °F
  dubiousMinTemp: number; // °F
  considerMirrorCooling: boolean;
  warnBatteryPerformance: boolean;
}

export interface ObservationCriteria {
  location: LocationConfig;
  observingWindow: ObservingWindowConfig;
  moonPhase: MoonPhaseConfig;
  moonTiming: MoonTimingConfig;
  cloudCover: CloudCoverConfig;
  transparency: TransparencyConfig;
  seeing: SeeingConfig;
  weather: WeatherConfig;
  temperature: TemperatureConfig;
  customInstructions: string;
  observationPriority: "deep_sky" | "planetary" | "general" | "astrophotography";
}

export interface CurrentConditions {
  cloudCover: number[]; // hourly percentages
  transparency: string[]; // hourly conditions
  seeing: string[]; // hourly conditions
  moonPhase: number; // 0-1
  moonRise: string; // HH:MM
  moonSet: string; // HH:MM
  moonAltitude: number; // degrees
  precipitation: number[]; // hourly probability
  humidity: number[]; // hourly percentage
  windSpeed: number[]; // mph
  temperature: number[]; // °F
  timestamp: string; // ISO date string
  observingWindow: {
    start: string; // calculated sunset + offset
    end: string; // calculated sunrise - offset
    totalHours: number;
  };
  sunTimes: {
    sunset: string;
    sunrise: string;
    civilTwilight: {
      evening: string;
      morning: string;
    };
  };
}

export interface ClearSkyChartData {
  cloudCover: { time: string; percentage: number; color: string }[];
  transparency: { time: string; condition: string; color: string }[];
  seeing: { time: string; condition: string; rating: number; color: string }[];
  smoke: { time: string; level: string; color: string }[];
  wind: { time: string; speed: number; color: string }[];
  humidity: { time: string; percentage: number; color: string }[];
  temperature: { time: string; temp: number; color: string }[];
  darkness: { time: string; magnitude: number; color: string }[];
  timestamp: string;
}

export interface ObservationRecommendation {
  overall: "excellent" | "good" | "dubious" | "poor";
  timeWindows: {
    start: string;
    end: string;
    quality: "excellent" | "good" | "dubious" | "poor";
    reason: string;
  }[];
  summary: string;
  details: {
    cloudCover: string;
    transparency: string;
    seeing: string;
    moonImpact: string;
    weatherWarnings: string[];
  };
  aiReasoning: string;
}

export interface EvaluationPayload {
  location: string;
  date: string;
  userPreferences: ObservationCriteria;
  currentConditions: CurrentConditions;
}
