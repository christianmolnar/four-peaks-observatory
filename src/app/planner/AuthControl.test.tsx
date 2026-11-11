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
    mockSession(200, { signedIn: false, configured: true });
    const { container } = render(<AuthControl />);
    const form = container.querySelector('form') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/api/auth/signin');
    expect(screen.getByRole('button', { name: /sign in with github/i }).getAttribute('type')).toBe('submit');
  });
  it('signed out: submitting calls the Auth.js client sign-in', async () => {
    mockSession(200, { signedIn: false, configured: true });
    render(<AuthControl />);
    fireEvent.click(screen.getByRole('button', { name: /sign in with github/i }));
    expect(mockSignIn).toHaveBeenCalledWith('github');
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });
  it('not configured: says so and offers no button', async () => {
    mockSession(200, { signedIn: false, configured: false });
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
  it('form returns to /planner after sign-in', () => {
    mockSession(200, { signedIn: false, configured: true });
    const { container } = render(<AuthControl />);
    const input = container.querySelector('input[name="callbackUrl"]') as HTMLInputElement;
    expect(input.type).toBe('hidden');
    expect(input.value).toBe('/planner');
  });
  it('is a fixed 44 px row; a long login truncates with the full login in title', async () => {
    const login = 'a'.repeat(39);
    mockSession(200, { signedIn: true, owner: false, login });
    render(<AuthControl />);
    const text = await screen.findByText(/signed in as/i);
    expect(text.className).toContain('truncate');
    expect(text.className).toContain('min-w-0');
    expect(text.getAttribute('title')).toBe(login);
    expect(screen.getByTestId('auth-control').className).toContain('h-[44px]');
  });
  it('not configured keeps the 44 px box', async () => {
    mockSession(200, { signedIn: false, configured: false });
    render(<AuthControl />);
    expect((await screen.findByText(/not available/i)).className).toContain('min-h-[44px]');
  });
  it('buttons are 44 px tall by class', () => {
    mockSession(200, { signedIn: false, configured: true });
    render(<AuthControl />);
    expect(screen.getByRole('button').className).toContain('min-h-[44px]');
  });
});
