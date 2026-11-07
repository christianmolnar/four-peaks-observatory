#!/usr/bin/env python3
"""
Layout proof for the /planner Exposure panel and the Filter selector (headless Chromium, real keys, real mouse).

jsdom has no layout, so Jest cannot see a card or a heading move. This script checks, at 1280, 768 and 390 px,
on the sample profile with the evening set to 2026-12-15:
  1. Mode change: choosing Quick, Balanced and Deep with the arrow keys (focus reached by Tab) and with a real
     mouse click leaves the page position and size of the three cards, the warnings area, the marginal table,
     the Edit horizon heading and the whole panel unchanged.
  2. Filter change: stepping the Filter box through all twelve filters with ArrowDown, on the HyperStar train
     and on the ASI533MC train, in every mode, leaves the same boxes (and the Filter box itself) unchanged.
     Warnings come and go in between (the script records how many distinct messages were seen).
  3. Messages are not clipped: the Filter line fits its box and nothing in the panel scrolls sideways; the page
     does not scroll sideways. The warnings area has a fixed height and its own scrollbar, so it may scroll; when it
     does, the line under it says "N more below, scroll" (the script records how many states scrolled).
  4. The Filter box and the line under it keep their size when the train switches between an optical train and
     a smart scope.
  5. Keyboard: Tab from the Bortle box lands on the chosen mode radio, arrows move the choice, and the word
     "Selected" is on exactly one card (the choice is not colour only).
  6. Sweep (the one that found the round-1 defects): for 3 trains, 6 targets (short usable windows, capped-sub
     notes, a roomy one), Bortle 1 and 9, Quick and Deep and every filter option, no element of the page may change
     its page position or size (the text inside the cards, the warnings box and the filter line is exempt; their
     boxes are not). The repro of the round-1 verdict (Thor's Helmet, ASI533MC train, Apertura) is also driven with
     real key presses only.
  7. Empty filter list (a v1 profile): the instruction under the Filter box is fully visible at 1024, 1279, 1280,
     1440, 1920, 2560 and 390 px.
  8. The marginal table has no cell wider than its box at 390 px (no inner sideways scroll).
  9. The round-2 states (the 12 px shift at 768 px with three mode cards side by side): see check_m2a_state.
Sections: --only modes,filters,smart,m2a,sweep,empty (default: all).

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
        ["npx", "next", "dev"] + ([] if os.environ.get("NO_TURBOPACK") else ["--turbopack"]) + ["-p", str(port)],
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
  // The warnings box has a fixed height and its own scrollbar; it must show that scrollbar and keep its height.
  const cs = getComputedStyle(area);
  if (cs.overflowY !== 'scroll') bad.push('warnings box does not always show its scrollbar (overflow-y ' + cs.overflowY + ')');
  if (area.offsetWidth - area.clientWidth < 4) bad.push('warnings scrollbar not drawn');
  // When the box needs scrolling the line under it says how many warnings are below; when it does not, the line is empty.
  const cue = document.querySelector('[data-testid=exposure-warnings-cue]').textContent;
  const need = area.scrollHeight - area.clientHeight;
  if (need > 4 && area.scrollTop === 0 && !/^\\d+ more below, scroll$/.test(cue)) bad.push('box scrolls (' + need + 'px) but the cue says: ' + JSON.stringify(cue));
  if (need <= 0 && cue !== '') bad.push('box does not scroll but the cue says: ' + JSON.stringify(cue));
  // The filter line must fit its fixed height.
  if (line.scrollHeight > line.clientHeight + 1) bad.push('filter line clipped: ' + line.scrollHeight + ' of ' + line.clientHeight);
  // Nothing in the panel (the marginal table included) is wider than its own box, and the page does not scroll sideways.
  for (const e of panel.querySelectorAll('*:not(caption)')) {
    if (e === area || area.contains(e)) continue;
    if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline') bad.push('sideways: ' + e.tagName + ' ' + (e.textContent || '').slice(0, 30));
  }
  const tbl = document.querySelector('[data-testid=marginal-table]');
  if (tbl && tbl.getBoundingClientRect().right > panel.getBoundingClientRect().right + 1) bad.push('marginal table wider than the panel');
  if (document.documentElement.scrollWidth > innerWidth) bad.push('page scrolls sideways');
  return { bad, areaHeight: area.clientHeight, areaScrolls: area.scrollHeight > area.clientHeight + 1, areaNeed: area.scrollHeight, lineNeed: line.scrollHeight, lineHeight: line.clientHeight, text: area.textContent };
}"""

