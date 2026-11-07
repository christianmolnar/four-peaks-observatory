#!/usr/bin/env python3
"""
Layout proof for the /planner Exposure panel and the Filter selector (headless Chromium, real keys, real mouse).

jsdom has no layout, so Jest cannot see a card or a heading move. This script checks, at 1280 and 390 px,
on the sample profile with the evening set to 2026-12-15:
  1. Mode change: choosing Quick, Balanced and Deep with the arrow keys (focus reached by Tab) and with a real
     mouse click leaves the page position and size of the three cards, the warnings area, the marginal table,
     the Edit horizon heading and the whole panel unchanged.
  2. Filter change: stepping the Filter box through all twelve filters with ArrowDown, on the HyperStar train
     and on the ASI533MC train, in every mode, leaves the same boxes (and the Filter box itself) unchanged.
     Warnings come and go in between (the script records how many distinct messages were seen).
  3. Messages are not clipped: the warnings area never needs more height than it was given (scrollHeight <=
     clientHeight) and nothing in the panel scrolls sideways; the page does not scroll sideways.
  4. The Filter box and the line under it keep their size when the train switches between an optical train and
     a smart scope.
  5. Keyboard: Tab from the Bortle box lands on the chosen mode radio, arrows move the choice, and the word
     "Selected" is on exactly one card (the choice is not colour only).

Run (needs Playwright for Python and its Chromium; the repo itself depends on neither):
  ~/tools/shots/bin/python docs/guides/planner-exposure-layout-check.py          # starts its own next dev, stops it after
  ~/tools/shots/bin/python docs/guides/planner-exposure-layout-check.py http://localhost:3000/planner
Exit code 0 only if every check passes. Add --shots DIR to save screenshots of the panel.
"""
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATE = "2026-12-15"
results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def start_server():
    port = free_port()
    proc = subprocess.Popen(
        ["npx", "next", "dev", "--turbopack", "-p", str(port)],
        cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
    )
    url = f"http://127.0.0.1:{port}/planner"
    for _ in range(180):
        try:
            if urllib.request.urlopen(url, timeout=5).status == 200:
                return proc, url
        except Exception:
            time.sleep(1)
    stop_server(proc)
    raise SystemExit("dev server did not start")


def stop_server(proc):
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    except ProcessLookupError:
        pass


# Page-coordinate boxes of everything the panel must keep still.
BOXES_JS = """() => {
  const q = (s) => document.querySelector(s);
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect();
    return [r.x + scrollX, r.y + scrollY, r.width, r.height].map(v => Math.round(v * 100) / 100); };
  const cards = [...document.querySelectorAll('input[name=exposure-mode]')].map(i => box(i.nextElementSibling));
  return {
    'panel': box(q('section[aria-labelledby=exposure-heading]')),
    'card quick': cards[0], 'card balanced': cards[1], 'card deep': cards[2],
    'warnings area': box(q('[data-testid=exposure-warnings]')),
    'marginal table': box(q('[data-testid=marginal-table]')),
    'filter line': box(q('[data-testid=exposure-filter]')),
    'Edit horizon heading': box(q('#horizon-heading')),
    'Filter box': box(q('#plan-filter')),
    'Train box': box(q('#plan-train')),
  };
}"""

CLIP_JS = """() => {
  const area = document.querySelector('[data-testid=exposure-warnings]');
  const line = document.querySelector('[data-testid=exposure-filter]');
  const panel = document.querySelector('section[aria-labelledby=exposure-heading]');
  const bad = [];
  // The reserved height is the CSS minimum. The content must fit inside it, or the area grows and the page below moves.
  const reserved = (e) => parseFloat(getComputedStyle(e).minHeight);
  const need = (e) => { const c = e.cloneNode(true); c.style.minHeight = '0'; c.style.height = 'auto'; e.parentNode.appendChild(c);
    const h = c.getBoundingClientRect().height; c.remove(); return Math.ceil(h); };
  const areaNeed = need(area), lineNeed = need(line);
  if (areaNeed > reserved(area) + 0.5) bad.push('warnings need ' + areaNeed + 'px, reserved ' + reserved(area));
  if (lineNeed > reserved(line) + 0.5) bad.push('filter line needs ' + lineNeed + 'px, reserved ' + reserved(line));
  for (const e of panel.querySelectorAll('*')) {
    if (e.closest('.overflow-x-auto')) continue;
    if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline') bad.push('sideways: ' + e.tagName + ' ' + (e.textContent || '').slice(0, 30));
  }
  if (document.documentElement.scrollWidth > innerWidth) bad.push('page scrolls sideways');
  return { bad, areaNeed, lineNeed, areaReserved: reserved(area), lineReserved: reserved(line), text: area.textContent };
}"""


