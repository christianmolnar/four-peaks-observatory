import { Metadata } from 'next';
import GalleryTemplate from '@/components/GalleryTemplate';
import { globalConfig } from '@/config/global';
import { generateTerrestrialMetadata } from '@/lib/seo';

export const metadata: Metadata = generateTerrestrialMetadata(
  'yellowstone',
  'Yellowstone National Park Photography',
  'Stunning landscape and nature photography from Yellowstone National Park. Featuring geysers, hot springs, wildlife, and the natural wonders of America\'s first national park.',
  '/images/terrestrial/yellowstone/Old-Faithful-1.jpg'
);

export default function YellowstonePage() {
  const yellowstoneCategory = globalConfig.terrestrial.categories.find(cat => cat.title === 'Yellowstone');
  
  return (
    <GalleryTemplate
      title={yellowstoneCategory?.title || 'Yellowstone National Park'}
      backgroundImage={yellowstoneCategory?.backgroundImage || '/images/astrophotography/featured/Wizard-Lr-PI.jpg'}
      imageFolder={yellowstoneCategory?.imageFolder || 'terrestrial/yellowstone'}
    />
  );
}