# Every element of the page with its page position and size, except the text inside the cards' rows, the warnings
# box and the filter line (those boxes themselves are included). Returned flat, with a label per element.
SNAP_JS = """() => {
  const area = document.querySelector('[data-testid=exposure-warnings]');
  const line = document.querySelector('[data-testid=exposure-filter]');
  const out = [];
  for (const e of document.body.querySelectorAll('*')) {
    if ((e !== area && area.contains(e)) || (e !== line && line.contains(e)) || e.closest('dl')) continue;
    if (e.closest('[data-testid=target-table]') || e.closest('script,style,svg,nextjs-portal,next-route-announcer,nav,header')) continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // Fixed and sticky things (toast area, site header) follow the scroll, not the layout.
    let pinned = false;
    for (let n = e; n; n = n.parentElement) { const pos = getComputedStyle(n).position; if (pos === 'fixed' || pos === 'sticky') { pinned = true; break; } }
    if (pinned) continue;
    const id = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.getAttribute('data-testid') ? '[' + e.getAttribute('data-testid') + ']' : '');
    out.push([id, Math.round((r.x + scrollX) * 10) / 10, Math.round((r.y + scrollY) * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10, (e.textContent || '').slice(0, 24).replace(/\\s+/g, ' ')]);
  }
  return out;
}"""


class Page:
    def __init__(self, page, url):
        self.p, self.url = page, url
        self.seen = set()
        self.max_need = 0
        self.max_line = 0
        self.area_height = 0
        self.scrolled_states = 0

    def fresh(self, train="wide-c11-hyperstar-2600", date=None):
        self.p.goto(self.url)
        self.p.evaluate("localStorage.clear()")
        self.p.reload()
        self.p.wait_for_selector("#plan-train")
        self.p.fill("#plan-date", date or DATE)
        self.p.select_option("#plan-train", train)
        self.p.wait_for_selector("section[aria-labelledby=exposure-heading] input[name=exposure-mode]")

    def boxes(self):
        return self.p.evaluate(BOXES_JS)

    def clip(self):
        r = self.p.evaluate(CLIP_JS)
        self.max_need = max(self.max_need, r["areaNeed"])
        self.max_line = max(self.max_line, r["lineNeed"])
        self.area_height = r["areaHeight"]
        self.scrolled_states += 1 if r["areaScrolls"] else 0
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
    record(f"{label}: warnings scrollbar visible, filter line and marginal table fit, nothing scrolls sideways, across mode changes", not clip, "; ".join(clip))
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
    record(f"{label}: warnings box keeps its {pg.area_height}px and its visible scrollbar (most needed {pg.max_need}px; scrolls in {pg.scrolled_states} states); filter line fits; nothing wider than its box", not clip, "; ".join(clip[:4]))


def check_smart(pg, label):
    pg.fresh("wide-c11-hyperstar-2600")
    a = pg.p.evaluate("(() => { const r = document.getElementById('plan-filter-msg').getBoundingClientRect(); const s = document.getElementById('plan-filter').getBoundingClientRect(); return [r.height, s.height, s.width]; })()")
    pg.p.select_option("#plan-train", "smart-seestar-s50")
    pg.p.wait_for_timeout(100)
    b = pg.p.evaluate("(() => { const r = document.getElementById('plan-filter-msg').getBoundingClientRect(); const s = document.getElementById('plan-filter').getBoundingClientRect(); return [r.height, s.height, s.width]; })()")
    disabled = pg.p.evaluate("document.getElementById('plan-filter').disabled")
    record(f"{label}: Filter box and its message line keep their size on a smart scope, and it is disabled", a == b and disabled, f"{a} vs {b}, disabled={disabled}")


SWEEP_TRAINS = ["wide-c11-hyperstar-2600", "deep-c11-reducer-533", "deep-c11-2600"]
# Short usable windows on 2026-12-15 (North America Nebula 66 min, Hercules cluster 22, Thor's Helmet 86), one roomy
# (Orion Nebula), and two more; capped-sub notes come from Bortle 1 with narrow filters on the slow C11 trains.
SWEEP_TARGETS = ["North America Nebula", "Hercules Globular Cluster", "Thor's Helmet", "Orion Nebula", "Rosette Nebula", "Triangulum Galaxy"]


def diff(a, b):
    """Elements whose size changed first (the cause), then those that only moved (the effect)."""
    if len(a) != len(b):
        return [f"{len(a)} elements became {len(b)}"]
    changed = [(x, y) for x, y in zip(a, b) if x[:5] != y[:5]]
    sized = [(x, y) for x, y in changed if x[3:5] != y[3:5]]
    # deepest first: the last element in document order whose own size changed is the innermost cause
    pick = sized[::-1] + [c for c in changed if c not in sized]
    return [f"{x[0]} '{x[5]}': {x[1:5]} -> {y[1:5]}" for x, y in pick]


def pick_target(pg, name):
    loc = pg.p.locator("[data-testid=target-table] button", has_text=name)
    if loc.count() == 0:
        return False
    loc.first.click()
    pg.p.wait_for_timeout(60)
    return True


