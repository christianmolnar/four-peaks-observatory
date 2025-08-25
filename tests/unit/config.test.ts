import { observatoryConfig } from '@/config/observatory';

describe('Observatory Configuration', () => {
  test('has all required basic information', () => {
    expect(observatoryConfig.name).toBeDefined();
    expect(observatoryConfig.name).toBe('Maple Valley Observatory');
    expect(observatoryConfig.tagline).toBeDefined();
    expect(observatoryConfig.tagline).toContain('Capturing Photons');
  });

  test('has valid location data', () => {
    expect(observatoryConfig.location.city).toBe('Maple Valley');
    expect(observatoryConfig.location.state).toBe('WA');
    expect(observatoryConfig.location.zipCode).toBe('98038');
    expect(observatoryConfig.location.coordinates.lat).toBeCloseTo(47.3809, 4);
    expect(observatoryConfig.location.coordinates.lng).toBeCloseTo(-122.0326, 4);
  });

  test('has valid owner information', () => {
    expect(observatoryConfig.owner.name).toBe('Christian Molnar');
    expect(observatoryConfig.owner.email).toContain('@');
    expect(observatoryConfig.owner.socialMedia.facebook).toContain('facebook.com');
    expect(observatoryConfig.owner.socialMedia.linkedin).toContain('linkedin.com');
  });

  test('has mission statement', () => {
    expect(observatoryConfig.mission).toBeDefined();
    expect(observatoryConfig.mission.length).toBeGreaterThan(50);
    expect(observatoryConfig.mission).toContain('photons');
  });

  test('has valid equipment information', () => {
    expect(observatoryConfig.primaryEquipment).toBe('SeeStar S50');
    expect(observatoryConfig.equipmentDescription).toContain('SeeStar S50');
  });

  test('has SEO metadata', () => {
    expect(observatoryConfig.seo.description).toBeDefined();
    expect(observatoryConfig.seo.keywords).toBeInstanceOf(Array);
    expect(observatoryConfig.seo.keywords.length).toBeGreaterThan(0);
    expect(observatoryConfig.seo.author).toBe('Christian Molnar');
  });
});
