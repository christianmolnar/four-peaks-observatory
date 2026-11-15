/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';

const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
jest.mock('next-auth/react', () => ({ signIn: (...a: unknown[]) => mockSignIn(...a), signOut: (...a: unknown[]) => mockSignOut(...a) }));

import AuthControl from './AuthControl';

import type { AuthState } from './authState';

const OUT: AuthState = { kind: 'signedOut' };
const DISABLED: AuthState = { kind: 'disabled' };
const IN = (login: string): AuthState => ({ kind: 'signedIn', login, owner: false });

beforeEach(() => {
  mockSignIn.mockReset();
  mockSignOut.mockReset();
});

describe('AuthControl', () => {
  it('renders the sign-in form from the first paint (works with JS off)', () => {
    const { container } = render(<AuthControl state={OUT} />);
    const form = container.querySelector('form') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/api/auth/signin');
    expect(screen.getByRole('button', { name: /sign in with google/i }).getAttribute('type')).toBe('submit');
  });
  it('signed out: submitting calls the Auth.js client sign-in', () => {
    render(<AuthControl state={OUT} />);
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(mockSignIn).toHaveBeenCalledWith('google');
  });
  it('not configured: says so and offers no button', () => {
    render(<AuthControl state={DISABLED} />);
    expect(screen.getByText(/not available/i)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('signed in: shows the login and a sign-out button', () => {
    render(<AuthControl state={IN('octo')} />);
    expect(screen.getByText('octo')).toBeTruthy();
    // The button's accessible name says who is signed in; on a phone it is icon-sized (geometry is checked in the browser, not here).
    fireEvent.click(screen.getByRole('button', { name: 'Sign out octo' }));
    expect(mockSignOut).toHaveBeenCalled();
  });
  it('form returns to /planner after sign-in', () => {
    const { container } = render(<AuthControl state={OUT} />);
    const input = container.querySelector('input[name="callbackUrl"]') as HTMLInputElement;
    expect(input.type).toBe('hidden');
    expect(input.value).toBe('/planner');
  });
  it('is a fixed 44 px row; a long login truncates with the full login in title', () => {
    const login = 'a'.repeat(39);
    render(<AuthControl state={IN(login)} />);
    const text = screen.getByText(login);
    expect(text.className).toContain('truncate');
    expect(text.className).toContain('min-w-0');
    expect(text.getAttribute('title')).toBe(login);
    expect(screen.getByTestId('auth-control').className).toContain('h-[44px]');
  });
  it('not configured is cut with an ellipsis, not clipped', () => {
    render(<AuthControl state={DISABLED} />);
    // Cut with an ellipsis when it does not fit, with the full sentence in title.
    const text = screen.getByText(/not available/i);
    expect(text.className).toContain('truncate');
    expect(text.getAttribute('title')).toBe('Sign-in is not available right now.');
  });
  it('buttons are 44 px tall by class', () => {
    render(<AuthControl state={OUT} />);
    expect(screen.getByRole('button').className).toContain('min-h-[44px]');
  });
});
