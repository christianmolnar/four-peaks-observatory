'use client';
import type { FormEvent } from 'react';
import { signIn, signOut } from 'next-auth/react';
import type { AuthState } from './authState';

const btn =
  'inline-flex items-center justify-center min-h-[44px] px-4 rounded border border-white/30 text-white/90 text-sm font-normal hover:bg-white/10';

// Compact sign-in control for the header row, one line. The page reads the session once and passes it in. The planner works fully without signing in.
export default function AuthControl({ state }: { state: AuthState }) {
  const onSignIn = (e: FormEvent) => {
    e.preventDefault();
    void signIn('google');
  };

  return (
    <div className="flex h-[44px] min-w-0 items-center justify-end gap-3 print:hidden" data-testid="auth-control">
      {state.kind === 'disabled' && (
        <span className="flex min-h-[44px] min-w-0 items-center truncate text-white/80 text-sm font-normal">Sign-in is not available right now.</span>
      )}
      {state.kind === 'signedOut' && (
        // A real form so it also works with JS off; with JS on, Auth.js client adds the CSRF token.
        <form method="get" action="/api/auth/signin" onSubmit={onSignIn}>
          <input type="hidden" name="callbackUrl" value="/planner" />
          {/* Icon-sized on a phone so the header stays one line; the words are there for a screen reader and show from 640 px. */}
          <button type="submit" className={`${btn} min-w-[44px] px-0 sm:px-4`} title="Sign in with Google">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 sm:hidden" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
            </svg>
            <span className="sr-only sm:not-sr-only">Sign in with Google</span>
          </button>
        </form>
      )}
      {state.kind === 'signedIn' && (
        <>
          <span className="min-w-0 truncate text-white/90 text-sm font-normal" title={state.login}>
            Signed in as {state.login}
          </span>
          <button type="button" className={`${btn} shrink-0`} onClick={() => signOut()}>
            Sign out
          </button>
        </>
      )}
    </div>
  );
}
