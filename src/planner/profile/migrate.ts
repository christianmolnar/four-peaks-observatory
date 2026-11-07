/**
 * Brings a parsed profile of an older version up to the current one, before
 * validation. Nothing is invented: a new field starts empty, every old field
 * is kept as it was. Unknown versions pass through so the validator reports them.
 */
export function migrateProfile(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  let p = input as Record<string, unknown>;
  if (p.version === 1) {
    const eq = p.equipment;
    p = {
      ...p,
      version: 2,
      // v2 adds the filter library; a v1 profile has none.
      equipment: typeof eq === 'object' && eq !== null && !Array.isArray(eq) ? { ...eq, filters: [] } : eq,
    };
  }
  return p;
}
