import { Metadata } from 'next';
import CategoryTemplate from '@/components/CategoryTemplate';
import { globalConfig } from '@/config/global';
import { generateMetadata } from '@/lib/seo';

export const metadata: Metadata = generateMetadata({
  title: 'Solar System Astrophotography',
  description: 'Solar system photography including solar imaging, lunar phases, planetary photography, and astronomical events. High-resolution captures of our cosmic neighborhood from Four Peaks Observatory.',
  canonical: '/astrophotography/solar-system',
  category: 'astrophotography',
  subcategory: 'solar-system',
  images: [{
    url: '/images/astrophotography/solar-system/solar/Sun_2012-06-18-4.jpg',
    alt: 'Solar System Photography - Four Peaks Observatory'
  }]
});

export default function SolarSystemPage() {
  const { solarSystem } = globalConfig;
  
  return (
    <CategoryTemplate
      title={solarSystem.title}
      backgroundImage={solarSystem.backgroundImage}
      categories={solarSystem.categories}
      description={solarSystem.description}
    />
  );
}
