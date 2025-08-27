import { Metadata } from 'next';
import GalleryTemplate from '@/components/GalleryTemplate';
import { globalConfig } from '@/config/global';
import { generateAstrophysicsMetadata } from '@/lib/seo';

export const metadata: Metadata = generateAstrophysicsMetadata(
  'galaxies',
  'Galaxy Astrophotography',
  'Deep space galaxy photography from Maple Valley Observatory. Featuring spiral galaxies, elliptical galaxies, and Messier objects including M31 Andromeda, M33 Triangulum, and other distant galactic wonders.',
  '/images/astrophotography/deep-sky/galaxies/M33 - The Triangulum Galaxy.jpg'
);

export default function GalaxiesPage() {
  const galaxiesCategory = globalConfig.deepSky.categories.find(cat => cat.title === 'Galaxies');
  
  return (
    <GalleryTemplate
      title={galaxiesCategory?.title || 'Galaxies'}
      backgroundImage={galaxiesCategory?.backgroundImage || '/images/astrophotography/deep-sky/galaxies/M33 - The Triangulum Galaxy.jpg'}
      imageFolder={galaxiesCategory?.imageFolder || 'astrophotography/galaxies'}
    />
  );
}
