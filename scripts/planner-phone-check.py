#!/usr/bin/env python3
"""
Phone and tablet fit proof for /planner at 360, 375, 390, 402, 430, 768, 820, 1024, 1100, 1280, 1440: no text clipped by an overflow
box, the viewport edge or a form control's edge, no overflow container that scrolls sideways, axe clean, card tap targets at least
44 px, every tap target of the itinerary section at least 44 px (no exemptions), every chart text at least 12 px on screen.
Every width runs EVERY train in the profile, with itineraries of 1, 3, 6 and 8 slots, a start time before, inside and after the
night, the night graph's numbers table closed and open, the Site and Gear panels open; "Show targets that do not fit" on and
off for the start inside the night. Measured from bounding boxes of every visible text node.

Run: ~/tools/shots/bin/python scripts/planner-phone-check.py [--url http://127.0.0.1:PORT | --start] [--shots DIR]
  [--widths 360,402] [--counts 1,3,6,8] [--starts before,inside,after] [--horizon-only]
--horizon-only checks just the horizon editor with 1 to 4 zones (add, edit, remove): text 12 px or more, taps 44 px, no sideways
scroll, axe clean, and the page above the editor does not move when a zone is added or removed.
Without --url it starts its own next dev; with --start it runs `next start` (needs a build). Exit 0 only if every check passes.
"""
import argparse, os, signal, socket, subprocess, sys, time, urllib.request, json
from playwright.sync_api import sync_playwright

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
AXE = os.path.join(REPO, "node_modules/axe-core/axe.min.js")

MEASURE_JS = """() => {
  const vw = document.documentElement.clientWidth;
  const out = {vw, docScroll: document.documentElement.scrollWidth, scrollers: [], clipped: [], offscreen: []};
  const visible = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const srOnly = (el) => !!el.closest('.sr-only');
  const desc = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + String(el.className).slice(0, 40);
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || srOnly(el)) continue;
    const s = getComputedStyle(el);
    if ((s.overflowX !== 'visible' || s.overflowY !== 'visible') && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
      out.scrollers.push({el: desc(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflowX: s.overflowX});
  }
  out.controls = [];
  for (const el of document.querySelectorAll('input[type=text], textarea, select')) {
    if (!visible(el) || srOnly(el)) continue;
    if (el.tagName === 'INPUT' && el.scrollWidth > el.clientWidth + 1) out.controls.push({el: desc(el), id: el.id, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth});
    if (el.tagName === 'TEXTAREA' && el.scrollHeight > el.clientHeight + 1) out.controls.push({el: desc(el), id: el.id, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight});
    if (el.tagName === 'SELECT' && getComputedStyle(el).opacity !== '0') {
      // A select that shows its own text must have room for the chosen option.
      const cs = getComputedStyle(el), c = document.createElement('canvas').getContext('2d'); c.font = cs.font;
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 24;
      const w = c.measureText(el.selectedOptions[0]?.text ?? '').width;
      if (w > room) out.controls.push({el: desc(el), id: el.id, text: w, room});
    }
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim()) continue;
    const p = n.parentElement;
    if (!p || !visible(p) || srOnly(p) || p.closest('script,style,noscript')) continue;
    let hiddenAncestor = false;
    for (let a = p; a; a = a.parentElement) if (!visible(a)) { hiddenAncestor = true; break; }
    if (hiddenAncestor) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const sr = getComputedStyle(p); if (sr.position === 'absolute' && r.width <= 1) continue;
    if (r.left < -0.5 || r.right > vw + 0.5) out.offscreen.push({el: desc(p), text: n.textContent.trim().slice(0, 40), left: r.left, right: r.right});
    for (let a = p; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const b = a.getBoundingClientRect();
        if (r.right > b.right + 0.5 || r.left < b.left - 0.5 || r.bottom > b.bottom + 0.5 || r.top < b.top - 0.5)
          out.clipped.push({el: desc(p), by: desc(a), text: n.textContent.trim().slice(0, 40)});
      }
    }
  }
  return out;
}"""


TAP_JS = """() => {
  const bad = [];
  for (const li of document.querySelectorAll('[data-testid=target-cards] > li')) {
    for (const el of li.querySelectorAll('button, label:has(input[type=checkbox])')) {
      const r = el.getBoundingClientRect();
      if (r.height < 43.5 || (el.tagName === 'LABEL' && r.width < 43.5)) bad.push({el: el.tagName + ':' + el.textContent.trim().slice(0, 24), w: r.width, h: r.height});
    }
  }
  return bad;
}"""

