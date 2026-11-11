/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react';

const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
jest.mock('next-auth/react', () => ({ signIn: (...a: unknown[]) => mockSignIn(...a), signOut: (...a: unknown[]) => mockSignOut(...a) }));

import AuthControl from './AuthControl';

beforeEach(() => {
  mockSignIn.mockReset();
  mockSignOut.mockReset();
});

describe('AuthControl', () => {
  it('disabled: says so and offers no button', () => {
    render(<AuthControl state={{ kind: 'disabled' }} />);
    expect(screen.getByText(/not available/i)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('signed out: a GitHub sign-in button', () => {
    render(<AuthControl state={{ kind: 'signedOut' }} />);
    fireEvent.click(screen.getByRole('button', { name: /sign in with github/i }));
    expect(mockSignIn).toHaveBeenCalledWith('github');
  });
  it('signed in: shows the login and a sign-out button', () => {
    render(<AuthControl state={{ kind: 'signedIn', login: 'octo' }} />);
    expect(screen.getByText(/signed in as octo/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(mockSignOut).toHaveBeenCalled();
  });
  it('buttons are 44 px tall by class', () => {
    render(<AuthControl state={{ kind: 'signedOut' }} />);
    expect(screen.getByRole('button').className).toContain('min-h-[44px]');
  });
});
