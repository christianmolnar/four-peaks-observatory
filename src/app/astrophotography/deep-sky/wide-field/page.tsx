import { Metadata } from 'next';
import GalleryTemplate from "@/components/GalleryTemplate";
import { globalConfig } from "@/config/global";
import { generateAstrophysicsMetadata } from '@/lib/seo';

export const metadata: Metadata = generateAstrophysicsMetadata(
  'wide-field',
  'Wide Field Astrophotography',
  'Wide field astrophotography capturing expansive views of constellations, the Milky Way, and large celestial regions. Experience the grandeur of the night sky from Maple Valley Observatory.',
  '/images/astrophotography/featured/M42-20x240sec-2-7-2005-2547x1813.jpg'
);

export default function WideFieldPage() {
  const { wideField } = globalConfig;
  
  return (
    <GalleryTemplate
      title={wideField.title}
      backgroundImage={wideField.backgroundImage}
      imageFolder={wideField.imageFolder}
    />
  );
}
