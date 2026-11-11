'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { signIn, signOut } from 'next-auth/react';

export type AuthState = { kind: 'disabled' } | { kind: 'signedOut' } | { kind: 'signedIn'; login: string };

const btn =
  'inline-flex items-center justify-center min-h-[44px] px-4 rounded border border-white/30 text-white/90 text-sm font-normal hover:bg-white/10';

/** The page is prerendered, so the signed-out form is in the HTML; the session is read here after load. */
export async function loadAuthState(): Promise<AuthState> {
  const res = await fetch('/api/planner/session', { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error(`Session check failed: ${res.status}`);
  const body = (await res.json()) as { signedIn?: boolean; login?: string; configured?: boolean };
  if (body.signedIn && body.login) return { kind: 'signedIn', login: body.login };
  return body.configured === false ? { kind: 'disabled' } : { kind: 'signedOut' };
}

// Compact sign-in control. The planner works fully without it.
export default function AuthControl() {
  const [state, setState] = useState<AuthState>({ kind: 'signedOut' });

  useEffect(() => {
    let live = true;
    loadAuthState()
      .then((s) => live && setState(s))
      .catch((e) => console.error(e));
    return () => {
      live = false;
    };
  }, []);

  const onSignIn = (e: FormEvent) => {
    e.preventDefault();
    void signIn('github');
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
          <button type="submit" className={btn}>
            Sign in with GitHub
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
