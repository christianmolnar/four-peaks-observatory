import { Metadata } from 'next';
import GalleryTemplate from '@/components/GalleryTemplate';
import globalConfig from '@/config/global';
import { generateSolarSystemMetadata } from '@/lib/seo';

export const metadata: Metadata = generateSolarSystemMetadata(
  'solar',
  'Solar Photography',
  'High-resolution solar photography capturing sunspots, solar flares, and surface details of our nearest star. Specialized solar imaging techniques and equipment showcased from Maple Valley Observatory.',
  '/images/astrophotography/solar-system/solar/Sun_2012-06-18-4.jpg'
);

export default function SolarPage() {
  return (
    <GalleryTemplate
      title="Solar"
      backgroundImage="/images/astrophotography/solar-system/solar/Sun.jpg"
      imageFolder={globalConfig.imageFolders.solarSystem.solar}
    />
  );
}