# The itinerary section: every tap target 44 px tall, chart text at least 12 px on screen, every chart label inside its chart.
TIMELINE_JS = """() => {
  const bad = [];
  const sec = document.querySelector('#itinerary-heading')?.closest('section');
  if (!sec) return [{missing: 'itinerary section'}];
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  for (const el of sec.querySelectorAll('button, select, input, textarea, summary, a[href]')) {
    if (!vis(el) || el.closest('[aria-hidden=true]')) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 43.5) bad.push({tap: (el.textContent || el.id || el.tagName).trim().slice(0, 28), h: r.height});
  }
  // The start box: 16 px, or iOS zooms the page in when it is focused.
  const startBox = sec.querySelector('#it-start');
  if (startBox && parseFloat(getComputedStyle(startBox).fontSize) < 16) bad.push({startBoxFont: getComputedStyle(startBox).fontSize});
  const svg = sec.querySelector('[data-testid=night-timeline] svg');
  if (!svg) return bad.concat([{missing: 'night graph'}]);
  if (svg.tabIndex !== 0) bad.push({svg: 'not focusable'});
  const d = sec.querySelector('[data-testid=timeline-numbers]');
  if (d && d.open) bad.push({table: 'open on load'});
  return bad;
}"""

# The diagrams on the page (the night graph, each target's altitude chart and the horizon compass in the Site panel): text at least
# 12 px effective, inside its svg. The compass must be on the page, or the check fails.
CHART_JS = """() => {
  const bad = [];
  let compass = 0;
  for (const svg of document.querySelectorAll('svg[role=img]')) {
    const name = svg.querySelector('title')?.textContent || '';
    if (!/^(Altitude|Horizon, seen from above)/.test(name)) continue;
    if (/^Horizon/.test(name) && svg.getBoundingClientRect().width > 0) compass++;
    const sb = svg.getBoundingClientRect();
    if (sb.width === 0) continue;
    const scale = sb.width / svg.viewBox.baseVal.width;
    for (const t of svg.querySelectorAll('text')) {
      const fs = parseFloat(getComputedStyle(t).fontSize) * scale;
      if (fs < 11.95) bad.push({font: t.textContent.slice(0, 20), px: Math.round(fs * 10) / 10, svg: svg.querySelector('title')?.textContent.slice(0, 30)});
      const r = t.getBoundingClientRect();
      if (r.width && (r.left < sb.left - 0.5 || r.right > sb.right + 0.5 || r.top < sb.top - 0.5 || r.bottom > sb.bottom + 0.5)) bad.push({outside: t.textContent.slice(0, 20)});
    }
  }
  if (compass === 0) bad.push({missing: 'horizon compass'});
  return bad;
}"""

# The horizon editor: every control 44 px tall, every piece of text 12 px or more, the compass inside its box.
HORIZON_JS = """() => {
  const bad = [];
  const sec = document.querySelector('#horizon');
  if (!sec) return [{missing: 'horizon editor'}];
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  for (const el of sec.querySelectorAll('button, input, summary, a[href]')) {
    if (!vis(el) || el.closest('[aria-hidden=true]')) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 43.5) bad.push({tap: (el.textContent || el.id || el.tagName).trim().slice(0, 28), h: r.height});
  }
  const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const p = n.parentElement;
    if (!n.textContent.trim() || !p || p.closest('svg,.sr-only') || !vis(p)) continue;
    const fs = parseFloat(getComputedStyle(p).fontSize);
    if (fs < 11.95) bad.push({font: n.textContent.trim().slice(0, 24), px: fs});
  }
  return bad;
}"""

# Document-space top of things above the horizon editor, for the "nothing above moves" check.
ABOVE_JS = """() => ['#plan-site', '#itinerary-heading', '#horizon'].map((q) => { const el = document.querySelector(q); return el ? Math.round((el.getBoundingClientRect().top + scrollY) * 10) / 10 : null; })"""

TRAIN_COUNT_JS = "() => [...document.querySelectorAll('#plan-train option')].map(o => o.text)"


