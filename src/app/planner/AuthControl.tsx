'use client';
import type { FormEvent } from 'react';
import { signIn, signOut } from 'next-auth/react';
import type { AuthState } from './authState';

const btn =
  'inline-flex items-center justify-center min-h-[44px] rounded border border-p-line/30 text-p-t1 text-sm font-normal hover:bg-p-raised/10';

// Compact sign-in control for the header row, one line. The page reads the session once and passes it in. The planner works fully without signing in.
export default function AuthControl({ state }: { state: AuthState }) {
  const onSignIn = (e: FormEvent) => {
    e.preventDefault();
    void signIn('google');
  };

  return (
    <div className="flex h-[44px] min-w-0 items-center justify-end gap-3 print:hidden" data-testid="auth-control">
      {state.kind === 'disabled' && (
        // On a phone there is no room beside the title, so the words are there for a screen reader and show from 640 px (no cut-off "Si…").
        <span className="min-w-0 truncate text-p-t1/70 text-sm font-normal" title="Sign-in is not available right now.">
          <span className="sr-only sm:not-sr-only">Sign-in is not available right now.</span>
        </span>
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
          {/* The name shows (cut with an ellipsis) when there is room beside the title; Sign out is icon-sized on a phone, its name says who is signed in. */}
          <span className="min-w-0 truncate text-p-t1 text-sm font-normal" title={state.login}>
            <span className="hidden sm:inline">Signed in as </span>
            {state.login}
          </span>
          <button type="button" className={`${btn} min-w-[44px] shrink-0 px-0 sm:px-4`} aria-label={`Sign out ${state.login}`} title="Sign out" onClick={() => signOut()}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 sm:hidden" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 4H5v16h5" />
              <path d="M15 8l4 4-4 4M19 12H9" />
            </svg>
            <span aria-hidden="true" className="hidden sm:inline">Sign out</span>
          </button>
        </>
      )}
    </div>
  );
}