def check_sweep(pg, label):
    """Every combination must leave every element where it was: one baseline per (train, target), then all of Bortle x mode x filter."""
    bad, states, skipped, scrolled = [], 0, [], 0
    for train in SWEEP_TRAINS:
        pg.fresh(train)
        n_options = pg.p.evaluate("document.getElementById('plan-filter').options.length")
        pg.p.get_by_label("Show targets that do not fit").check()  # so every target is listed on every train
        for target in SWEEP_TARGETS:
            if not pick_target(pg, target):
                skipped.append(f"{train}/{target}")
                continue
            pg.p.wait_for_selector("section[aria-labelledby=exposure-heading] input[name=exposure-mode]")
            base = None
            for bortle in ("1", "9"):
                pg.p.select_option("#exposure-bortle", bortle)
                for mode in ("quick", "deep"):
                    pg.p.locator(f"input[name=exposure-mode][value={mode}]").check(force=True)
                    for i in range(n_options):
                        pg.p.select_option("#plan-filter", index=i)
                        snap = pg.p.evaluate(SNAP_JS)
                        states += 1
                        c = pg.clip()
                        scrolled += 1 if c["areaScrolls"] else 0
                        if base is None:
                            base = snap
                        d = diff(base, snap)
                        if d:
                            bad.append(f"{label} {train}/{target}/Bortle {bortle}/{mode}/filter #{i}: {d[0]} (+{len(d) - 1} more)")
                        bad += [f"{train}/{target}/{bortle}/{mode}/#{i}: {x}" for x in c["bad"]]
    record(f"{label}: sweep of {states} states (3 trains, targets with short windows, Bortle 1 and 9, Quick and Deep, every filter): no element moves or changes size; the warnings box scrolled in {scrolled}", not bad and states > 0, "; ".join(bad[:3]) + (f" ... {len(bad)} in all" if len(bad) > 3 else ""))
    record(f"{label}: sweep covered every target asked for", not skipped, "; ".join(skipped[:6]))


# The round-2 (M2a) defect: at 768 px, with three mode cards side by side, a row of a card wrapped past its reserved height
# for some filters and the page below moved 12 px (cards 571 to 583 px). Found by sweeping 2027-06-15 on the HyperStar
# train; these are three of its states. Fixed by one column below 1024 px (ExposurePanel). With `md:grid-cols-3` put back,
# this check fails at 768 px (see docs/guides/planner-preview.md).
M2A_DATE = "2027-06-15"
M2A_STATES = [("Andromeda Galaxy", "1"), ("Eagle Nebula", "9"), ("Triangulum Galaxy", "9")]


def check_m2a_state(pg, label):
    bad, states = [], 0
    pg.fresh("wide-c11-hyperstar-2600", M2A_DATE)
    n_options = pg.p.evaluate("document.getElementById('plan-filter').options.length")
    pg.p.get_by_label("Show targets that do not fit").check()
    for target, bortle in M2A_STATES:
        if not pick_target(pg, target):
            bad.append(f"{target} not listed on {M2A_DATE}")
            continue
        pg.p.wait_for_selector("section[aria-labelledby=exposure-heading] input[name=exposure-mode]")
        pg.p.select_option("#exposure-bortle", bortle)
        pg.p.locator("input[name=exposure-mode][value=quick]").check(force=True)
        pg.p.select_option("#plan-filter", index=0)
        base = pg.p.evaluate(SNAP_JS)
        for i in range(n_options):
            pg.p.select_option("#plan-filter", index=i)
            states += 1
            d = diff(base, pg.p.evaluate(SNAP_JS))
            if d:
                bad.append(f"{target}/Bortle {bortle}/Quick/filter #{i}: {d[0]}")
    record(f"{label}: the round-2 states ({M2A_DATE}, HyperStar, Quick, {states} filter steps over {len(M2A_STATES)} targets): nothing moves or changes size", not bad and states > 0, "; ".join(bad[:2]) + (f" ... {len(bad)} in all" if len(bad) > 2 else ""))


