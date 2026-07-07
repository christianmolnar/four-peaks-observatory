import { Metadata } from 'next';
import CategoryTemplate from '@/components/CategoryTemplate';
import { globalConfig } from '@/config/global';

export const metadata: Metadata = {
  title: 'Smart Telescopes | Maple Valley Observatory',
  description: 'Astrophotography captured with ZWO SeeStar S50, ZWO SeeStar S30, and Unistellar Odyssey smart telescopes. One-touch deep sky imaging from Maple Valley Observatory.',
  openGraph: {
    title: 'Smart Telescopes | Maple Valley Observatory',
    description: 'Deep sky images captured with ZWO SeeStar and Unistellar smart telescopes.',
    images: [{ url: '/images/astrophotography/deep-sky/nebulas/NGC7635 - The Bubble Nebula-Wide.jpg' }],
  },
};

export default function SmartTelescopesPage() {
  const { smartTelescopes } = globalConfig;

  const categories = smartTelescopes.scopes.map(scope => ({
    title: scope.title,
    href: scope.href,
    backgroundImage: scope.backgroundImage,
    description: scope.description,
  }));

  return (
    <CategoryTemplate
      title={smartTelescopes.title}
      backgroundImage={smartTelescopes.backgroundImage}
      categories={categories}
      description={smartTelescopes.description}
    />
  );
}