class Page:
    def __init__(self, page, url):
        self.p, self.url = page, url
        self.seen = set()
        self.max_need = 0
        self.max_line = 0
        self.reserved = (0, 0)

    def fresh(self, train="wide-c11-hyperstar-2600"):
        self.p.goto(self.url)
        self.p.evaluate("localStorage.clear()")
        self.p.reload()
        self.p.wait_for_selector("#plan-train")
        self.p.fill("#plan-date", DATE)
        self.p.select_option("#plan-train", train)
        self.p.wait_for_selector("section[aria-labelledby=exposure-heading] input[name=exposure-mode]")

    def boxes(self):
        return self.p.evaluate(BOXES_JS)

    def clip(self):
        r = self.p.evaluate(CLIP_JS)
        self.max_need = max(self.max_need, r["areaNeed"])
        self.max_line = max(self.max_line, r["lineNeed"])
        self.reserved = (r["areaReserved"], r["lineReserved"])
        for line in r["text"].split("Warning")[1:] + r["text"].split("Note")[1:]:
            self.seen.add(line[:40])
        return r

    def mode(self):
        return self.p.evaluate("document.querySelector('input[name=exposure-mode]:checked').value")


def moved(a, b, skip=()):
    return [k for k in a if k not in skip and a[k] != b[k]]


def check_modes(pg, label):
    pg.fresh()
    base = pg.boxes()
    pg.p.locator("#exposure-bortle").focus()
    pg.p.keyboard.press("Tab")
    active = pg.p.evaluate("document.activeElement.name + ':' + document.activeElement.value")
    record(f"{label}: Tab from the Bortle box lands on the chosen mode radio", active == "exposure-mode:balanced", active)
    steps = [("ArrowLeft", "quick"), ("ArrowRight", "balanced"), ("ArrowRight", "deep"), ("ArrowLeft", "balanced")]
    bad, clip, selected_words = [], [], []
    for key, want in steps:
        pg.p.keyboard.press(key)
        got = pg.mode()
        if got != want:
            bad.append(f"{key}: wanted {want}, got {got}")
        m = moved(base, pg.boxes())
        if m:
            bad.append(f"{key}: moved {m}")
        clip += pg.clip()["bad"]
        n = pg.p.evaluate("[...document.querySelectorAll('section[aria-labelledby=exposure-heading] span')].filter(s => s.textContent === 'Selected' && getComputedStyle(s).visibility !== 'hidden').length")
        selected_words.append(n)
    record(f"{label}: arrow keys change the mode and nothing in the panel or below it moves", not bad, "; ".join(bad))
    record(f"{label}: warnings and cards not clipped, nothing scrolls sideways, across mode changes", not clip, "; ".join(clip))
    record(f"{label}: the word Selected is on exactly one card at every step (not colour only)", selected_words == [1, 1, 1, 1], str(selected_words))
    # Real mouse: move, press, hold 90 ms, release, on each card.
    bad = []
    for name, want in [("card quick", "quick"), ("card deep", "deep"), ("card balanced", "balanced")]:
        b = pg.boxes()[name]
        sx, sy = pg.p.evaluate("[scrollX, scrollY]")
        pg.p.evaluate(f"window.scrollTo(0, {max(0, b[1] - 200)})")
        sx, sy = pg.p.evaluate("[scrollX, scrollY]")
        x, y = b[0] - sx + b[2] / 2, b[1] - sy + 30
        pg.p.mouse.move(x, y)
        pg.p.mouse.down()
        pg.p.wait_for_timeout(90)
        pg.p.mouse.up()
        pg.p.wait_for_timeout(100)
        if pg.mode() != want:
            bad.append(f"click {name}: mode is {pg.mode()}")
        m = moved(base, pg.boxes())
        if m:
            bad.append(f"click {name}: moved {m}")
    record(f"{label}: a real mouse click on each card chooses it and nothing moves", not bad, "; ".join(bad))


