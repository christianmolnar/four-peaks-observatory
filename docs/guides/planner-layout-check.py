#!/usr/bin/env python3
"""
Layout-independent proof for the /planner horizon editor (headless Chromium, real keys, real mouse).

Jest cannot see layout, so it cannot catch a button that moves between mouse-down and mouse-up.
This script checks, at 1280, 768 and 390 px:
  1. Save horizon, Discard changes, Use sample horizon and Clear horizon have identical bounding
     boxes (page coordinates) before and after each kind of rejected value, and the four message
     lines exist before any error.
  2. After bad typing, with no Tab or Enter pressed, a real mouse click (move, down, 90 ms hold, up)
     on Discard, Use sample horizon, Clear horizon works on the first attempt, clicking in the
     top 20 percent of the button (the part that missed before). Save is checked three ways: it is
     inert while a horizon box is bad; one click saves once the box is fixed; one click saves when
     only Minimum altitude was bad.
  3. After EVERY key (not only before and after), the four action buttons and the target list keep
     their page position while typing 500 in Start, 91 and 95 in Height, and dragging a slider.
     Clear horizon and Add a blocked arc leave Save horizon where it was.
  4. At 1280, 1024, 768, 640, 390 and 360 px no message line is clipped (scrollHeight <= clientHeight)
     for bad Start, End, Height and Minimum altitude text.
  5. A toast never takes a click: after an import, a real click on Save horizon, scrolled under the
     toast, works first time; the toast clears itself. "Edit horizon" lands below the nav (item 6).
  6. At all six widths, by mouse and by Enter, once scrollY has stopped changing, a hit test finds the
     Edit horizon heading and Clear horizon on screen and not covered by the nav.

Run (needs Playwright for Python and its Chromium; the repo itself does not depend on either):
  python3 docs/guides/planner-layout-check.py                  # starts its own next dev on a free port, stops it after
  python3 docs/guides/planner-layout-check.py http://localhost:3000/planner   # use a server you already run
Exit code 0 only if every check passes. Add --shots DIR to save screenshots.
"""
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BUTTONS = ["Save horizon", "Discard changes", "Use sample horizon", "Clear horizon"]
MSG_IDS = ["arc-start-msg", "arc-end-msg", "arc-height-msg", "min-alt-msg"]
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


