/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Navigation from '@/components/Navigation';
import SiteLayout from '@/components/SiteLayout';

jest.mock('next/navigation', () => ({ usePathname: () => '/planner' }));

// R6d: the slim 48 px header belongs to /planner only; the full header and its spacing are as they were everywhere else.

afterEach(cleanup);

describe('the slim header', () => {
  it('is 48 px with a small logo, the slot for the planner controls and the menu at every width', () => {
    const { container } = render(<Navigation slim />);
    const nav = container.querySelector('nav')!;
    expect(nav.className).toContain('fixed');
    expect(nav.querySelector('.h-12')).not.toBeNull();
    expect(nav.querySelector('img')!.className).toContain('h-7');
    expect(nav.querySelector('#planner-nav-actions')).not.toBeNull();
    const menu = screen.getByRole('button', { name: 'Toggle mobile menu' });
    expect(menu.className).not.toContain('md:hidden');
    expect(nav.querySelector('ul')!.parentElement!.className).toContain('hidden');
    expect(nav.querySelector('ul')!.parentElement!.className).not.toContain('md:block');
  });

  it('opens the menu panel 48 px down, at every width', () => {
    const { container } = render(<Navigation slim />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle mobile menu' }));
    const panel = container.querySelector<HTMLElement>('nav > div.fixed')!;
    expect(panel.style.top).toBe('48px');
    expect(panel.className).not.toContain('md:hidden');
    expect(screen.getAllByRole('link', { name: 'Home' }).length).toBeGreaterThan(0);
  });

  it('SiteLayout slim pads the page by 48 px, no sub-navigation', () => {
    const { container } = render(<SiteLayout slim><p>x</p></SiteLayout>);
    expect(container.querySelector('p')!.parentElement!.className).toBe('pt-12');
  });
});

describe('the full header elsewhere', () => {
  it('is unchanged: tall logo, no slot, menu button for phones only, 148 px of padding', () => {
    const { container } = render(<SiteLayout><p>x</p></SiteLayout>);
    const nav = container.querySelector('nav')!;
    expect(nav.querySelector('#planner-nav-actions')).toBeNull();
    expect(nav.querySelector('img')!.className).toBe('object-contain w-full h-auto');
    expect(screen.getByRole('button', { name: 'Toggle mobile menu' }).className).toContain('md:hidden');
    expect(nav.querySelector('ul')!.parentElement!.className).toContain('md:block');
    expect(container.querySelector('p')!.parentElement!.className).toBe('pt-[148px]');
  });
});
