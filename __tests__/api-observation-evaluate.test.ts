// Integration test for observation evaluation API

import { GET } from '../src/app/api/observation-evaluate/route';
import { NextRequest } from 'next/server';

// Mock the external dependencies
jest.mock('../src/lib/clear-sky-parser', () => ({
  fetchClearSkyChartData: jest.fn().mockResolvedValue({
    location: 'Test Observatory',
    forecast: [
      { time: '20:00', cloudCover: 10, transparency: 4, seeingRating: 4, temperature: 10, humidity: 60, windSpeed: 5 },
      { time: '21:00', cloudCover: 15, transparency: 4, seeingRating: 3, temperature: 9, humidity: 65, windSpeed: 6 },
      { time: '22:00', cloudCover: 20, transparency: 3, seeingRating: 3, temperature: 8, humidity: 70, windSpeed: 7 },
      { time: '23:00', cloudCover: 25, transparency: 3, seeingRating: 4, temperature: 7, humidity: 75, windSpeed: 5 }
    ],
    lastUpdated: new Date()
  })
}));

jest.mock('../src/lib/astronomical-calculations', () => ({
  calculateSunTimes: jest.fn().mockReturnValue({
    sunset: new Date('2025-10-09T19:30:00'),
    sunrise: new Date('2025-10-10T07:00:00')
  }),
  calculateObservingWindow: jest.fn().mockReturnValue({
    start: new Date('2025-10-09T20:30:00'),
    end: new Date('2025-10-10T06:00:00'),
    totalHours: 9.5
  }),
  calculateMoonData: jest.fn().mockResolvedValue({
    phase: 0.25,
    rise: new Date('2025-10-09T23:30:00'),
    set: new Date('2025-10-10T06:00:00'),
    altitude: 30,
    illumination: 0.25
  }),
  formatTime: jest.fn().mockImplementation((date) => 
    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  )
}));

jest.mock('../src/lib/ai-recommendations', () => ({
  getAIObservingRecommendation: jest.fn().mockResolvedValue({
    overall: 'good',
    confidence: 0.85,
    reasoning: 'Excellent conditions for most observations with clear skies expected',
    bestTimeWindows: ['20:30-23:30'],
    warnings: ['Moon rises at 23:30, will affect deep sky imaging'],
    opportunities: ['Perfect for planetary observation before moonrise']
  }),
  formatAIRecommendation: jest.fn().mockReturnValue(
    '**GOOD** observing conditions (85% confidence)\n\nExcellent conditions for most observations with clear skies expected'
  )
}));

// Mock fs for configuration reading
jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(JSON.stringify({
    location: {
      name: 'Test Observatory, WA',
      latitude: 47.3668,
      longitude: -122.0432,
      timezone: 'America/Los_Angeles',
      clearSkyChartUrl: 'https://www.cleardarksky.com/c/TestObskey.html'
    },
    observingWindow: {
      startOffset: 60,
      endOffset: 60,
      description: '1 hour after sunset to 1 hour before sunrise'
    },
    moonPhase: {
      goodPhases: ['new', 'waxing_crescent_25'],
      dubiousPhases: ['first_quarter', 'third_quarter'],
      poorPhases: ['full'],
      altitudeThreshold: 45
    },
    cloudCover: {
      excellent: { threshold: 10, required: true },
      good: { threshold: 25, acceptable: true },
      dubious: { threshold: 50, mark: true },
      poor: { threshold: 75, mark: true },
      consecutiveHours: 2
    },
    transparency: {
      excellent: ['above_average', 'transparent'],
      good: ['average'],
      dubious: ['below_average'],
      poor: ['poor', 'too_cloudy']
    },
    seeing: {
      excellent: ['excellent_5', 'good_4'],
      good: ['average_3'],
      dubious: ['poor_2'],
      poor: ['bad_1', 'too_cloudy'],
      observationType: 'balanced'
    }
  }))
}));

