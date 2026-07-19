import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import SiteLayout from '@/components/SiteLayout';
import { globalConfig } from '@/config/global';

interface Props {
  params: Promise<{ scope: string }>;
}

export async function generateStaticParams() {
  return globalConfig.smartTelescopes.scopes.map(scope => ({
    scope: scope.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { scope: scopeSlug } = await params;
  const scope = globalConfig.smartTelescopes.scopes.find(s => s.slug === scopeSlug);
  if (!scope) return {};
  return {
    title: `${scope.title} | Smart Telescopes | Four Peaks Observatory`,
    description: scope.intro.slice(0, 160),
    openGraph: {
      title: `${scope.title} | Four Peaks Observatory`,
      images: [{ url: scope.backgroundImage }],
    },
  };
}

export default async function ScopePage({ params }: Props) {
  const { scope: scopeSlug } = await params;
  const scope = globalConfig.smartTelescopes.scopes.find(s => s.slug === scopeSlug);
  if (!scope) notFound();

  const { categories } = globalConfig.smartTelescopes;

  return (
    <SiteLayout>
      <div className="min-h-screen bg-black">
        {/* Background */}
        <div className="fixed inset-0 z-0">
          <Image
            src={scope.backgroundImage}
            alt={scope.title}
            fill
            className="object-cover opacity-40"
            quality={85}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/60" />
        </div>

        <main className="relative z-10 pt-16 pb-20">
          <div className="max-w-5xl mx-auto px-6">

            {/* Breadcrumb */}
            <nav className="mb-8 text-xs text-white/50 tracking-wide">
              <Link href="/smart-telescopes" className="hover:text-yellow-400 transition-colors">Smart Telescopes</Link>
              <span className="mx-2">›</span>
              <span className="text-white/80">{scope.title}</span>
            </nav>

            {/* Title */}
            <div className="text-center mb-12">
              <h1 className="text-3xl md:text-4xl font-light text-white tracking-[0.2em] mb-4">
                {scope.title.toUpperCase()}
              </h1>
              <p className="text-white/70 text-lg max-w-3xl mx-auto leading-relaxed">
                {scope.description}
              </p>
            </div>

            {/* Category Tiles */}
            <div className="flex flex-wrap justify-center gap-8 mb-16">
              {categories.map(cat => (
                <Link
                  key={cat.slug}
                  href={`${scope.href}/${cat.slug}`}
                  className="group cursor-pointer transform transition-all duration-300 hover:scale-105"
                >
                  <div className="relative bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden shadow-2xl hover:bg-white/10 hover:border-white/20 transition-all duration-300 w-72 h-72">
                    <div className="absolute inset-0">
                      <Image
                        src={scope.backgroundImage}
                        alt={cat.title}
                        fill
                        className="object-cover opacity-25 group-hover:opacity-35 transition-opacity duration-300"
                        quality={80}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
                    </div>
                    <div className="relative z-10 h-full flex flex-col justify-center items-center p-8 text-center">
                      <h2 className="text-xl font-bold text-white tracking-wider mb-3 group-hover:text-yellow-400 transition-colors duration-300">
                        {cat.title.toUpperCase()}
                      </h2>
                      <p className="text-white/70 text-sm tracking-wide">{cat.description}</p>
                      <div className="mt-6 text-white/50 group-hover:text-yellow-400 transition-colors duration-300">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Scope Description Card */}
            <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-8 md:p-10 space-y-10">

              {/* Intro */}
              <div>
                <p className="text-white/85 text-base leading-relaxed">{scope.intro}</p>
              </div>

              {/* Specs */}
              <div>
                <h2 className="text-white text-lg font-semibold tracking-widest uppercase mb-4 border-b border-white/10 pb-2">
                  Specifications
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    ['Aperture', scope.specs.aperture],
                    ['Focal Length', scope.specs.focalLength],
                    ['Sensor', scope.specs.sensor],
                    ['Field of View', scope.specs.fov],
                    ['Weight', scope.specs.weight],
                    ['Filter', scope.specs.filter],
                    ['Power', scope.specs.power],
                    ['Connectivity', scope.specs.connectivity],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between items-baseline border-b border-white/5 py-2">
                      <span className="text-white/50 text-sm">{label}</span>
                      <span className="text-white/90 text-sm font-medium text-right ml-4">{value}</span>
                    </div>
                  ))}
                  <div className="sm:col-span-2 flex justify-between items-baseline border-b border-white/5 py-2">
                    <span className="text-white/50 text-sm">Features</span>
                    <span className="text-white/90 text-sm font-medium text-right ml-4">{scope.specs.extras}</span>
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div>
                <h2 className="text-white text-lg font-semibold tracking-widest uppercase mb-4 border-b border-white/10 pb-2">
                  Pricing
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-white/50 text-xs uppercase tracking-wide mb-1">New</p>
                    <p className="text-yellow-400 text-xl font-semibold">{scope.specs.pricingNew}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-white/50 text-xs uppercase tracking-wide mb-1">Used</p>
                    <p className="text-white/80 text-xl font-semibold">{scope.specs.pricingUsed}</p>
                  </div>
                </div>
              </div>

              {/* Pros & Cons */}
              <div>
                <h2 className="text-white text-lg font-semibold tracking-widest uppercase mb-6 border-b border-white/10 pb-2">
                  Pros &amp; Cons
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-green-400 text-sm font-semibold uppercase tracking-wide mb-3">✓ Pros</h3>
                    <ul className="space-y-2">
                      {scope.pros.map((pro, i) => (
                        <li key={i} className="flex items-start gap-2 text-white/80 text-sm leading-relaxed">
                          <span className="text-green-400 mt-0.5 flex-shrink-0">+</span>
                          {pro}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-red-400 text-sm font-semibold uppercase tracking-wide mb-3">✗ Cons</h3>
                    <ul className="space-y-2">
                      {scope.cons.map((con, i) => (
                        <li key={i} className="flex items-start gap-2 text-white/80 text-sm leading-relaxed">
                          <span className="text-red-400 mt-0.5 flex-shrink-0">−</span>
                          {con}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </main>
      </div>
    </SiteLayout>
  );
}
