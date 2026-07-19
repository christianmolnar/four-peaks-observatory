import CategoryTemplate from '@/components/CategoryTemplate';
import { globalConfig } from '@/config/global';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Resources',
  description: 'Explore curated resources for astronomy, astrophotography, mindfulness, and wellbeing. Discover guides, articles, and tools to enhance your journey.',
  keywords: [
    'astronomy resources',
    'astrophotography guides',
    'mindfulness',
    'wellbeing',
    'meditation',
    'astronomy tools',
    'space resources'
  ],
  openGraph: {
    title: 'Resources - Four Peaks Observatory',
    description: 'Curated resources for astronomy, astrophotography, mindfulness, and wellbeing.',
    type: 'website',
  },
};

export default function ResourcesPage() {
  const { resources } = globalConfig;
  
  return (
    <CategoryTemplate
      title={resources.title}
      backgroundImage={resources.backgroundImage}
      categories={resources.categories}
      description={resources.description}
    />
  );
}
