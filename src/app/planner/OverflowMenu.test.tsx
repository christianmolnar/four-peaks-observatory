/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OverflowMenu from './OverflowMenu';

const mount = (a = jest.fn(), b = jest.fn()) =>
  render(
    <>
      <OverflowMenu label="More" items={[{ label: 'First', onSelect: a }, { label: 'Second', onSelect: b }, { label: 'Third', onSelect: jest.fn(), disabled: true }]} />
      <button type="button">outside</button>
    </>,
  );
const trigger = () => screen.getByRole('button', { name: /^More/ });

afterEach(cleanup);

describe('the overflow menu', () => {
  it('is closed until opened, and the button says it has a menu', () => {
    mount();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('Enter opens it on the first item; Down, Up, End and Home move; a disabled item is skipped', async () => {
    const u = userEvent.setup();
    mount();
    trigger().focus();
    await u.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'First' }));
    await u.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Second' }));
    await u.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'First' })); // wraps past the disabled one
    await u.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Second' }));
    await u.keyboard('{Home}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'First' }));
    await u.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Second' }));
  });

  it('Up on the closed button opens it on the last item', async () => {
    const u = userEvent.setup();
    mount();
    trigger().focus();
    await u.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Second' }));
  });

  it('Escape closes it and gives the focus back to the button', async () => {
    const u = userEvent.setup();
    mount();
    await u.click(trigger());
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('choosing an item runs it once and closes the menu', async () => {
    const u = userEvent.setup();
    const a = jest.fn();
    const b = jest.fn();
    mount(a, b);
    await u.click(trigger());
    await u.keyboard('{ArrowDown}{Enter}');
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a disabled item does nothing; a press outside closes the menu; Tab closes it', async () => {
    const u = userEvent.setup();
    mount();
    await u.click(trigger());
    expect((screen.getByRole('menuitem', { name: 'Third' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('menu')).toBeNull();
    await u.click(trigger());
    await u.keyboard('{Tab}');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
