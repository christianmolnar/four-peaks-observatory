import { Metadata } from 'next';
import GalleryTemplate from '@/components/GalleryTemplate';
import { globalConfig } from '@/config/global';
import { generateAstrophysicsMetadata } from '@/lib/seo';

export const metadata: Metadata = generateAstrophysicsMetadata(
  'star-clusters',
  'Star Cluster Astrophotography',
  'Open and globular star cluster photography from Maple Valley Observatory. Featuring Messier clusters, stellar associations, and beautiful celestial groupings captured through advanced telescope imaging.',
  '/images/astrophotography/featured/Wizard-Lr-PI.jpg'
);

export default function StarClustersPage() {
  const starClustersCategory = globalConfig.deepSky.categories.find(cat => cat.title === 'Star Clusters');
  
  return (
    <GalleryTemplate
      title={starClustersCategory?.title || 'Star Clusters'}
      backgroundImage={starClustersCategory?.backgroundImage || '/images/astrophotography/featured/Wizard-Lr-PI.jpg'}
      imageFolder={starClustersCategory?.imageFolder || 'astrophotography/star-clusters'}
    />
  );
}
