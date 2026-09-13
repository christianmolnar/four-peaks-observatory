import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SiteLayout from '@/components/SiteLayout';
import { globalConfig } from '@/config/global';

export const metadata: Metadata = {
  title: 'Smart Telescopes | Four Peaks Observatory',
  description: 'Astrophotography captured with ZWO SeeStar S50, S50 Pro, S30, Unistellar Odyssey, and Dwarflab Dwarf 3 smart telescopes. One-touch deep sky imaging from Four Peaks Observatory.',
  openGraph: {
    title: 'Smart Telescopes | Four Peaks Observatory',
    description: 'Deep sky images captured with ZWO SeeStar, Unistellar, and Dwarflab smart telescopes.',
    images: [{ url: '/images/astrophotography/deep-sky/nebulas/NGC7635 - The Bubble Nebula-Wide.jpg' }],
  },
};

const specRows: { label: string; key: keyof (typeof globalConfig.smartTelescopes.scopes)[number]['specs'] }[] = [
  { label: 'Aperture', key: 'aperture' },
  { label: 'Focal Length', key: 'focalLength' },
  { label: 'Sensor', key: 'sensor' },
  { label: 'Field of View', key: 'fov' },
  { label: 'Weight', key: 'weight' },
  { label: 'Filter', key: 'filter' },
  { label: 'Power', key: 'power' },
  { label: 'Connectivity', key: 'connectivity' },
  { label: 'Extras', key: 'extras' },
  { label: 'Price (New)', key: 'pricingNew' },
  { label: 'Price (Used)', key: 'pricingUsed' },
];

export default function SmartTelescopesPage() {
  const { smartTelescopes } = globalConfig;
  const { scopes } = smartTelescopes;

  return (
    <SiteLayout>
      <div className="min-h-screen bg-black">
        {/* Background Image */}
        <div className="fixed inset-0 z-0">
          <Image
            src={smartTelescopes.backgroundImage}
            alt="Background"
            fill
            className="object-cover opacity-50"
            quality={85}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/5 to-black/20" />
        </div>

        <main className="relative z-10 pt-16 pb-16">
          <div className="max-w-6xl mx-auto px-6">
            {/* Page Title */}
            <div className="text-center mb-12">
              <h1 className="text-3xl md:text-4xl font-light text-white tracking-[0.2em] mb-8">
                {smartTelescopes.title.toUpperCase()}
              </h1>
              {smartTelescopes.description && (
                <p className="text-white/80 text-lg max-w-3xl mx-auto leading-relaxed">
                  {smartTelescopes.description}
                </p>
              )}
            </div>

            {/* Category Grid - Larger Square Cards - Centered */}
            <div className="flex flex-wrap justify-center gap-8 max-w-5xl mx-auto mb-20">
              {scopes.map((scope) => (
                <Link
                  key={scope.slug}
                  href={scope.href}
                  className="group cursor-pointer transform transition-all duration-300 hover:scale-105"
                >
                  <div className="relative bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden shadow-2xl hover:bg-white/10 hover:border-white/20 transition-all duration-300 w-72 h-72">
                    <div className="absolute inset-0">
                      <Image
                        src={scope.backgroundImage}
                        alt={scope.title}
                        fill
                        className="object-cover opacity-30 group-hover:opacity-40 transition-opacity duration-300"
                        quality={90}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
                    </div>
                    <div className="relative z-10 h-full flex flex-col justify-center items-center p-8 text-center">
                      <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-white tracking-wider mb-4 group-hover:text-yellow-400 transition-colors duration-300">
                        {scope.title.toUpperCase()}
                      </h2>
                      {scope.description && (
                        <p className="text-white/80 text-sm tracking-wide">
                          {scope.description}
                        </p>
                      )}
                      <div className="mt-6 text-white/60 group-hover:text-yellow-400 transition-colors duration-300">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Head-to-Head Comparison Table */}
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-light text-white tracking-[0.15em]">
                HEAD-TO-HEAD COMPARISON
              </h2>
            </div>
            <div className="overflow-x-auto bg-black/50 backdrop-blur-sm rounded-xl border border-white/10 shadow-2xl">
              <table className="min-w-full text-sm text-left text-white/80">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="px-4 py-4 font-medium text-white/60 uppercase tracking-wide text-xs whitespace-nowrap">
                      Spec
                    </th>
                    {scopes.map((scope) => (
                      <th key={scope.slug} className="px-4 py-4 font-semibold text-white tracking-wide whitespace-nowrap">
                        {scope.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {specRows.map((row, i) => (
                    <tr
                      key={row.key}
                      className={i % 2 === 0 ? 'bg-white/[0.02]' : ''}
                    >
                      <td className="px-4 py-3 font-medium text-white/60 uppercase tracking-wide text-xs align-top whitespace-nowrap">
                        {row.label}
                      </td>
                      {scopes.map((scope) => (
                        <td key={scope.slug} className="px-4 py-3 align-top">
                          {scope.specs[row.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </SiteLayout>
  );
}
