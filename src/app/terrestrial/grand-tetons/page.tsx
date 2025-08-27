import { Metadata } from 'next';
import GalleryTemplate from '@/components/GalleryTemplate';
import { globalConfig } from '@/config/global';
import { generateTerrestrialMetadata } from '@/lib/seo';

export const metadata: Metadata = generateTerrestrialMetadata(
  'grand-tetons',
  'Grand Teton National Park Photography',
  'Breathtaking mountain and alpine photography from Grand Teton National Park. Capturing dramatic peaks, pristine lakes, and the rugged beauty of the Teton Range in Wyoming.',
  '/images/terrestrial/grand-tetons/Grand-Tetons-1.jpg'
);

export default function GrandTetonsPage() {
  const grandTetonsCategory = globalConfig.terrestrial.categories.find(cat => cat.title === 'Grand Tetons');
  
  return (
    <GalleryTemplate
      title={grandTetonsCategory?.title || 'Grand Tetons National Park'}
      backgroundImage={grandTetonsCategory?.backgroundImage || '/images/astrophotography/featured/SH2-132-The-LobsterClaw.jpg'}
      imageFolder={grandTetonsCategory?.imageFolder || 'terrestrial/grand-tetons'}
    />
  );
}
