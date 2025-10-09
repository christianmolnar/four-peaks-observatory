// Test AI-powered observation recommendations

import { getAIObservingRecommendation, formatAIRecommendation } from '../src/lib/ai-recommendations';
import { ClearSkyCondition } from '../src/lib/clear-sky-parser';

// Mock OpenAI for testing
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: JSON.stringify({
                  overall: 'good',
                  confidence: 0.85,
                  reasoning: 'Clear skies with good transparency expected',
                  bestTimeWindows: ['20:00-23:00', '01:00-04:00'],
                  warnings: ['Moon rises at 23:30'],
                  opportunities: ['Great for planetary observation']
                })
              }
            }]
          })
        }
      }
    }))
  };
});

describe('AI Recommendations', () => {
  
  const mockConditions: ClearSkyCondition[] = [
    { time: '20:00', cloudCover: 10, transparency: 4, seeingRating: 4, temperature: 10, humidity: 60, windSpeed: 5 },
    { time: '21:00', cloudCover: 15, transparency: 4, seeingRating: 3, temperature: 9, humidity: 65, windSpeed: 6 },
    { time: '22:00', cloudCover: 20, transparency: 3, seeingRating: 3, temperature: 8, humidity: 70, windSpeed: 7 },
    { time: '23:00', cloudCover: 25, transparency: 3, seeingRating: 4, temperature: 7, humidity: 75, windSpeed: 5 }
  ];
  
  const mockCriteria = {
    location: {
      name: 'Test Observatory',
      latitude: 47.3668,
      longitude: -122.0432,
      timezone: 'America/Los_Angeles',
      clearSkyChartUrl: 'https://test.com/chart.html'
    },
    seeing: { 
      observationType: 'balanced',
      excellent: ['excellent_5', 'good_4'],
      good: ['average_3'],
      dubious: ['poor_2'],
      poor: ['bad_1', 'too_cloudy']
    },
    moonPhase: { 
      goodPhases: ['new'], 
      dubiousPhases: ['quarter'], 
      poorPhases: ['full'] 
    },
    cloudCover: { 
      excellent: { threshold: 10 }, 
      good: { threshold: 25 } 
    },
    transparency: { 
      excellent: ['above_average'], 
      good: ['average'],
      dubious: ['below_average'],
      poor: ['poor', 'too_cloudy']
    }
  };
  
  const mockMoonData = {
    phase: 0.25,
    rise: new Date('2025-10-09T23:30:00'),
    set: new Date('2025-10-10T06:00:00'),
    altitude: 30,
    illumination: 0.25
  };
  
  const mockObservingWindow = {
    start: '20:00',
    end: '05:00',
    totalHours: 9
  };
  
  beforeEach(() => {
    // Reset environment variables
    delete process.env.OPENAI_API_KEY;
  });
  
  describe('getAIObservingRecommendation', () => {
    
    it('should return AI recommendation when API key is available', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      
      const result = await getAIObservingRecommendation(
        mockConditions,
        mockCriteria as any,
        mockMoonData,
        mockObservingWindow
      );
      
      expect(result.overall).toBe('good');
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toContain('Clear skies');
      expect(result.bestTimeWindows).toContain('20:00-23:00');
      expect(result.warnings).toContain('Moon rises at 23:30');
      expect(result.opportunities).toContain('Great for planetary observation');
    });
    
    it('should fallback to rule-based analysis when no API key', async () => {
      // No API key set
      
      const result = await getAIObservingRecommendation(
        mockConditions,
        mockCriteria as any,
        mockMoonData,
        mockObservingWindow
      );
      
      // Should still return valid recommendation
      expect(['excellent', 'good', 'dubious', 'poor']).toContain(result.overall);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.reasoning).toBeDefined();
    });
    
    it('should handle OpenAI API errors gracefully', async () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      
      // Mock API failure
      const OpenAI = require('openai').default;
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('API Error'))
          }
        }
      }));
      
      const result = await getAIObservingRecommendation(
        mockConditions,
        mockCriteria as any,
        mockMoonData,
        mockObservingWindow
      );
      
      // Should fallback to rule-based analysis
      expect(['excellent', 'good', 'dubious', 'poor']).toContain(result.overall);
      expect(result.reasoning).toContain('Rule-based analysis');
    });
  });
  
  describe('formatAIRecommendation', () => {
    
    it('should format recommendation with all sections', () => {
      const sentiment = {
        overall: 'excellent' as const,
        confidence: 0.92,
        reasoning: 'Perfect conditions for deep sky observation',
        bestTimeWindows: ['21:00-24:00', '01:00-04:00'],
        warnings: ['Dew may form after 3 AM'],
        opportunities: ['Ideal for galaxy imaging', 'Great transparency for nebulae']
      };
      
      const formatted = formatAIRecommendation(sentiment);
      
      expect(formatted).toContain('**EXCELLENT**');
      expect(formatted).toContain('92% confidence');
      expect(formatted).toContain('Perfect conditions');
      expect(formatted).toContain('**Best Time Windows:**');
      expect(formatted).toContain('21:00-24:00');
      expect(formatted).toContain('**Warnings:**');
      expect(formatted).toContain('Dew may form');
      expect(formatted).toContain('**Opportunities:**');
      expect(formatted).toContain('galaxy imaging');
    });
    
    it('should handle minimal recommendation data', () => {
      const sentiment = {
        overall: 'poor' as const,
        confidence: 0.8,
        reasoning: 'Heavy cloud cover expected',
        bestTimeWindows: [],
        warnings: [],
        opportunities: []
      };
      
      const formatted = formatAIRecommendation(sentiment);
      
      expect(formatted).toContain('**POOR**');
      expect(formatted).toContain('80% confidence');
      expect(formatted).toContain('Heavy cloud cover');
      expect(formatted).not.toContain('**Best Time Windows:**');
      expect(formatted).not.toContain('**Warnings:**');
      expect(formatted).not.toContain('**Opportunities:**');
    });
  });
  
  describe('Rule-based Fallback', () => {
    
    it('should provide reasonable recommendations for excellent conditions', async () => {
      const excellentConditions: ClearSkyCondition[] = [
        { time: '20:00', cloudCover: 5, transparency: 5, seeingRating: 5, temperature: 10, humidity: 50, windSpeed: 3 },
        { time: '21:00', cloudCover: 0, transparency: 5, seeingRating: 4, temperature: 9, humidity: 55, windSpeed: 4 }
      ];
      
      const result = await getAIObservingRecommendation(
        excellentConditions,
        mockCriteria as any,
        { ...mockMoonData, illumination: 0.1 }, // New moon
        mockObservingWindow
      );
      
      expect(result.overall).toBe('excellent');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
    
    it('should provide reasonable recommendations for poor conditions', async () => {
      const poorConditions: ClearSkyCondition[] = [
        { time: '20:00', cloudCover: 90, transparency: 1, seeingRating: 1, temperature: 10, humidity: 95, windSpeed: 20 },
        { time: '21:00', cloudCover: 95, transparency: 1, seeingRating: 1, temperature: 9, humidity: 98, windSpeed: 25 }
      ];
      
      const result = await getAIObservingRecommendation(
        poorConditions,
        mockCriteria as any,
        mockMoonData,
        mockObservingWindow
      );
      
      expect(result.overall).toBe('poor');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
