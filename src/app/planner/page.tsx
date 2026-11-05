import type { Metadata } from 'next';
import SiteLayout from '@/components/SiteLayout';
import PlannerApp from './PlannerApp';

export const metadata: Metadata = {
  title: 'Imaging Planner',
  description: 'Tonight view for astrophotography: usable windows, horizon and equipment.',
  // Preview only: reachable by URL, not linked, not indexed.
  robots: { index: false, follow: false },
};

export default function PlannerPage() {
  return (
    <SiteLayout>
      <div className="min-h-screen bg-black">
        <main className="relative z-10 pt-8 pb-16">
          <div className="max-w-6xl mx-auto px-6">
            <PlannerApp />
          </div>
        </main>
      </div>
    </SiteLayout>
  );
}
