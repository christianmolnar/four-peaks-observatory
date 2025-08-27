import { Metadata } from 'next';
import GalleryTemplate from '@/components/GalleryTemplate';
import { globalConfig } from '@/config/global';
import { generateAstrophysicsMetadata } from '@/lib/seo';

export const metadata: Metadata = generateAstrophysicsMetadata(
  'nebulas',
  'Nebula Astrophotography',
  'Stunning nebula photographs captured from Maple Valley Observatory. Explore emission, planetary, and reflection nebulas including the Orion Nebula, North America Nebula, and more deep sky wonders.',
  '/images/astrophotography/deep-sky/nebulas/M42-20x240sec-2-7-2005-2547x1813.jpg'
);

export default function NebulasPage() {
  const nebulasCategory = globalConfig.deepSky.categories.find(cat => cat.title === 'Nebulas');
  
  return (
    <GalleryTemplate
      title={nebulasCategory?.title || 'Nebulas'}
      backgroundImage={nebulasCategory?.backgroundImage || '/images/astrophotography/featured/NGC7000-Pelican-1.jpg'}
      imageFolder={nebulasCategory?.imageFolder || 'astrophotography/nebulas'}
    />
  );
}
