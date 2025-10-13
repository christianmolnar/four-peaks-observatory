/**
 * SMS Service Tests
 * 
 * Tests for the SMS functionality including formatting, validation, and API integration
 */

import { formatSMSContent, validateSMSConfig, getSMSConfigFromEnv } from '../src/lib/sms-service';
import { ObservationRecommendation } from '../src/types/observation';

describe('SMS Service', () => {
  // Mock observation recommendation for testing
  const mockRecommendation: ObservationRecommendation = {
    overall: 'excellent',
    timeWindows: [
      {
        start: '21:00',
        end: '23:00',
        quality: 'excellent',
        reason: 'Clear skies and good transparency'
      },
      {
        start: '02:00',
        end: '05:00',
        quality: 'good', 
        reason: 'Some high clouds but still observable'
      }
    ],
    summary: 'Excellent observing conditions throughout the night',
    details: {
      cloudCover: 'Clear to partly cloudy',
      transparency: 'Excellent',
      seeing: 'Good 4/5',
      moonImpact: '25% illuminated, sets at 23:30',
      weatherWarnings: []
    },
    aiReasoning: 'AI analysis indicates optimal conditions for deep sky photography',
    aiConfidence: 0.92
  };

  const mockObservingWindow = {
    start: '21:00',
    end: '05:00',
    totalHours: 8
  };

  describe('formatSMSContent', () => {
    test('formats basic SMS content correctly', () => {
      const result = formatSMSContent(
        mockRecommendation,
        'Maple Valley Observatory',
        mockObservingWindow
      );

      expect(result).toContain('🔭 Maple Valley Observatory');
      expect(result).toContain('🌟 EXCELLENT');
      expect(result).toContain('🌙 21:00-05:00 (8h)');
      expect(result).toContain('🌟 Best: 21:00-23:00');
    });

    test('includes AI confidence when available', () => {
      const result = formatSMSContent(
        mockRecommendation,
        'Test Observatory',
        mockObservingWindow
      );

      expect(result).toContain('🤖 AI: 92% confident');
    });

    test('handles poor conditions correctly', () => {
      const poorRecommendation = {
        ...mockRecommendation,
        overall: 'poor' as const,
        timeWindows: [],
        details: {
          ...mockRecommendation.details,
          weatherWarnings: ['Overcast conditions during 8 hours - no observation possible']
        },
        aiConfidence: 0.75
      };

      const result = formatSMSContent(
        poorRecommendation,
        'Test Observatory',
        mockObservingWindow
      );

      expect(result).toContain('❌ POOR');
      expect(result).toContain('⚠️ Overcast');
    });

    test('handles bright moon warning', () => {
      const moonRecommendation = {
        ...mockRecommendation,
        details: {
          ...mockRecommendation.details,
          weatherWarnings: ['Bright moon (85% illuminated) will wash out faint deep sky objects']
        }
      };

      const result = formatSMSContent(
        moonRecommendation,
        'Test Observatory',
        mockObservingWindow
      );

      expect(result).toContain('⚠️ Bright moon');
    });

    test('omits AI confidence when low', () => {
      const lowConfidenceRecommendation = {
        ...mockRecommendation,
        aiConfidence: 0.6
      };

      const result = formatSMSContent(
        lowConfidenceRecommendation,
        'Test Observatory',
        mockObservingWindow
      );

      expect(result).not.toContain('🤖 AI:');
    });
  });

  describe('validateSMSConfig', () => {
    test('validates complete configuration', () => {
      const config = {
        accountSid: 'ACtest_fake_sid_123_not_real',
        authToken: 'test_auth_token_here',
        fromNumber: '+12345678901',
        toNumber: '+19876543210'
      };

      const result = validateSMSConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('detects missing account SID', () => {
      const config = {
        authToken: 'auth_token_here',
        fromNumber: '+12345678901',
        toNumber: '+19876543210'
      };

      const result = validateSMSConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Twilio Account SID is required');
    });

    test('validates account SID format', () => {
      const config = {
        accountSid: 'invalid_sid',
        authToken: 'auth_token_here',
        fromNumber: '+12345678901',
        toNumber: '+19876543210'
      };

      const result = validateSMSConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid Twilio Account SID format (should start with "AC")');
    });

    test('validates phone number format', () => {
      const config = {
        accountSid: 'ACtest_fake_sid_456_not_real',
        authToken: 'test_auth_token_here',
        fromNumber: '1234567890', // Missing +
        toNumber: '+19876543210'
      };

      const result = validateSMSConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('From number must be in E.164 format (e.g., +1234567890)');
    });

    test('detects multiple validation errors', () => {
      const config = {
        fromNumber: 'invalid',
        toNumber: 'also_invalid'
      };

      const result = validateSMSConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2);
    });
  });

  describe('getSMSConfigFromEnv', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    test('reads configuration from environment variables', () => {
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'ACtest_env_fake_sid',
        TWILIO_AUTH_TOKEN: 'token123',
        TWILIO_FROM_NUMBER: '+12345678901',
        TWILIO_TO_NUMBER: '+19876543210'
      };

      const config = getSMSConfigFromEnv();
      
      expect(config.accountSid).toBe('ACtest_env_fake_sid');
      expect(config.authToken).toBe('token123');
      expect(config.fromNumber).toBe('+12345678901');
      expect(config.toNumber).toBe('+19876543210');
    });

    test('handles missing environment variables', () => {
      process.env = { ...originalEnv };
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_FROM_NUMBER;
      delete process.env.TWILIO_TO_NUMBER;

      const config = getSMSConfigFromEnv();
      
      expect(config.accountSid).toBeUndefined();
      expect(config.authToken).toBeUndefined();
      expect(config.fromNumber).toBeUndefined();
      expect(config.toNumber).toBeUndefined();
    });
  });

  describe('SMS content length optimization', () => {
    test('keeps message under SMS length limits', () => {
      const result = formatSMSContent(
        mockRecommendation,
        'Very Long Observatory Name That Might Cause Issues',
        mockObservingWindow
      );

      // Single SMS is 160 characters, but we allow up to 2 segments (320 chars)
      expect(result.length).toBeLessThanOrEqual(320);
    });

    test('prioritizes essential information when content is long', () => {
      const longRecommendation = {
        ...mockRecommendation,
        timeWindows: [
          { start: '20:00', end: '21:00', quality: 'excellent' as const, reason: 'Perfect conditions' },
          { start: '21:00', end: '22:00', quality: 'excellent' as const, reason: 'Still perfect' },
          { start: '22:00', end: '23:00', quality: 'good' as const, reason: 'Slight degradation' },
          { start: '23:00', end: '00:00', quality: 'good' as const, reason: 'Continues to be good' },
          { start: '00:00', end: '01:00', quality: 'excellent' as const, reason: 'Back to excellent' }
        ]
      };

      const result = formatSMSContent(
        longRecommendation,
        'Observatory',
        mockObservingWindow
      );

      // Should contain essential info
      expect(result).toContain('EXCELLENT');
      expect(result).toContain('Observatory');
      expect(result).toContain('🌙');
    });
  });

  describe('Quality emoji mapping', () => {
    test('maps all quality levels to appropriate emojis', () => {
      const qualities = ['excellent', 'good', 'dubious', 'poor'] as const;
      const expectedEmojis = ['🌟', '✅', '⚠️', '❌'];

      qualities.forEach((quality, index) => {
        const testRecommendation = {
          ...mockRecommendation,
          overall: quality
        };

        const result = formatSMSContent(
          testRecommendation,
          'Test Observatory',
          mockObservingWindow
        );

        expect(result).toContain(expectedEmojis[index]);
        expect(result).toContain(quality.toUpperCase());
      });
    });
  });
});