def prepare(page, count=6):
    """`count` itinerary slots across several trains; Site and Gear panels open."""
    trains = page.evaluate(TRAIN_COUNT_JS)
    for i in range(count):
        page.select_option("#plan-train", index=i % len(trains))
        page.wait_for_timeout(150)
        add = page.get_by_role("button", name="Add to itinerary")
        if add.is_disabled():  # a smart scope plans its own exposures: fall back to the first (optical) train
            page.select_option("#plan-train", index=0)
            page.wait_for_timeout(150)
        page.select_option("#it-add-target", index=i % max(1, page.locator("#it-add-target option").count()))
        add.click()
        page.wait_for_timeout(100)
    for sm in page.locator("#gear-heading").locator("xpath=..").locator("summary").all():
        sm.click()
    page.wait_for_timeout(300)


def horizon_check(page, w, shots=None):
    """Adds zones one at a time to 4, then removes them; returns (label, problems) for each step."""
    results = []
    tops = page.evaluate(ABOVE_JS)

    def step(label, hidden=0):
        page.wait_for_timeout(200)
        m = page.evaluate(MEASURE_JS)
        problems = m["clipped"] + m["offscreen"] + m["scrollers"] + m["controls"] + ([{"docScroll": m["docScroll"]}] if m["docScroll"] > m["vw"] else [])
        problems += page.evaluate(HORIZON_JS) + page.evaluate(CHART_JS)
        zones = page.locator("#horizon [role=group]").count()
        paths = page.locator("#horizon svg[role=img] path").count()
        if paths != zones - hidden:
            problems.append({"compass paths": paths, "zones": zones})
        now = page.evaluate(ABOVE_JS)
        if now != tops:
            problems.append({"above the editor moved": {"before": tops, "after": now}})
        ax = page.evaluate("async () => (await axe.run('#horizon')).violations.map(v => v.id + ': ' + v.nodes.length + ' e.g. ' + v.nodes[0].html.slice(0, 120))")
        results.append((f"{w}px | horizon | {label} | {zones} zones", problems, ax))

    step("sample")
    for n in (2, 3, 4):
        page.get_by_role("button", name="Add another zone").click()
        step(f"added zone {n}")
        if shots and n == 4:
            os.makedirs(shots, exist_ok=True)
            page.locator("#horizon").screenshot(path=f"{shots}/horizon-4-zones-{w}.png")
    if not page.get_by_role("button", name="Add another zone").is_disabled():
        results.append((f"{w}px | horizon | fifth zone", [{"add button still enabled at 4 zones": True}], []))
    # An error message in zone 4 (the longest text a zone can show) must not move anything either.
    page.locator("#arc-start-4-number").fill("130")
    step("overlap message in zone 4", hidden=1)
    page.locator("#arc-start-4-number").fill("90")
    for n in (4, 3, 2):
        page.get_by_role("button", name=f"Remove zone {n}").click()
        step(f"removed zone {n}")
    return results