class Planner:
    def __init__(self, page, url):
        self.p, self.url = page, url

    def fresh(self):
        self.p.goto(self.url)
        self.p.evaluate("localStorage.clear()")
        self.p.reload()
        self.p.wait_for_function("document.getElementById('arc-start-number') && document.getElementById('arc-start-number').value === '120'")
        self.p.locator("#horizon").scroll_into_view_if_needed()

    def box(self, name):
        """Bounding box in page coordinates, so scrolling does not count as movement."""
        loc = self.p.get_by_role("button", name=name, exact=True)
        return loc.evaluate("e => { const r = e.getBoundingClientRect(); return [r.x + scrollX, r.y + scrollY, r.width, r.height].map(v => Math.round(v * 100) / 100); }")

    def boxes(self):
        return {n: self.box(n) for n in BUTTONS}

    def list_box(self):
        """Page position and size of the target list, so a changing row count shows up."""
        return self.p.evaluate("""() => { const e = document.querySelector('[data-testid=target-table]');
            if (!e) return null; const r = e.getBoundingClientRect();
            return [r.x + scrollX, r.y + scrollY, r.width, r.height].map(v => Math.round(v * 100) / 100); }""")

    def snap(self):
        return {**self.boxes(), "target list": self.list_box()}

    def clipped(self):
        """Message slots whose text does not fit (scrollHeight above clientHeight)."""
        return self.p.evaluate("""(ids) => ids.filter(id => { const e = document.getElementById(id);
            return e && e.scrollHeight > e.clientHeight; })""", MSG_IDS)

    def each_key(self, field_id, text):
        """Snapshots after the click and select-all, then after every key press."""
        el = self.p.locator(f"#{field_id}-number")
        el.click()
        self.p.keyboard.press("Control+A")
        snaps = [self.snap()]
        for ch in text:
            self.p.keyboard.press(ch)
            snaps.append(self.snap())
        return snaps

    def drag_slider(self, label, fractions):
        """Real mouse drag along a slider; snapshots after every move."""
        sl = self.p.get_by_role("slider", name=label)
        sl.scroll_into_view_if_needed()
        b = sl.bounding_box()
        y = b["y"] + b["height"] / 2
        self.p.mouse.move(b["x"] + b["width"] * fractions[0], y)
        self.p.mouse.down()
        snaps = []
        for f in fractions[1:]:
            self.p.mouse.move(b["x"] + b["width"] * f, y, steps=3)
            snaps.append(self.snap())
        self.p.mouse.up()
        snaps.append(self.snap())
        return snaps

    def type(self, field_id, text):
        """Real key presses, one per character, into the number box."""
        el = self.p.locator(f"#{field_id}-number")
        el.click()
        self.p.keyboard.press("Control+A")
        if text == "":
            self.p.keyboard.press("Backspace")
        for ch in text:
            self.p.keyboard.press(ch)

    def mouse_click(self, name, y_fraction=0.2):
        """Real mouse: move, press, hold 90 ms, release, aimed in the top part of the button."""
        self.p.get_by_role("button", name=name, exact=True).scroll_into_view_if_needed()  # a person scrolls to it first
        b = self.box(name)
        scroll = self.p.evaluate("[scrollX, scrollY]")
        x, y = b[0] - scroll[0] + b[2] / 2, b[1] - scroll[1] + b[3] * y_fraction
        self.p.mouse.move(x, y)
        self.p.mouse.down()
        self.p.wait_for_timeout(90)
        self.p.mouse.up()
        self.p.wait_for_timeout(120)

    def value(self, field_id):
        return self.p.locator(f"#{field_id}-number").input_value()

    def msg(self, msg_id):
        return self.p.evaluate(f"document.getElementById('{msg_id}') ? document.getElementById('{msg_id}').textContent : null")

    def stored_arc(self):
        raw = self.p.evaluate("localStorage.getItem('fpo-planner-profile-v1')")
        if raw is None:
            return None
        arcs = json.loads(raw)["sites"][0]["blockedArcs"]
        return arcs[0] if arcs else None

    def clean(self):
        return (self.value("arc-start") == "120" and self.value("arc-end") == "320" and self.value("arc-height") == "42"
                and all(self.msg(m) == "" for m in MSG_IDS))


# (label, field id, text) : each is rejected by the form
BAD = [
    ("500 in Start", "arc-start", "500"),
    ("361 in Start", "arc-start", "361"),
    ("320 in Start (equals End)", "arc-start", "320"),
    ("91 in Height", "arc-height", "91"),
    ("95 in Height", "arc-height", "95"),
    ("empty Start", "arc-start", ""),
    ("1.5 in Start", "arc-start", "1.5"),
    ("100 in Minimum altitude", "min-alt", "100"),
]


