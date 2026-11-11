'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { signIn, signOut } from 'next-auth/react';

export type AuthState = { kind: 'disabled' } | { kind: 'signedOut' } | { kind: 'signedIn'; login: string };

const btn =
  'inline-flex items-center justify-center min-h-[44px] px-4 rounded border border-white/30 text-white/90 text-sm font-normal hover:bg-white/10';

/** The page is prerendered, so the signed-out form is in the HTML; the session is read here after load. */
export async function loadAuthState(): Promise<AuthState> {
  const res = await fetch('/api/planner/session', { credentials: 'same-origin', cache: 'no-store' });
  if (res.ok) {
    const body = (await res.json()) as { login?: string };
    return body.login ? { kind: 'signedIn', login: body.login } : { kind: 'signedOut' };
  }
  if (res.status === 401) {
    const body = (await res.json()) as { configured?: boolean };
    return body.configured === false ? { kind: 'disabled' } : { kind: 'signedOut' };
  }
  throw new Error(`Session check failed: ${res.status}`);
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
    <div className="flex flex-wrap items-center justify-end gap-3 print:hidden" data-testid="auth-control">
      {state.kind === 'disabled' && (
        <span className="text-white/80 text-sm font-normal">Sign-in is not available right now.</span>
      )}
      {state.kind === 'signedOut' && (
        // A real form so it also works with JS off; with JS on, Auth.js client adds the CSRF token.
        <form method="post" action="/api/auth/signin/github" onSubmit={onSignIn}>
          <button type="submit" className={btn}>
            Sign in with GitHub
          </button>
        </form>
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
