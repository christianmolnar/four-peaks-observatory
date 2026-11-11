import type { Metadata } from 'next';
import SiteLayout from '@/components/SiteLayout';
import { getSession } from '@/auth';
import { authConfigured } from '@/lib/planner-auth/owners';
import PlannerApp from './PlannerApp';
import AuthControl, { type AuthState } from './AuthControl';

// Reads the session cookie, so the page renders per request.
export const dynamic = 'force-dynamic';

async function authState(): Promise<AuthState> {
  if (!authConfigured()) return { kind: 'disabled' };
  const login = (await getSession())?.user?.login;
  return login ? { kind: 'signedIn', login } : { kind: 'signedOut' };
}

export const metadata: Metadata = {
  title: 'Imaging Planner',
  description: 'Tonight view for astrophotography: usable windows, horizon and equipment.',
  // Preview only: reachable by URL, not linked, not indexed.
  robots: { index: false, follow: false },
};

export default async function PlannerPage() {
  const state = await authState();
  return (
    <SiteLayout>
      <div className="min-h-screen bg-black print:bg-white">
        <main className="relative z-10 pt-8 pb-16 print:pt-0 print:pb-0">
          <div className="max-w-6xl mx-auto px-6">
            <div className="mb-4">
              <AuthControl state={state} />
            </div>
            <PlannerApp />
          </div>
        </main>
      </div>
    </SiteLayout>
  );
}