def run_viewport(pw, url, label, width, height, shots):
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": width, "height": height})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    app = Planner(page, url)

    app.fresh()
    record(f"{label}: the four message lines exist before any error", all(app.msg(m) == "" for m in MSG_IDS))
    sizes = app.boxes()
    record(f"{label}: Save, Discard, Use sample horizon and Clear horizon are at least 44 px tall",
           all(b[3] >= 44 for b in sizes.values()), str({n: b[3] for n, b in sizes.items()}))
    if shots:
        page.screenshot(path=os.path.join(shots, f"{label}-page.png"), full_page=True)

    # 1. Identical bounding boxes before and after each rejected value.
    for name, field, text in BAD:
        app.fresh()
        before = app.boxes()
        app.type(field, text)
        after = app.boxes()
        shown = app.msg(field + "-msg")
        record(f"{label}: boxes identical after {name}", before == after and bool(shown), f"message: {shown!r}" if before == after else f"before {before} after {after}")
        if shots and field == "arc-start" and text == "500":
            page.screenshot(path=os.path.join(shots, f"{label}-bad-start.png"), full_page=True)

    # 1b. After EVERY key: buttons and the target list stay at the same page position.
    for name, field, text in [("500 in Start", "arc-start", "500"), ("91 in Height", "arc-height", "91"), ("95 in Height", "arc-height", "95")]:
        app.fresh()
        before = app.snap()
        snaps = app.each_key(field, text)
        moved = [i for i, sn in enumerate(snaps) if sn != before]
        record(f"{label}: buttons and target list identical after every key of {name}", not moved,
               f"changed after key index {moved}: {snaps[moved[0]]} vs {before}" if moved else f"{len(snaps) - 1} keys")
    for name, bar, fractions in [("Start", "Start azimuth", [0.3, 0.1, 0.5, 0.9, 1.0, 0.0, 0.6]), ("Height", "Height slider", [0.4, 0.1, 0.9, 1.0, 0.0])]:
        app.fresh()
        before = app.snap()
        snaps = app.drag_slider(bar + " slider" if "slider" not in bar else bar, fractions)
        # Dragging commits nothing: the list stays; only the buttons' own page position must hold.
        moved = [i for i, sn in enumerate(snaps) if sn != before]
        record(f"{label}: buttons and target list identical after every step of a {name} slider drag", not moved,
               f"changed at steps {moved}: {snaps[moved[0]]} vs {before}" if moved else f"{len(snaps)} steps")
    app.fresh()
    save_before = app.box("Save horizon")
    app.mouse_click("Clear horizon")
    record(f"{label}: Save horizon does not move on Clear horizon", app.box("Save horizon") == save_before, f"{save_before} -> {app.box('Save horizon')}")
    app.p.get_by_role("button", name="Add a blocked arc").click()
    record(f"{label}: Save horizon does not move on Add a blocked arc", app.box("Save horizon") == save_before, f"{save_before} -> {app.box('Save horizon')}")

    # 2. First mouse click, no Tab or Enter after the last key.
    for name, field, text in [b for b in BAD if b[1] != "min-alt"][:5]:
        for button in ["Discard changes", "Use sample horizon"]:
            app.fresh()
            if button == "Discard changes":
                app.type("arc-height", "50") if field != "arc-height" else None  # a real change, so Discard is enabled
            app.type(field, text)
            app.mouse_click(button)
            record(f"{label}: first click on {button} after {name}", app.clean(),
                   f"start={app.value('arc-start')} end={app.value('arc-end')} height={app.value('arc-height')} msgs={[app.msg(m) for m in MSG_IDS]}")
    for name, field, text in BAD[:5]:
        app.fresh()
        app.type(field, text)
        app.mouse_click("Clear horizon")
        gone = page.locator("#arc-start-number").count() == 0 and page.get_by_text("Horizon not set").count() > 0
        record(f"{label}: first click on Clear horizon after {name}", gone)

    # Save: three cases.
    app.fresh()
    app.type("arc-height", "50")
    app.type("arc-start", "500")
    disabled = page.get_by_role("button", name="Save horizon", exact=True).is_disabled()
    app.mouse_click("Save horizon")
    record(f"{label}: Save is inert while a horizon box is bad, nothing is stored", disabled and app.stored_arc() is None)
    app.type("arc-start", "130")
    app.mouse_click("Save horizon")
    record(f"{label}: after the box is fixed, first click on Save stores it", app.stored_arc() == {"startAz": 130, "endAz": 320, "heightDeg": 50}, str(app.stored_arc()))
    app.fresh()
    app.type("arc-height", "50")
    app.type("min-alt", "100")
    app.mouse_click("Save horizon")
    record(f"{label}: bad Minimum altitude, first click on Save stores the original Start and End",
           app.stored_arc() == {"startAz": 120, "endAz": 320, "heightDeg": 50}, str(app.stored_arc()))
    page.reload()
    page.wait_for_function("document.getElementById('arc-height-number') && document.getElementById('arc-height-number').value === '50'")
    record(f"{label}: reload shows the saved arc", app.value("arc-start") == "120" and app.value("arc-end") == "320" and app.value("arc-height") == "50")

    # Minimum altitude after each external event, with real keys.
    app.fresh()
    app.type("min-alt", "100")
    app.mouse_click("Use sample horizon")
    record(f"{label}: Minimum altitude is 20 with no message after Use sample horizon", app.value("min-alt") == "20" and app.msg("min-alt-msg") == "")

    # A toast takes no click and clears itself.
    app.fresh()
    page.get_by_role("button", name="Export profile (JSON)").scroll_into_view_if_needed()
    with page.expect_download() as dl:
        page.get_by_role("button", name="Export profile (JSON)").click()
    path = dl.value.path()
    page.set_input_files("#profile-import", path)
    page.wait_for_selector("[role=status]")
    toast = page.locator("[role=status]").first
    app.type("arc-height", "50")
    page.get_by_role("button", name="Save horizon", exact=True).scroll_into_view_if_needed()
    tb = toast.bounding_box()
    if tb:  # put Save horizon right under the toast, scrolling the page
        sb = app.box("Save horizon")
        target_y = tb["y"] + tb["height"] / 2 - sb[3] / 2
        page.evaluate(f"window.scrollTo(0, {sb[1]} - {target_y})")
    still_up = page.locator("[role=status]").count() > 0
    app.mouse_click("Save horizon", 0.5)
    record(f"{label}: first click on Save horizon under the toast saves", app.stored_arc() == {"startAz": 120, "endAz": 320, "heightDeg": 50},
           f"toast still up when clicked: {still_up}; stored {app.stored_arc()}")
    page.wait_for_function("document.querySelectorAll('[role=status]').length === 0", timeout=9000)
    record(f"{label}: the toast clears itself", True)

    record(f"{label}: no page errors", not errors, "; ".join(errors))
    browser.close()


