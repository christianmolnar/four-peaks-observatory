/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
jest.mock('next-auth/react', () => ({ signIn: (...a: unknown[]) => mockSignIn(...a), signOut: (...a: unknown[]) => mockSignOut(...a) }));

import AuthControl from './AuthControl';

function mockSession(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as typeof fetch;
}

beforeEach(() => {
  mockSignIn.mockReset();
  mockSignOut.mockReset();
});

describe('AuthControl', () => {
  it('renders the sign-in form before any fetch resolves (works with JS off)', () => {
    mockSession(401, { signedIn: false, configured: true });
    const { container } = render(<AuthControl />);
    const form = container.querySelector('form') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('/api/auth/signin/github');
    expect(screen.getByRole('button', { name: /sign in with github/i }).getAttribute('type')).toBe('submit');
  });
  it('signed out: submitting calls the Auth.js client sign-in', async () => {
    mockSession(401, { signedIn: false, configured: true });
    render(<AuthControl />);
    fireEvent.click(screen.getByRole('button', { name: /sign in with github/i }));
    expect(mockSignIn).toHaveBeenCalledWith('github');
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });
  it('not configured: says so and offers no button', async () => {
    mockSession(401, { signedIn: false, configured: false });
    render(<AuthControl />);
    expect(await screen.findByText(/not available/i)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('signed in: shows the login and a sign-out button', async () => {
    mockSession(200, { signedIn: true, owner: false, login: 'octo' });
    render(<AuthControl />);
    expect(await screen.findByText(/signed in as octo/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(mockSignOut).toHaveBeenCalled();
  });
  it('buttons are 44 px tall by class', () => {
    mockSession(401, { signedIn: false, configured: true });
    render(<AuthControl />);
    expect(screen.getByRole('button').className).toContain('min-h-[44px]');
  });
});
