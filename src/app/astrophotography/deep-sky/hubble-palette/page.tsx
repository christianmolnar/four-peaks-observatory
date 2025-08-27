import { Metadata } from 'next';
import GalleryTemplate from '@/components/GalleryTemplate';
import { globalConfig } from '@/config/global';
import { generateAstrophysicsMetadata } from '@/lib/seo';

export const metadata: Metadata = generateAstrophysicsMetadata(
  'hubble-palette',
  'Hubble Palette Astrophotography',
  'Narrowband Hubble Palette (SHO) astrophotography featuring hydrogen-alpha, oxygen-III, and sulfur-II emission lines. Dramatic false-color imaging revealing hidden details in nebulas and star-forming regions.',
  '/images/astrophotography/featured/M42-20x240sec-2-7-2005-2547x1813.jpg'
);

export default function HubblePalettePage() {
  const hubblePaletteCategory = globalConfig.deepSky.categories.find(cat => cat.title === 'Hubble Palette');
  
  if (!hubblePaletteCategory) {
    return <div>Category not found</div>;
  }

  return (
    <GalleryTemplate
      title={hubblePaletteCategory.title}
      backgroundImage={hubblePaletteCategory.backgroundImage}
      imageFolder={hubblePaletteCategory.imageFolder}
    />
  );
}