def key_repro(pg, label):
    """The round-1 verdict repro with real key presses only: Thor's Helmet, ASI533MC, Apertura, 2026-12-15."""
    pg.fresh("deep-c11-reducer-533")
    pg.p.locator("[data-testid=target-table] button", has_text="Thor's Helmet").first.focus()
    pg.p.keyboard.press("Enter")
    pg.p.wait_for_selector("section[aria-labelledby=exposure-heading] input[name=exposure-mode]")
    pg.p.locator("#plan-filter").focus()
    pg.p.keyboard.press("Home")
    base = pg.p.evaluate(SNAP_JS)
    bad, steps = [], 0
    labels = pg.p.evaluate("[...document.getElementById('plan-filter').options].map(o => o.text)")
    target_idx = next(i for i, t in enumerate(labels) if t.startswith("Apertura"))
    for mode_keys in ([], ["ArrowLeft"], ["ArrowRight", "ArrowRight"], ["ArrowLeft"]):
        # filter by keyboard: Home, then ArrowDown to Apertura, then Home again
        for state in ("none", "apertura"):
            pg.p.locator("#plan-filter").focus()
            pg.p.keyboard.press("Home")
            if state == "apertura":
                for _ in range(target_idx):
                    pg.p.keyboard.press("ArrowDown")
            pg.p.wait_for_timeout(40)
            d = diff(base, pg.p.evaluate(SNAP_JS))
            steps += 1
            if d:
                bad.append(f"{state}: {d[0]}")
        pg.p.locator("input[name=exposure-mode]:checked").focus()
        for k in mode_keys:
            pg.p.keyboard.press(k)
            pg.p.wait_for_timeout(40)
            d = diff(base, pg.p.evaluate(SNAP_JS))
            steps += 1
            if d:
                bad.append(f"{k} -> {pg.mode()}: {d[0]}")
    record(f"{label}: Thor's Helmet + ASI533MC + Apertura with real key presses only ({steps} steps, Quick/Balanced/Deep): nothing moves", not bad, "; ".join(bad[:3]))


def v1_profile():
    """The sample profile as version 1 stored it: no filter library, no per-train filter."""
    import json
    d = json.load(open(os.path.join(REPO, "src", "planner", "data", "sample-profile.json")))
    d["version"] = 1
    del d["equipment"]["filters"]
    for t in d["trains"]:
        t.pop("filterId", None)
    return d


EMPTY_WIDTHS = [(1024, 800), (1279, 800), (1280, 900), (1440, 900), (1920, 1080), (2560, 1440), (390, 844)]
EMPTY_JS = """() => {
  const m = document.getElementById('plan-filter-msg');
  const r = m.getBoundingClientRect();
  return { text: m.textContent, need: m.scrollHeight, have: m.clientHeight, width: Math.round(r.width), height: Math.round(r.height),
           options: document.getElementById('plan-filter').options.length, pageSideways: document.documentElement.scrollWidth > innerWidth };
}"""


def check_empty(pw, url):
    """A v1 profile has no filters; the instruction under the Filter box must be read in full at every width."""
    import json
    profile = json.dumps(v1_profile())
    for w, h in EMPTY_WIDTHS:
        browser = pw.chromium.launch(ignore_default_args=["--hide-scrollbars"])
        page = browser.new_page(viewport={"width": w, "height": h})
        page.goto(url)
        page.evaluate("p => localStorage.setItem('fpo-planner-profile-v1', p)", profile)
        page.reload()
        page.wait_for_selector("#plan-train")
        page.select_option("#plan-train", "deep-c11-reducer-533")
        r = page.evaluate(EMPTY_JS)
        ok = r["options"] == 1 and r["text"].strip() != "" and r["need"] <= r["have"] and not r["pageSideways"]
        record(f"empty filter list at {w}px: whole instruction visible (needs {r['need']}px of {r['have']}px, box {r['width']}x{r['height']}): \"{r['text']}\"", ok, "")
        browser.close()


def run(pw, url, label, width, height, shots, only):
    browser = pw.chromium.launch(ignore_default_args=["--hide-scrollbars"])
    page = browser.new_page(viewport={"width": width, "height": height})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    pg = Page(page, url)
    want = lambda k: only is None or k in only
    if want("modes"):
        check_modes(pg, label)
    if want("filters"):
        check_filters(pg, label + " HyperStar f/1.9", "wide-c11-hyperstar-2600")
        check_filters(pg, label + " ASI533MC f/7", "deep-c11-reducer-533")
        record(f"{label}: distinct warning messages seen while sweeping: {len(pg.seen)}", len(pg.seen) >= 3, f"{len(pg.seen)}")
    if want("smart"):
        check_smart(pg, label)
    if want("m2a"):
        check_m2a_state(pg, label)
    if want("sweep"):
        check_sweep(pg, label)
        key_repro(pg, label)
    # What the panel looks like, for the record.
    if want("smart"):
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
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1].split(",")
        args = [a for a in args if a != sys.argv[sys.argv.index("--only") + 1]]
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
            if only is None or "empty" in only:
                check_empty(pw, url)
            # ONLY_WIDTH=390 runs one width (the sweep takes about 8 minutes per width).
            for label, w, h in (("1280px", 1280, 900), ("768px", 768, 1024), ("390px", 390, 844)):
                if os.environ.get("ONLY_WIDTH") in (None, str(w)):
                    run(pw, url, label, w, h, shots, only)
    finally:
        if proc:
            stop_server(proc)
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} of {len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