def settled_scroll_y(page):
    """Waits until scrollY stops changing (smooth scrolling is on in globals.css), then returns it."""
    last, still = None, 0
    for _ in range(100):
        y = page.evaluate("window.scrollY")
        still = still + 1 if y == last else 0
        if still >= 5:
            return y
        last = y
        page.wait_for_timeout(100)
    raise RuntimeError("the page never stopped scrolling")


def check_edit_horizon(app, width, how):
    """After the scroll settles, the heading and Clear horizon are visible and nothing fixed covers them."""
    page = app.p
    app.fresh()
    page.evaluate("window.scrollTo({top: 0, behavior: 'instant'})")
    settled_scroll_y(page)
    link = page.get_by_role("link", name="Edit horizon")
    if how == "mouse":
        link.scroll_into_view_if_needed()
        settled_scroll_y(page)
        b = link.bounding_box()
        page.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
        page.mouse.down()
        page.wait_for_timeout(90)
        page.mouse.up()
    else:
        link.focus()
        page.keyboard.press("Enter")
    settled_scroll_y(page)
    res = page.evaluate("""() => {
        const out = {};
        const targets = { heading: document.getElementById('horizon-heading'),
                          clear: [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Clear horizon') };
        for (const [name, el] of Object.entries(targets)) {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.top + 2);
          out[name] = { top: Math.round(r.top), bottom: Math.round(r.bottom), onscreen: r.top >= 0 && r.bottom <= innerHeight,
                        free: hit !== null && (el === hit || el.contains(hit) || hit.contains(el)) && !hit.closest('nav, header') };
        }
        return out; }""")
    ok = all(v["onscreen"] and v["free"] for v in res.values())
    record(f"{width}px: Edit horizon by {how}: heading and Clear horizon are not under the nav (hit test, scroll settled)", ok, json.dumps(res))


def run_widths(pw, url):
    """No message line is clipped at any width, for the bad texts that gave the longest messages."""
    cases = [("Minimum altitude", "min-alt", ["100", "", "1.5"]), ("Start", "arc-start", ["500", "", "1.5", "320"]),
             ("End", "arc-end", ["500", "", "1.5", "120"]), ("Height", "arc-height", ["95", "", "1.5"])]
    for width in [1280, 1024, 768, 640, 390, 360]:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": 900})
        app = Planner(page, url)
        bad = []
        for name, field, texts in cases:
            for text in texts:
                app.fresh()
                app.type(field, text)
                bad += [f"{name} {text!r}: {m}" for m in app.clipped()]
        record(f"{width}px: no message line is clipped (scrollHeight <= clientHeight)", not bad, "; ".join(bad))
        for how in ("mouse", "Enter"):
            check_edit_horizon(app, width, how)
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
            run_viewport(pw, url, "1280px", 1280, 900, shots)
            run_viewport(pw, url, "768px", 768, 1024, shots)
            run_viewport(pw, url, "390px", 390, 844, shots)
            run_widths(pw, url)
    finally:
        if proc:
            stop_server(proc)
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} of {len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