def check_filters(pg, label, train, modes=("quick", "balanced", "deep")):
    pg.fresh(train)
    n_options = pg.p.evaluate("document.getElementById('plan-filter').options.length")
    base = pg.boxes()
    bad, clip = [], []
    for mode in modes:
        pg.p.locator(f"input[name=exposure-mode][value={mode}]").check(force=True)
        pg.p.wait_for_timeout(50)
        base = pg.boxes() if mode == modes[0] else base
        pg.p.locator("#plan-filter").focus()
        # back to "No filter", then one ArrowDown per filter
        pg.p.keyboard.press("Home")
        pg.p.wait_for_timeout(50)
        for i in range(n_options):
            if i:
                pg.p.keyboard.press("ArrowDown")
                pg.p.wait_for_timeout(40)
            m = moved(base, pg.boxes())
            if m:
                bad.append(f"{mode} filter #{i}: moved {m}")
            c = pg.clip()
            clip += [f"{mode} filter #{i}: {x}" for x in c["bad"]]
    record(f"{label}: stepping all {n_options} filters in 3 modes with ArrowDown moves nothing (cards, warnings area, table, heading, Filter box)", not bad, "; ".join(bad[:4]))
    record(f"{label}: warnings and filter line fit the room reserved (warnings: most needed {pg.max_need}px of {pg.reserved[0]:.0f}; filter line: {pg.max_line}px of {pg.reserved[1]:.0f})", not clip, "; ".join(clip[:4]))


def check_smart(pg, label):
    pg.fresh("wide-c11-hyperstar-2600")
    a = pg.p.evaluate("(() => { const r = document.getElementById('plan-filter-msg').getBoundingClientRect(); const s = document.getElementById('plan-filter').getBoundingClientRect(); return [r.height, s.height, s.width]; })()")
    pg.p.select_option("#plan-train", "smart-seestar-s50")
    pg.p.wait_for_timeout(100)
    b = pg.p.evaluate("(() => { const r = document.getElementById('plan-filter-msg').getBoundingClientRect(); const s = document.getElementById('plan-filter').getBoundingClientRect(); return [r.height, s.height, s.width]; })()")
    disabled = pg.p.evaluate("document.getElementById('plan-filter').disabled")
    record(f"{label}: Filter box and its message line keep their size on a smart scope, and it is disabled", a == b and disabled, f"{a} vs {b}, disabled={disabled}")


def run(pw, url, label, width, height, shots):
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": width, "height": height})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    pg = Page(page, url)
    check_modes(pg, label)
    check_filters(pg, label + " HyperStar f/1.9", "wide-c11-hyperstar-2600")
    check_filters(pg, label + " ASI533MC f/7", "deep-c11-reducer-533")
    check_smart(pg, label)
    record(f"{label}: distinct warning messages seen while sweeping: {len(pg.seen)}", len(pg.seen) >= 3, f"{len(pg.seen)}")
    # What the panel looks like, for the record.
    pg.fresh("wide-c11-hyperstar-2600")
    pg.p.select_option("#plan-filter", "optolong-lextreme")
    pg.p.wait_for_timeout(100)
    print(f"--- {label} panel text (HyperStar, L-eXtreme, Balanced) ---")
    print(pg.p.evaluate("document.querySelector('section[aria-labelledby=exposure-heading]').innerText")[:1800])
    if shots:
        pg.p.locator("section[aria-labelledby=exposure-heading]").screenshot(path=os.path.join(shots, f"exposure-{width}.png"))
    record(f"{label}: no page errors", not errors, "; ".join(errors[:2]))
    browser.close()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    shots = None
    if "--shots" in sys.argv:
        shots = sys.argv[sys.argv.index("--shots") + 1]
        args = [a for a in args if a != shots]
        os.makedirs(shots, exist_ok=True)
    proc = None
    url = args[0] if args else None
    if url is None:
        proc, url = start_server()
    try:
        with sync_playwright() as pw:
            run(pw, url, "1280px", 1280, 900, shots)
            run(pw, url, "390px", 390, 844, shots)
    finally:
        if proc:
            stop_server(proc)
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} of {len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