describe('Observation Evaluation API', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('should return successful observation recommendation', async () => {
    const request = new NextRequest('http://localhost:3000/api/observation-evaluate');
    const response = await GET();
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    
    expect(data.success).toBe(true);
    expect(data.recommendation).toBeDefined();
    expect(data.recommendation.overall).toBeDefined();
    expect(data.recommendation.timeWindows).toBeInstanceOf(Array);
    expect(data.recommendation.summary).toBeDefined();
    expect(data.recommendation.aiReasoning).toBeDefined();
    
    // Check response structure
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('location');
    expect(data).toHaveProperty('observingWindow');
    expect(data).toHaveProperty('sunTimes');
  });
  
  it('should include AI recommendation data when available', async () => {
    const response = await GET();
    const data = await response.json();
    
    expect(data.recommendation.aiConfidence).toBe(0.85);
    expect(data.recommendation.aiSuggestions).toBeDefined();
    expect(data.recommendation.aiSuggestions.bestTimeWindows).toContain('20:30-23:30');
    expect(data.recommendation.aiSuggestions.warnings).toContain('Moon rises at 23:30, will affect deep sky imaging');
    expect(data.recommendation.aiSuggestions.opportunities).toContain('Perfect for planetary observation before moonrise');
  });
  
  it('should handle Clear Sky Chart parsing errors gracefully', async () => {
    // Mock Clear Sky Chart to fail
    const { fetchClearSkyChartData } = require('../src/lib/clear-sky-parser');
    fetchClearSkyChartData.mockRejectedValueOnce(new Error('Chart parsing failed'));
    
    const response = await GET();
    
    expect(response.status).toBe(500);
    
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to evaluate observation conditions');
    expect(data.details).toContain('Chart parsing failed');
  });
  
  it('should handle AI recommendation failures gracefully', async () => {
    // Mock AI to fail
    const { getAIObservingRecommendation } = require('../src/lib/ai-recommendations');
    getAIObservingRecommendation.mockRejectedValueOnce(new Error('AI service unavailable'));
    
    const response = await GET();
    const data = await response.json();
    
    // Should still succeed with rule-based analysis
    expect(data.success).toBe(true);
    expect(data.recommendation.aiReasoning).toBeDefined();
    // Should not have AI confidence when AI fails
    expect(data.recommendation.aiConfidence).toBeUndefined();
  });
  
  it('should properly group consecutive time windows', async () => {
    const response = await GET();
    const data = await response.json();
    
    const timeWindows = data.recommendation.timeWindows;
    expect(timeWindows.length).toBeGreaterThan(0);
    
    // Each window should have required properties
    timeWindows.forEach((window: any) => {
      expect(window).toHaveProperty('start');
      expect(window).toHaveProperty('end');
      expect(window).toHaveProperty('quality');
      expect(window).toHaveProperty('reason');
      expect(['excellent', 'good', 'dubious', 'poor']).toContain(window.quality);
    });
  });
  
  it('should return valid overall rating', async () => {
    const response = await GET();
    const data = await response.json();
    
    const overall = data.recommendation.overall;
    expect(['excellent', 'good', 'dubious', 'poor']).toContain(overall);
  });
  
  it('should include proper observing window information', async () => {
    const response = await GET();
    const data = await response.json();
    
    expect(data.observingWindow).toHaveProperty('start');
    expect(data.observingWindow).toHaveProperty('end');
    expect(data.observingWindow).toHaveProperty('totalHours');
    expect(data.observingWindow.totalHours).toBeGreaterThan(0);
  });
  
  it('should include sun times information', async () => {
    const response = await GET();
    const data = await response.json();
    
    expect(data.sunTimes).toHaveProperty('sunset');
    expect(data.sunTimes).toHaveProperty('sunrise');
  });
  
  describe('Error Handling', () => {
    
    it('should handle missing configuration file', async () => {
      const fs = require('fs');
      fs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });
      
      const response = await GET();
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
    
    it('should handle malformed configuration JSON', async () => {
      const fs = require('fs');
      fs.readFileSync.mockReturnValue('invalid json');
      
      const response = await GET();
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });
});
