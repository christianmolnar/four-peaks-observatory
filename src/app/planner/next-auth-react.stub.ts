// What the page tests get for `next-auth/react` (see src/planner/jest.config.js): the real package is ES-module only and the page
// tests never sign in. The sign-in control's own test mocks the two calls itself.
export const signIn = (): Promise<void> => Promise.resolve();
export const signOut = (): Promise<void> => Promise.resolve();
