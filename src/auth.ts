import NextAuth, { type DefaultSession } from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { authConfigured } from '@/lib/planner-auth/owners'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & { login?: string }
  }
}

// JWT session, no database. The config is built lazily so a missing env var never throws at build or import time.
// Reads AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET (and AUTH_URL where set) from the environment by name.
export const { handlers, auth } = NextAuth(() => ({
  providers: [GitHub],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, profile }) {
      if (profile?.login) token.login = profile.login as string
      return token
    },
    session({ session, token }) {
      session.user.login = token.login as string | undefined
      return session
    },
  },
}))

/** The signed-in session, or null. Null whenever sign-in is not configured (default deny). */
export async function getSession() {
  if (!authConfigured()) return null
  return auth()
}
