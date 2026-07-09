#!/usr/bin/env node
/**
 * Migrate equipment field → ota, camera, mount
 * 
 * Maps all known equipment strings to split fields.
 * Leaves the original `equipment` field intact for backward compat.
 * Safe to re-run — skips entries that already have ota/camera/mount set.
 */

const fs = require('fs');
const path = require('path');

const metadataPath = path.join(__dirname, '../src/data/metadata.json');
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

function parseEquipment(eq) {
  if (!eq || !eq.trim()) return { ota: '', camera: '', mount: '' };
  const t = eq.trim();

  // All-in-one smart scopes — OTA is the whole unit, no separate camera/mount
  if (t.includes('SeeStar S50'))    return { ota: 'SeeStar S50', camera: '', mount: '' };
  if (t.includes('SeeStar S30'))    return { ota: 'SeeStar S30', camera: '', mount: '' };
  if (t.includes('Unistellar'))     return { ota: 'Unistellar Odyssey', camera: '', mount: '' };

  // William Optics Zenithstar 81 combos (handles the "Willliam" typo too)
  if (t.toLowerCase().includes('zenithstar')) {
    const parts = t.split(',').map(s => s.trim()).filter(Boolean);
    const mount = (parts[2] || '').replace(/\s*Mount\s*$/i, '').trim();
    return {
      ota: 'William Optics Zenithstar 81',
      camera: parts[1] || '',
      mount,
    };
  }

  // Nikon D5300 alone — OTA unknown, put in camera
  if (t.includes('Nikon D5300')) return { ota: '', camera: 'Nikon D5300 Astro Modified', mount: '' };

  // Meade 8" SCT
  if (/^Meade 8[""]/.test(t)) return { ota: 'Meade 8" SCT', camera: '', mount: '' };

  // Meade LX200 10"
  if (t.includes('Meade LX200')) return { ota: t, camera: '', mount: '' };

  // Konus 8"
  if (t.toLowerCase().includes('konus')) return { ota: t, camera: '', mount: '' };

  // Orion 80ED APO,, Canon EOS  (has double comma)
  if (t.toLowerCase().includes('orion')) {
    const parts = t.split(',').map(s => s.trim()).filter(Boolean);
    return { ota: parts[0] || '', camera: parts[1] || '', mount: '' };
  }

  // Generic comma-separated fallback
  const parts = t.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { ota: parts[0], camera: parts[1], mount: parts[2] || '' };

  return { ota: t, camera: '', mount: '' };
}

let migrated = 0;
let skipped = 0;

for (const [key, entry] of Object.entries(metadata)) {
  // Already migrated — skip
  if (entry.ota !== undefined || entry.camera !== undefined || entry.mount !== undefined) {
    skipped++;
    continue;
  }
  const { ota, camera, mount } = parseEquipment(entry.equipment || '');
  entry.ota = ota;
  entry.camera = camera;
  entry.mount = mount;
  migrated++;
}

fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
console.log(`Done. Migrated: ${migrated}, Already done: ${skipped}`);

// Summary of what was written
const groups = {};
for (const entry of Object.values(metadata)) {
  const key = `${entry.ota || '(blank)'} | ${entry.camera || '(blank)'} | ${entry.mount || '(blank)'}`;
  groups[key] = (groups[key] || 0) + 1;
}
console.log('\nOTA | Camera | Mount breakdown:');
Object.entries(groups).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${v}x  ${k}`));
