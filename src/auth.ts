import NextAuth, { type DefaultSession } from 'next-auth'
import Google from 'next-auth/providers/google'
import { authConfigured } from '@/lib/planner-auth/owners'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & { login?: string; googleSub?: string; googleEmailVerified?: boolean }
  }
}

// JWT session, no database. The config is built lazily so a missing env var never throws at build or import time.
// Reads AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET (and AUTH_URL where set) from the environment by name.
export const { handlers, auth } = NextAuth(() => ({
  providers: [Google],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, profile }) {
      // Only present at sign-in. The Google `sub` is the identity; name or email is for display.
      // email_verified must be exactly true for the email allowlist to count (see isOwner).
      if (profile?.sub) token.googleSub = String(profile.sub)
      if (profile) {
        token.login = (profile.name as string | undefined) || (profile.email as string | undefined) || token.login
        token.email = (profile.email as string | undefined) ?? token.email
        token.emailVerified = profile.email_verified === true
      }
      return token
    },
    session({ session, token }) {
      session.user.login = token.login as string | undefined
      session.user.googleSub = token.googleSub as string | undefined
      session.user.googleEmailVerified = token.emailVerified === true
      return session
    },
  },
}))

/** The signed-in session, or null. Null whenever sign-in is not configured (default deny). */
export async function getSession() {
  if (!authConfigured()) return null
  return auth()
}
