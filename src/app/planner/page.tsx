import type { Metadata } from 'next';
import SiteLayout from '@/components/SiteLayout';
import PlannerApp from './PlannerApp';
import AuthControl from './AuthControl';
import CatalogCredits from './CatalogCredits';

// Static on purpose: the page reads no cookie. The sign-in control asks /api/planner/session after load.

export const metadata: Metadata = {
  title: 'Imaging Planner',
  description: 'Tonight view for astrophotography: usable windows, horizon and equipment.',
  // Preview only: reachable by URL, not linked, not indexed.
  robots: { index: false, follow: false },
};

export default function PlannerPage() {
  return (
    <SiteLayout>
      <div className="min-h-screen bg-black print:bg-white">
        <main className="relative z-10 pt-8 pb-16 print:pt-0 print:pb-0">
          <div className="max-w-6xl mx-auto px-6">
            <PlannerApp />
            {/* Sign-in is for the owner: after the tool, so a guest's first screen is the planner and not a notice. */}
            <div className="mt-8">
              <AuthControl />
            </div>
            <CatalogCredits />
          </div>
        </main>
      </div>
    </SiteLayout>
  );
}