STARTS = {"before": "15:00", "inside": "23:00", "after": "11:00"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url")
    ap.add_argument("--start", action="store_true", help="run `next start` (needs a build) instead of next dev")
    ap.add_argument("--shots")
    ap.add_argument("--widths", default="360,375,390,402,430,768,820,1024,1100,1280,1440")
    ap.add_argument("--counts", default="1,3,6,8")
    ap.add_argument("--starts", default="before,inside,after")
    ap.add_argument("--horizon-only", action="store_true")
    args = ap.parse_args()
    proc = None
    base = args.url
    if not base:
        s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
        cmd = ["npx", "next", "start" if args.start else "dev", "-p", str(port)]
        proc = subprocess.Popen(cmd, cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        base = f"http://127.0.0.1:{port}"
        for _ in range(240):
            try:
                if urllib.request.urlopen(base + "/planner", timeout=60).status == 200:
                    break
            except Exception:
                time.sleep(1)
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            raise SystemExit("server did not start")
    bad = 0
    total = 0
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            if args.horizon_only:
                for w in [int(x) for x in args.widths.split(",")]:
                    ctx = browser.new_context(viewport={"width": w, "height": 900}, has_touch=w < 1024, is_mobile=w < 1024, device_scale_factor=3 if w < 1024 else 1)
                    page = ctx.new_page()
                    page.goto(base + "/planner", wait_until="networkidle")
                    page.wait_for_selector("#horizon", state="attached")
                    page.wait_for_timeout(500)
                    page.add_script_tag(path=AXE)
                    for label, problems, ax in horizon_check(page, w, args.shots):
                        ok = not problems and not ax
                        bad += not ok
                        total += 1
                        print(("PASS " if ok else "FAIL ") + f"{label}: problems={len(problems)} axe={ax}", flush=True)
                        for x in problems[:12]:
                            print("   ", json.dumps(x))
                    ctx.close()
                browser.close()
                print(f"{total - bad} PASS, {bad} FAIL")
                sys.exit(1 if bad else 0)
            for w, count in [(int(x), int(c)) for x in args.widths.split(",") for c in args.counts.split(",")]:
                ctx = browser.new_context(viewport={"width": w, "height": 900}, has_touch=w < 1024, is_mobile=w < 1024, device_scale_factor=3 if w < 1024 else 1)
                page = ctx.new_page()
                page.goto(base + "/planner", wait_until="networkidle")
                page.wait_for_selector('[data-testid="target-table"], [data-testid="target-cards"]', state="attached")
                page.wait_for_timeout(500)
                prepare(page, count)
                page.add_script_tag(path=AXE)
                trains = page.evaluate(TRAIN_COUNT_JS)
                for start in args.starts.split(","):
                    page.get_by_label('Imaging can start at').fill(STARTS[start])
                    page.wait_for_timeout(200)
                    for ti, tname in enumerate(trains):
                        for nofit in ((False, True) if start == "inside" else (False,)):
                            page.select_option("#plan-train", index=ti)
                            page.get_by_label("Show targets that do not fit").set_checked(nofit)
                            page.wait_for_timeout(250)
                            m = page.evaluate(MEASURE_JS)
                            problems = m["clipped"] + m["offscreen"] + m["scrollers"] + m["controls"] + ([{"docScroll": m["docScroll"]}] if m["docScroll"] > m["vw"] else [])
                            if w < 1024:
                                problems += [{"tap": t} for t in page.evaluate(TAP_JS)]
                            problems += page.evaluate(TIMELINE_JS) + page.evaluate(CHART_JS)
                            ax = []
                            if ti == 0 and not nofit:
                                ax += page.evaluate("async () => (await axe.run()).violations.map(v => 'closed ' + v.id + ': ' + v.nodes.length + ' e.g. ' + v.nodes[0].html.slice(0, 120))")
                            # The graph's numbers table open: still no sideways scroll or clipped text, axe clean.
                            page.locator('[data-testid=timeline-numbers] summary').click()
                            m2 = page.evaluate(MEASURE_JS)
                            problems += m2["clipped"] + m2["offscreen"] + m2["scrollers"] + ([{"docScroll-table-open": m2["docScroll"]}] if m2["docScroll"] > m2["vw"] else [])
                            ax += page.evaluate("async () => (await axe.run()).violations.map(v => 'open ' + v.id + ': ' + v.nodes.length + ' e.g. ' + v.nodes[0].html.slice(0, 120))")
                            page.locator('[data-testid=timeline-numbers] summary').click()
                            ok = not problems and not ax
                            bad += not ok
                            total += 1
                            print(("PASS " if ok else "FAIL ") + f"{w}px | {count} slots | start {start} {STARTS[start]} | {tname} | no-fit {'on' if nofit else 'off'}: problems={len(problems)} axe={ax}", flush=True)
                            for x in problems[:12]:
                                print("   ", json.dumps(x))
                            if args.shots and count == 3 and ti == 0 and not nofit and start == "inside" and w in (402, 1280):
                                os.makedirs(args.shots, exist_ok=True)
                                page.locator('#itinerary-heading').locator("xpath=..").screenshot(path=f"{args.shots}/itinerary-{w}.png")
                                page.locator('[data-testid=night-timeline]').screenshot(path=f"{args.shots}/timeline-{w}.png")
                                page.locator('svg[role=img]').last.locator("xpath=..").screenshot(path=f"{args.shots}/altitude-chart-{w}.png")
                            if args.shots and count == 3 and ti == 0 and start == "after" and w in (402, 1280):
                                os.makedirs(args.shots, exist_ok=True)
                                page.locator('[data-testid=night-timeline]').screenshot(path=f"{args.shots}/timeline-after-night-{w}.png")
                ctx.close()
            browser.close()
    finally:
        if proc:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    print(f"{total - bad} PASS, {bad} FAIL")
    sys.exit(1 if bad else 0)


main()
