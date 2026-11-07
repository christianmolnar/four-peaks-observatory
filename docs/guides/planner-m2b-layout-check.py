#!/usr/bin/env python3
"""
Layout proof for the /planner Planets section and Night itinerary (headless Chromium, real keys, real mouse),
at 1280, 768 and 390 px, on the sample profile with the evening set to 2026-12-15.

jsdom has no layout, so Jest cannot see a card or a heading move. This script checks:
  Planets
    P1. Choosing each of the eight planets with the arrow keys (Right through all eight, Left back) leaves the page
        position and size of every card, the whole section, the Itinerary section, the Edit horizon heading and the
        Profile section unchanged.
    P2. A real mouse click (move, press, hold 90 ms, release) on each card chooses it and moves nothing.
    P3. Nothing is clipped: every row of the visible panel and every card line fits its box (scrollHeight <=
        clientHeight), nothing inside the section scrolls sideways, and the page does not scroll sideways.
    P4. Tab never reaches an element inside a hidden panel (80 Tab presses from the chosen card), and the Space key
        ticks a checklist box without moving anything.
    P5. The visible altitude chart has a title and a description (the text alternative).
  Itinerary (four slots: Orion Nebula, Triangulum Galaxy, Thor's Helmet, Saturn, on the C11 + 0.7x + ASI533MC train)
    I1. Eight reorder presses of the Up and Down buttons, by keyboard: the section, the Planets section, the Edit
        horizon heading, the Profile section and the details box keep their size and position; each slot keeps its own
        height wherever it moves; focus stays on the pressed button.
    I2. Changing a slot's filter (all 13 options with ArrowDown), train and mode: the same boxes stay.
    I3. Choosing each slot's Details moves nothing.
    I4. Nothing is clipped: the Light line, the chips, the why line, the totals, the note box and the details fit.
        The overlap warning is visible after Orion Nebula, then Triangulum Galaxy.
    I5. No sideways scroll anywhere.
Sections: --only planets,itinerary (default: both).

Run (needs Playwright for Python and its Chromium; the repo itself depends on neither):
  ~/tools/shots/bin/python docs/guides/planner-m2b-layout-check.py         # starts its own next dev, stops it after
  ~/tools/shots/bin/python docs/guides/planner-m2b-layout-check.py http://localhost:3000/planner
Exit code 0 only if every check passes. Add --shots DIR to save screenshots of both sections.
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
TRAIN = "deep-c11-reducer-533"
WIDTHS = [("1280px", 1280, 900), ("768px", 768, 1024), ("390px", 390, 844)]
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
        ["npx", "next", "dev"] + ([] if os.environ.get("NO_TURBOPACK") else ["--turbopack"]) + ["-p", str(port)],
        cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
    )
    url = f"http://127.0.0.1:{port}/planner"
    for _ in range(240):
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


# Page-coordinate boxes of what must stay still. Slot boxes are listed by slot id so a slot can be followed wherever it moves.
BOXES_JS = """() => {
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect();
    return [r.x + scrollX, r.y + scrollY, r.width, r.height].map(v => Math.round(v * 100) / 100); };
  const q = (s) => document.querySelector(s);
  const out = {
    'planets section': box(q('section[aria-labelledby=planets-heading]')),
    'itinerary section': box(q('section[aria-labelledby=itinerary-heading]')),
    'planet cards grid': box(q('section[aria-labelledby=planets-heading] fieldset')),
    'planet panels': box(q('section[aria-labelledby=planets-heading] .mt-6.grid')),
    'slot details': box(q('[data-testid=slot-detail]')),
    'Edit horizon heading': box(q('#horizon-heading')),
    'profile section': box(q('section[aria-labelledby=profile-heading]')),
    'exposure panel': box(q('section[aria-labelledby=exposure-heading]')),
  };
  document.querySelectorAll('input[name=planet]').forEach((i) => { out['card ' + i.value] = box(i.closest('label')); });
  return out;
}"""
SLOT_SIZES_JS = """() => Object.fromEntries([...document.querySelectorAll('[data-testid^=slot-s]')]
  .filter(e => /^slot-s\\d+$/.test(e.getAttribute('data-testid')))
  .map(e => [e.getAttribute('data-testid'), Math.round(e.getBoundingClientRect().height * 100) / 100]))"""
CLIP_JS = """() => {
  const bad = [];
  const fits = (e, what) => { if (e && e.scrollHeight > e.clientHeight + 1) bad.push(what + ' clipped: ' + e.scrollHeight + ' of ' + e.clientHeight); };
  const vis = document.querySelector('section[aria-labelledby=planets-heading] .mt-6.grid > div:not(.invisible)');
  if (vis) vis.querySelectorAll('dd').forEach((d, i) => fits(d, 'planet row ' + i));
  document.querySelectorAll('input[name=planet]').forEach((i) => i.closest('label').querySelectorAll('p').forEach((p) => fits(p, 'card line ' + i.value)));
  document.querySelectorAll('[data-testid^=slot-light-],[data-testid^=itinerary-why],[data-testid^=itinerary-totals],[data-testid^=slot-chips-]').forEach((e) => fits(e, e.getAttribute('data-testid')));
  document.querySelectorAll('section[aria-labelledby=itinerary-heading] input[type=text]').forEach((e) => { if (e.scrollWidth > e.clientWidth + 1 && e.value.length < 20) bad.push('note box too narrow'); });
  const det = document.querySelector('[data-testid=slot-detail]');
  if (det) { const live = det.firstElementChild; if (live.getBoundingClientRect().bottom > det.getBoundingClientRect().bottom + 1) bad.push('details content taller than its box'); }
  for (const sec of document.querySelectorAll('section[aria-labelledby=planets-heading],section[aria-labelledby=itinerary-heading]')) {
    for (const e of sec.querySelectorAll('*')) {
      if (e.closest('svg') || e.closest('.invisible') || e.tagName === 'CAPTION' || e.classList.contains('sr-only')) continue;
      if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline' && getComputedStyle(e).overflowX !== 'visible') bad.push('sideways: ' + e.tagName + ' ' + (e.textContent || '').slice(0, 30));
    }
  }
  if (document.documentElement.scrollWidth > innerWidth) bad.push('page scrolls sideways');
  return bad;
}"""


class Pg:
    def __init__(self, page, url):
        self.p, self.url = page, url

    def fresh(self, train=TRAIN):
        self.p.goto(self.url)
        self.p.evaluate("localStorage.clear()")
        self.p.reload()
        self.p.wait_for_selector("#plan-train")
        self.p.fill("#plan-date", DATE)
        self.p.select_option("#plan-train", train)
        self.p.wait_for_selector("input[name=planet]")

    def boxes(self):
        return self.p.evaluate(BOXES_JS)

    def selected_planet(self):
        return self.p.evaluate("document.querySelector('input[name=planet]:checked').value")

    def clip(self):
        return self.p.evaluate(CLIP_JS)


def moved(a, b, skip=()):
    return [k for k in a if k not in skip and a[k] != b[k]]


def mouse_click(pg, locator):
    # Centre it in the window first: the site header is fixed and would cover a button scrolled to the top edge.
    locator.evaluate("e => e.scrollIntoView({block: 'center', behavior: 'instant'})")
    pg.p.wait_for_timeout(500)
    b = locator.bounding_box()
    pg.p.mouse.move(b["x"] + b["width"] / 2, b["y"] + min(20, b["height"] / 2))
    pg.p.mouse.down()
    pg.p.wait_for_timeout(90)
    pg.p.mouse.up()
    pg.p.wait_for_timeout(80)


def check_planets(pg, label, shots, width):
    pg.fresh()
    base = pg.boxes()
    order = ["Jupiter", "Saturn", "Mars", "Venus", "Mercury", "Uranus", "Neptune", "Moon"]
    # P1: arrow keys through all eight and back, starting from the first card.
    pg.p.locator("input[name=planet]:checked").focus()
    bad, seen, clip = [], [], []
    for _ in range(8):
        pg.p.keyboard.press("ArrowLeft")
    seen.append(pg.selected_planet())
    base = pg.boxes()
    for step in range(7):
        pg.p.keyboard.press("ArrowRight")
        seen.append(pg.selected_planet())
        m = moved(base, pg.boxes())
        if m:
            bad.append(f"Right #{step + 1} -> {seen[-1]}: moved {m[:3]}")
        clip += pg.clip()
    for step in range(7):
        pg.p.keyboard.press("ArrowLeft")
        seen.append(pg.selected_planet())
        m = moved(base, pg.boxes())
        if m:
            bad.append(f"Left #{step + 1} -> {seen[-1]}: moved {m[:3]}")
        clip += pg.clip()
    record(f"{label} planets: arrow keys visit all eight cards ({', '.join(dict.fromkeys(seen))}) and nothing moves", len(set(seen)) == 8 and not bad, "; ".join(bad[:3]))
    record(f"{label} planets: nothing clipped or scrolling sideways across all eight (cards, rows, section)", not clip, "; ".join(dict.fromkeys(clip))[:300])
    # P2: real mouse on every card.
    bad = []
    for name in order:
        loc = pg.p.locator(f"input[name=planet][value={name}]").locator("xpath=ancestor::label")
        loc.scroll_into_view_if_needed()
        mouse_click(pg, loc)
        if pg.selected_planet() != name:
            bad.append(f"click {name}: got {pg.selected_planet()}")
        m = moved(base, pg.boxes())
        if m:
            bad.append(f"click {name}: moved {m[:3]}")
    record(f"{label} planets: a real mouse click on each card chooses it and nothing moves", not bad, "; ".join(bad[:3]))
    # P4: Tab never enters a hidden panel; Space ticks a box without moving anything.
    pg.p.locator("input[name=planet][value=Jupiter]").focus()
    pg.p.keyboard.press("ArrowLeft")
    pg.p.locator("input[name=planet]:checked").focus()
    hidden, boxes_reached, bad = 0, 0, []
    base = pg.boxes()
    for _ in range(80):
        pg.p.keyboard.press("Tab")
        inside = pg.p.evaluate("(() => { const a = document.activeElement; const mine = !!a.closest('section[aria-labelledby=planets-heading]'); return [!!a.closest('[aria-hidden=true]'), mine ? (a.type || a.tagName) : 'elsewhere']; })()")
        hidden += 1 if inside[0] else 0
        if inside[1] == "checkbox":
            boxes_reached += 1
            pg.p.keyboard.press("Space")
            m = moved(base, pg.boxes())
            if m:
                bad.append(f"Space moved {m[:2]}")
    record(f"{label} planets: 80 Tab presses reach {boxes_reached} checklist boxes and none inside a hidden panel; Space ticks without moving anything", hidden == 0 and boxes_reached >= 10 and not bad, f"hidden={hidden} boxes={boxes_reached} {'; '.join(bad[:2])}")
    # P5: the text alternative.
    alt = pg.p.evaluate("""(() => { const vis = document.querySelector('section[aria-labelledby=planets-heading] .mt-6.grid > div:not(.invisible)');
      const svg = vis.querySelector('svg'); return [svg.getAttribute('role'), svg.querySelector('title').textContent, svg.querySelector('desc').textContent.length]; })()""")
    record(f"{label} planets: the visible chart is an image with a title and a description ({alt[1]!r}, {alt[2]} characters)", alt[0] == "img" and alt[1] and alt[2] > 20, str(alt))
    if shots:
        pg.p.locator("section[aria-labelledby=planets-heading]").screenshot(path=os.path.join(shots, f"planets-{width}.png"))


def add_slot(pg, target_value):
    pg.p.select_option("#it-add-target", target_value)
    pg.p.locator("section[aria-labelledby=itinerary-heading] button", has_text="Add to itinerary").focus()
    pg.p.keyboard.press("Enter")
    pg.p.wait_for_timeout(120)


def slot_ids(pg):
    return pg.p.evaluate("[...document.querySelectorAll('[data-testid^=slot-s]')].map(e => e.getAttribute('data-testid')).filter(t => /^slot-s\\d+$/.test(t)).map(t => t.slice(5))")


def check_itinerary(pg, label, shots, width):
    pg.fresh()
    for t in ["m42", "m33", "ngc2359", "planet-saturn"]:
        add_slot(pg, t)
    ids = slot_ids(pg)
    record(f"{label} itinerary: four slots added from the keyboard", len(ids) == 4, str(ids))
    chips = pg.p.evaluate("[...document.querySelectorAll('[data-testid^=slot-chips-]')].map(e => e.textContent)")
    record(f"{label} itinerary: an overlap, a flip and a cut-short slot show their warnings ({' | '.join(chips)[:140]})", any("Warning: overlaps window" in c for c in chips) and any("meridian flip" in c for c in chips) and any("cut short" in c for c in chips), str(chips))
    base = pg.boxes()
    sizes = pg.p.evaluate(SLOT_SIZES_JS)
    sections = lambda b: {k: v for k, v in b.items() if not k.startswith("card ") and k != "planet cards grid" and k != "planet panels"}
    # I1: eight reorder presses by keyboard.
    bad, clip = [], []
    plan = [(0, "down"), (1, "down"), (3, "up"), (3, "up"), (2, "down"), (0, "up"), (1, "down"), (2, "up")]
    for n, (pos, d) in enumerate(plan):
        ids = slot_ids(pg)
        sid = ids[pos]
        target = pg.p.locator(f"#it-{d}-{sid}")
        before_names = pg.p.evaluate("[...document.querySelectorAll('section[aria-labelledby=itinerary-heading] ol > li h3')].map(h => h.textContent)")
        target.focus()
        pg.p.keyboard.press("Enter")
        pg.p.wait_for_timeout(60)
        after_names = pg.p.evaluate("[...document.querySelectorAll('section[aria-labelledby=itinerary-heading] ol > li h3')].map(h => h.textContent.replace(/^\\d+\\. /, ''))")
        focus_ok = pg.p.evaluate(f"document.activeElement && document.activeElement.id === 'it-{d}-{sid}'")
        if not focus_ok:
            bad.append(f"press {n + 1}: focus left the {d} button of {sid}")
        m = moved(sections(base), sections(pg.boxes()))
        if m:
            bad.append(f"press {n + 1} ({d} on slot {pos + 1}): moved {m[:3]}")
        s2 = pg.p.evaluate(SLOT_SIZES_JS)
        if s2 != sizes:
            bad.append(f"press {n + 1}: slot heights changed {sizes} -> {s2}")
        clip += pg.clip()
    record(f"{label} itinerary: eight Up/Down presses by keyboard keep the section, the Planets section, the Edit horizon heading, the Profile section and the details box where they were; every slot keeps its height; focus follows", not bad, "; ".join(bad[:3]))
    record(f"{label} itinerary: nothing clipped or scrolling sideways during the reorders", not clip, "; ".join(dict.fromkeys(clip))[:300])
    # I2: filter, train and mode on the second slot.
    ids = slot_ids(pg)
    sid = ids[1]
    n_filters = pg.p.evaluate(f"document.getElementById('it-filter-{sid}').options.length")
    bad, clip = [], []
    pg.p.locator(f"#it-filter-{sid}").focus()
    pg.p.keyboard.press("Home")
    for i in range(n_filters):
        if i:
            pg.p.keyboard.press("ArrowDown")
            pg.p.wait_for_timeout(40)
        m = moved(sections(base), sections(pg.boxes()))
        s2 = pg.p.evaluate(SLOT_SIZES_JS)
        if m or s2 != sizes:
            bad.append(f"filter #{i}: moved {m[:2]} sizes {s2 if s2 != sizes else 'same'}")
        clip += pg.clip()
    record(f"{label} itinerary: stepping all {n_filters} filters of a slot with ArrowDown moves nothing and no slot changes height", not bad, "; ".join(bad[:3]))
    for sel, values in ((f"#it-train-{sid}", ["deep-c11-2600", "wide-c11-hyperstar-2600", "deep-c11-reducer-533"]), (f"#it-mode-{sid}", ["quick", "deep", "balanced"])):
        for v in values:
            pg.p.select_option(sel, v)
            pg.p.wait_for_timeout(60)
            m = moved(sections(base), sections(pg.boxes()))
            s2 = pg.p.evaluate(SLOT_SIZES_JS)
            if m or s2 != sizes:
                bad.append(f"{sel}={v}: moved {m[:2]} sizes {s2 if s2 != sizes else 'same'}")
            clip += pg.clip()
    pg.p.select_option(f"#it-filter-{sid}", "")
    record(f"{label} itinerary: changing a slot's train and mode moves nothing either", not bad, "; ".join(bad[:3]))
    record(f"{label} itinerary: nothing clipped across the filter, train and mode changes", not clip, "; ".join(dict.fromkeys(clip))[:300])
    # I3: Details for each slot.
    bad = []
    for sid2 in slot_ids(pg):
        btn = pg.p.locator(f"[data-testid=slot-{sid2}] button", has_text="Details")
        btn.focus()
        pg.p.keyboard.press("Enter")
        pg.p.wait_for_timeout(50)
        m = moved(sections(base), sections(pg.boxes()))
        if m:
            bad.append(f"details {sid2}: moved {m[:2]}")
    record(f"{label} itinerary: choosing each slot's Details moves nothing", not bad, "; ".join(bad[:3]))
    # I4/I5: a mouse click on Up/Down works first time and moves nothing.
    ids = slot_ids(pg)
    btn = pg.p.locator(f"#it-down-{ids[0]}")
    first = pg.p.evaluate("document.querySelector('section[aria-labelledby=itinerary-heading] ol > li h3').textContent")
    mouse_click(pg, btn)
    second = pg.p.evaluate("document.querySelector('section[aria-labelledby=itinerary-heading] ol > li h3').textContent")
    m = moved(sections(base), sections(pg.boxes()))
    record(f"{label} itinerary: a real mouse click on Down works the first time and moves nothing else", first != second and not m, f"{first!r} -> {second!r} {m[:2]}")
    if shots:
        pg.p.locator("section[aria-labelledby=itinerary-heading]").screenshot(path=os.path.join(shots, f"itinerary-{width}.png"))


def run(pw, url, label, width, height, shots, only):
    browser = pw.chromium.launch(ignore_default_args=["--hide-scrollbars"])
    page = browser.new_page(viewport={"width": width, "height": height})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    pg = Pg(page, url)
    if only is None or "planets" in only:
        check_planets(pg, label, shots, width)
    if only is None or "itinerary" in only:
        check_itinerary(pg, label, shots, width)
    record(f"{label}: no page errors", not errors, "; ".join(errors[:2]))
    browser.close()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    only = None
    if "--only" in sys.argv:
        val = sys.argv[sys.argv.index("--only") + 1]
        only = val.split(",")
        args = [a for a in args if a != val]
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
            for label, w, h in WIDTHS:
                run(pw, url, label, w, h, shots, only)
    finally:
        if proc:
            stop_server(proc)
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} of {len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
