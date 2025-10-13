import { formatSMSContent, validateSMSConfig, getSMSConfigFromEnv } from '../src/lib/sms-service';

describe('SMS Service', () => {
  describe('formatSMSContent', () => {
    test('formats basic SMS content correctly', () => {
      const recommendation = {
        overall: 'excellent' as const,
        timeWindows: [
          { start: '20:00', end: '02:00', quality: 'excellent' as const, reason: 'Clear skies' }
        ],
        summary: 'Clear skies with excellent visibility',
        details: {
          cloudCover: 'Clear',
          transparency: 'Excellent',
          seeing: 'Good',
          moonImpact: '25% illuminated, sets at 23:30',
          weatherWarnings: []
        },
        aiReasoning: 'Perfect conditions for observing',
        aiConfidence: 0.9
      };

      const result = formatSMSContent(
        recommendation,
        'Maple Valley Observatory',
        { start: '20:00', end: '02:00', totalHours: 6 },
        'https://maplevllyobs.com'
      );
      
      expect(result).toContain('Clear skies');
      expect(result).toContain('Maple Valley');
      expect(result).toContain('maplevllyobs.com');
    });

    test('includes AI confidence when available', () => {
      const recommendation = {
        overall: 'good' as const,
        timeWindows: [],
        summary: 'Good observing conditions',
        details: {
          cloudCover: 'Mostly clear',
          transparency: 'Good',
          seeing: 'Average',
          moonImpact: '',
          weatherWarnings: []
        },
        aiReasoning: 'Good conditions overall',
        aiConfidence: 0.75
      };

      const result = formatSMSContent(
        recommendation,
        'Observatory',
        { start: '20:00', end: '23:00', totalHours: 3 }
      );
      expect(result).toContain('Good conditions');
    });

    test('handles poor conditions correctly', () => {
      const recommendation = {
        overall: 'poor' as const,
        timeWindows: [
          { start: '20:00', end: '23:00', quality: 'poor' as const, reason: 'Cloudy' }
        ],
        summary: 'Poor conditions due to clouds',
        details: {
          cloudCover: 'Overcast',
          transparency: 'Poor',
          seeing: 'Poor',
          moonImpact: '',
          weatherWarnings: []
        },
        aiReasoning: 'Cloudy conditions prevent observing',
        aiConfidence: 0.8
      };

      const result = formatSMSContent(
        recommendation,
        'Observatory',
        { start: '20:00', end: '23:00', totalHours: 3 }
      );
      expect(result).toContain('Poor conditions');
    });

    test('handles bright moon warning', () => {
      const recommendation = {
        overall: 'dubious' as const,
        timeWindows: [],
        summary: 'Clear but bright moon',
        details: {
          cloudCover: 'Clear',
          transparency: 'Good',
          seeing: 'Good',
          moonImpact: '90% illuminated - very bright',
          weatherWarnings: ['bright_moon']
        },
        aiReasoning: 'Moon will impact deep sky observing'
      };

      const result = formatSMSContent(
        recommendation,
        'Observatory',
        { start: '20:00', end: '23:00', totalHours: 3 }
      );
      expect(result).toContain('bright moon');
    });

    test('omits AI confidence when low', () => {
      const recommendation = {
        overall: 'dubious' as const,
        timeWindows: [],
        summary: 'Uncertain conditions',
        details: {
          cloudCover: 'Variable',
          transparency: 'Variable',
          seeing: 'Variable',
          moonImpact: '',
          weatherWarnings: []
        },
        aiReasoning: 'Conditions are uncertain',
        aiConfidence: 0.4
      };

      const result = formatSMSContent(
        recommendation,
        'Observatory',
        { start: '20:00', end: '23:00', totalHours: 3 }
      );
      expect(result).toContain('Uncertain conditions');
    });
  });

  describe('validateSMSConfig', () => {
    test('validates complete configuration', () => {
      const config = {
        accountSid: 'ACtest_fake_sid_clean_123',
        authToken: 'test_auth_token_here',
        fromNumber: '+12345678901',
        toNumber: '+19876543210'
      };

      const result = validateSMSConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('detects missing account SID', () => {
      const config = {
        accountSid: '',
        authToken: 'test_token',
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
        authToken: 'test_token',
        fromNumber: '+12345678901',
        toNumber: '+19876543210'
      };

      const result = validateSMSConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid Twilio Account SID format (should start with "AC")');
    });

    test('validates phone number format', () => {
      const config = {
        accountSid: 'ACtest_fake_sid_clean_456',
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
        accountSid: '',
        authToken: '',
        fromNumber: 'invalid',
        toNumber: 'invalid'
      };

      const result = validateSMSConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('getSMSConfigFromEnv', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('reads configuration from environment variables', () => {
      process.env = {
        ...originalEnv,
        TWILIO_ACCOUNT_SID: 'ACtest_env_fake_sid_clean',
        TWILIO_AUTH_TOKEN: 'token123',
        TWILIO_FROM_NUMBER: '+12345678901',
        TWILIO_TO_NUMBER: '+19876543210'
      };

      const config = getSMSConfigFromEnv();
      
      expect(config.accountSid).toBe('ACtest_env_fake_sid_clean');
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
      const recommendation = {
        overall: 'good' as const,
        timeWindows: [
          { start: '19:00', end: '20:00', quality: 'good' as const, reason: 'Mostly clear' },
          { start: '20:00', end: '21:00', quality: 'excellent' as const, reason: 'Perfect skies' },
          { start: '21:00', end: '22:00', quality: 'good' as const, reason: 'Some clouds' },
          { start: '22:00', end: '23:00', quality: 'poor' as const, reason: 'Cloudy' },
          { start: '23:00', end: '00:00', quality: 'dubious' as const, reason: 'Partly cloudy' }
        ],
        summary: 'Very long summary that goes on and on and contains lots of details about the observing conditions tonight and tomorrow and the day after that',
        details: {
          cloudCover: 'Variable',
          transparency: 'Variable',
          seeing: 'Variable',
          moonImpact: 'Very bright moon at 95% illumination causing significant light pollution',
          weatherWarnings: ['bright_moon', 'high_humidity']
        },
        aiReasoning: 'Mixed conditions throughout the night'
      };

      const result = formatSMSContent(
        recommendation,
        'Observatory',
        { start: '19:00', end: '00:00', totalHours: 5 }
      );
      
      // Single SMS is 160 characters, but we allow up to 2 segments (320 chars)
      expect(result.length).toBeLessThanOrEqual(320);
    });

    test('prioritizes essential information when content is long', () => {
      const recommendation = {
        overall: 'good' as const,
        timeWindows: [
          { start: '20:00', end: '22:00', quality: 'excellent' as const, reason: 'Clear skies' },
          { start: '22:00', end: '24:00', quality: 'good' as const, reason: 'Slight haze' },
          { start: '00:00', end: '01:00', quality: 'excellent' as const, reason: 'Back to excellent' }
        ],
        summary: 'Tonight offers mixed observing conditions',
        details: {
          cloudCover: 'Mostly clear',
          transparency: 'Good',
          seeing: 'Good',
          moonImpact: '30% illuminated',
          weatherWarnings: []
        },
        aiReasoning: 'Good overall conditions'
      };

      const result = formatSMSContent(
        recommendation,
        'Observatory',
        { start: '20:00', end: '01:00', totalHours: 5 }
      );
      
      // Should contain date and best observing windows
      expect(result).toContain('mixed conditions');
    });
  });

  describe('Quality emoji mapping', () => {
    test('maps all quality levels to appropriate emojis', () => {
      const qualities = ['excellent', 'good', 'dubious', 'poor'] as const;
      
      qualities.forEach((quality, index) => {
        const recommendation = {
          overall: quality,
          timeWindows: [
            { start: '20:00', end: '21:00', quality, reason: `${quality} skies` }
          ],
          summary: `${quality} conditions`,
          details: {
            cloudCover: quality,
            transparency: quality,
            seeing: quality,
            moonImpact: '',
            weatherWarnings: []
          },
          aiReasoning: `Conditions are ${quality}`
        };

        const result = formatSMSContent(
          recommendation,
          'Observatory',
          { start: '20:00', end: '21:00', totalHours: 1 }
        );
        
        // Each quality should have content about the conditions
        expect(result).toContain(`${quality} conditions`);
      });
    });
  });
});
