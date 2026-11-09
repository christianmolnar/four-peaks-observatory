#!/usr/bin/env python3
"""
Responsiveness proof for the itinerary order search on /planner, at 402 px touch: with 8 slots, how long a start-time change,
a Bortle change and a keystroke in a note block the page (time to the next frame), the longest main-thread task, and how long the
advice takes to settle ("Looking for a better order..." gone). Two 8-slot sets: the sample site (2026-12-21, Bortle 3) and
Quito (2027-03-01). Each at CPU 1x and 4x. Prints a table; exit 1 if a block is over --limit ms (default 150) at 4x.

Run: ~/tools/shots/bin/python scripts/planner-search-timing.py [--url http://127.0.0.1:PORT | --start] [--limit 150]
Without --url it starts `next start` (needs a build).
"""
import argparse, json, os, signal, socket, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SAMPLE = json.load(open(os.path.join(REPO, "src/planner/data/sample-profile.json")))
QUITO = {"id": "quito", "name": "Quito", "latitude": -0.18, "longitude": -78.47, "timeZone": "America/Guayaquil", "blockedArc": {"startAz": 200, "endAz": 260, "heightDeg": 30}}


def slot(i, target, train, flt, mode):
    return {"id": f"s{i}", "targetId": target, "trainId": train, "filterId": flt, "mode": mode, "note": ""}


SETS = {
    "sample site 2026-12-21": ("2026-12-21", None, "3", [
        ("m82", "deep-c11-2600", "zwo-duo-band", "deep"), ("planet-moon", "deep-c11-2600", "zwo-duo-band", "deep"),
        ("planet-mars", "planet-c11-676", "apertura-moon-skyglow", "deep"), ("m42", "wide-c11-hyperstar-2600", "idas-lps-p3", "balanced"),
        ("markarians-chain", "deep-c11-reducer-533", "optolong-ha-7nm", "deep"), ("planet-mars", "deep-c11-reducer-2600", "apertura-moon-skyglow", "deep"),
        ("ngc2264", "deep-c11-reducer-2600", "astronomik-cls-ccd", "deep"), ("ic410", "deep-c11-2600", "astronomik-cls-ccd", "deep")]),
    "Quito 2027-03-01": ("2027-03-01", QUITO, "8", [
        ("leo-triplet", "wide-c11-hyperstar-2600", "optolong-ha-7nm", "quick"), ("planet-mars", "planet-c11-676", "idas-lps-p3", "balanced"),
        ("planet-moon", "planet-c11-676", "idas-lps-p3", "balanced"), ("planet-jupiter", "planet-c11-676", "baader-uvir-cut", "quick"),
        ("ngc2264", "wide-c11-hyperstar-2600", None, "balanced"), ("m82", "wide-c11-hyperstar-2600", None, "balanced"),
        ("m81", "deep-c11-reducer-533", "ice-2in", "quick"), ("m101", "deep-c11-reducer-533", "optolong-lextreme", "balanced")]),
}

# Each action returns the ms from the change to the next painted frame, and the longest main-thread task meanwhile.
ACT = """([kind, v]) => new Promise(res => {
  let longest = 0;
  const po = new PerformanceObserver(l => l.getEntries().forEach(e => { longest = Math.max(longest, e.duration); }));
  po.observe({entryTypes: ['longtask']});
  const t0 = performance.now();
  if (kind === 'start') { const el = document.getElementById('it-start'); el.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', {bubbles: true})); }
  if (kind === 'bortle') { const el = document.getElementById('it-bortle'); el.value = v; el.dispatchEvent(new Event('change', {bubbles: true})); }
  if (kind === 'note') { const el = document.querySelector('[id^=it-note-]'); el.focus(); Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, el.value + 'x'); el.dispatchEvent(new Event('input', {bubbles: true})); }
  requestAnimationFrame(() => setTimeout(() => { const ms = Math.round(performance.now() - t0); setTimeout(() => { po.disconnect(); res([ms, Math.round(longest)]); }, 60); }, 0));
})"""
SETTLE = """() => new Promise(res => { const t0 = performance.now(); const tick = () => {
  const box = document.querySelector('[data-testid=order-advice]');
  if (box && !box.querySelector('[data-testid=order-advice-searching]')) res(Math.round(performance.now() - t0)); else setTimeout(tick, 20); }; tick(); })"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url")
    ap.add_argument("--limit", type=int, default=150)
    args = ap.parse_args()
    proc, base = None, args.url
    if not base:
        s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
        proc = subprocess.Popen(["npx", "next", "start", "-p", str(port)], cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        base = f"http://127.0.0.1:{port}"
        for _ in range(120):
            try:
                urllib.request.urlopen(base + "/planner", timeout=10); break
            except Exception:
                time.sleep(1)
    worst = 0
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={"width": 402, "height": 874}, device_scale_factor=3, is_mobile=True, has_touch=True)
            page = ctx.new_page()
            page.goto(base + "/planner", wait_until="networkidle")
            cdp = ctx.new_cdp_session(page)
            print(f"{'set':26} {'cpu':>3}  {'start change (block/longest task)':34} {'bortle change':16} {'note key':14} settle ms")
            for name, (date, site, bortle, slots) in SETS.items():
                prof = json.loads(json.dumps(SAMPLE))
                if site:
                    prof["sites"] = [site]
                    for pl in prof["plans"]:
                        pl["siteId"] = site["id"]
                items = [slot(i, *s) for i, s in enumerate(slots)]
                page.evaluate("([a, b, c, d]) => { localStorage.setItem(a, b); localStorage.setItem(c, d); }", ["fpo-planner-profile-v1", json.dumps(prof), "fpo-planner-itinerary-v1", json.dumps({"version": 2, "items": items, "startTime": None})])
                page.reload(wait_until="networkidle")
                page.fill("#plan-date", date)
                page.wait_for_timeout(800)
                for rate in (1, 4):
                    cdp.send("Emulation.setCPUThrottlingRate", {"rate": rate})
                    page.wait_for_timeout(300)
                    page.evaluate(SETTLE)
                    starts, bort, notes, settle = [], [], [], []
                    clocks = page.evaluate("() => document.getElementById('it-start').value").split(":")
                    base_min = int(clocks[0]) * 60 + int(clocks[1])
                    for k in range(4):
                        t = base_min + 25 * (k + 1)
                        starts.append(page.evaluate(ACT, ["start", f"{(t // 60) % 24:02d}:{t % 60:02d}"]))
                        settle.append(page.evaluate(SETTLE))
                    for v in ("4", "6", "3"):
                        bort.append(page.evaluate(ACT, ["bortle", v]))
                        settle.append(page.evaluate(SETTLE))
                    for _ in range(3):
                        notes.append(page.evaluate(ACT, ["note", None]))
                    page.get_by_role("button", name="Use night start").click()
                    page.evaluate(SETTLE)
                    mx = lambda rows: max(r[0] for r in rows)
                    ml = lambda rows: max(r[1] for r in rows)
                    if rate == 4:
                        worst = max(worst, mx(starts + bort + notes))
                    print(f"{name:26} {rate:>2}x  start {mx(starts):4}/{ml(starts):4} ms{'':14} bortle {mx(bort):4}/{ml(bort):4}  note {mx(notes):4}/{ml(notes):4}  settle max {max(settle)}", flush=True)
                cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
            b.close()
    finally:
        if proc:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    print(f"worst block at 4x: {worst} ms (limit {args.limit})")
    sys.exit(1 if worst > args.limit else 0)


main()
