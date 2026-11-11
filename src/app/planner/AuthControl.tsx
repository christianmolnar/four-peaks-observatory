'use client';
import { signIn, signOut } from 'next-auth/react';

export type AuthState = { kind: 'disabled' } | { kind: 'signedOut' } | { kind: 'signedIn'; login: string };

const btn =
  'inline-flex items-center justify-center min-h-[44px] px-4 rounded border border-white/30 text-white/90 text-sm font-normal hover:bg-white/10';

// Compact sign-in control. The planner works fully without it.
export default function AuthControl({ state }: { state: AuthState }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 print:hidden" data-testid="auth-control">
      {state.kind === 'disabled' && (
        <span className="text-white/80 text-sm font-normal">Sign-in is not available right now.</span>
      )}
      {state.kind === 'signedOut' && (
        <button type="button" className={btn} onClick={() => signIn('github')}>
          Sign in with GitHub
        </button>
      )}
      {state.kind === 'signedIn' && (
        <>
          <span className="text-white/90 text-sm font-normal break-all">Signed in as {state.login}</span>
          <button type="button" className={btn} onClick={() => signOut()}>
            Sign out
          </button>
        </>
      )}
    </div>
  );
}
