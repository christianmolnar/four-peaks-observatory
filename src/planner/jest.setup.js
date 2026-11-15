// Runs after the test framework is set up, in every planner test file. The page's tabs follow the address hash (#plan, #gear), and jsdom
// keeps one address for the whole file, so each test starts from the bare address, as a fresh visit does.
afterEach(() => {
  if (typeof window !== 'undefined') window.history.replaceState(null, '', '/');
});

// jsdom has no layout, so it has no scrollIntoView; the page calls it when a link lands on an element inside a tab.
if (typeof window !== 'undefined' && !window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => undefined;
}
