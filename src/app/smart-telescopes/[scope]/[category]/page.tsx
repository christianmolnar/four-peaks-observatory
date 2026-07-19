import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import GalleryTemplate from '@/components/GalleryTemplate';
import { globalConfig } from '@/config/global';

interface Props {
  params: Promise<{ scope: string; category: string }>;
}

export async function generateStaticParams() {
  const params: { scope: string; category: string }[] = [];
  for (const scope of globalConfig.smartTelescopes.scopes) {
    for (const cat of globalConfig.smartTelescopes.categories) {
      params.push({ scope: scope.slug, category: cat.slug });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { scope: scopeSlug, category: categorySlug } = await params;
  const scope = globalConfig.smartTelescopes.scopes.find(s => s.slug === scopeSlug);
  const category = globalConfig.smartTelescopes.categories.find(c => c.slug === categorySlug);
  if (!scope || !category) return {};
  return {
    title: `${scope.title} — ${category.title} | Four Peaks Observatory`,
    description: `${category.title} astrophotography captured with the ${scope.title} from Four Peaks Observatory.`,
    openGraph: {
      title: `${scope.title} — ${category.title} | Four Peaks Observatory`,
      images: [{ url: scope.backgroundImage }],
    },
  };
}

export default async function ScopeCategoryPage({ params }: Props) {
  const { scope: scopeSlug, category: categorySlug } = await params;

  const scope = globalConfig.smartTelescopes.scopes.find(s => s.slug === scopeSlug);
  const category = globalConfig.smartTelescopes.categories.find(c => c.slug === categorySlug);
  if (!scope || !category) notFound();

  const imageFolder = categorySlug === 'deep-sky'
    ? 'astrophotography/deep-sky'
    : 'astrophotography/solar-system';

  return (
    <GalleryTemplate
      title={`${scope.title} — ${category.title}`}
      backgroundImage={scope.backgroundImage}
      imageFolder={imageFolder}
      equipmentFilter={scope.equipmentMatch}
      subcategoryFilter={category.subcategoryPrefix}
    />
  );
}