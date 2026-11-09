#!/usr/bin/env python3
"""
Phone and tablet fit proof for /planner at 360, 390, 402, 430, 768, 820, 900, 1024, 1100, 1280, 1440: no text clipped by an overflow
box, the viewport edge or a form control's edge, no overflow container that scrolls sideways, axe clean, card tap targets at least
44 px. Every width runs EVERY train in the profile, with "Show targets that do not fit" on and off, with an itinerary holding six
slots and the Site and Gear panels open. Measured from bounding boxes of every visible text node.

Run: ~/tools/shots/bin/python scripts/planner-phone-check.py [--url http://127.0.0.1:PORT] [--shots DIR]
Without --url it starts its own next dev. Exit 0 only if every check passes.
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

TRAIN_COUNT_JS = "() => [...document.querySelectorAll('#plan-train option')].map(o => o.text)"


def prepare(page):
    """Six itinerary slots across several trains; Site and Gear panels open."""
    trains = page.evaluate(TRAIN_COUNT_JS)
    for i in range(6):
        page.select_option("#plan-train", index=i % len(trains))
        page.wait_for_timeout(150)
        page.select_option("#it-add-target", index=i % max(1, page.locator("#it-add-target option").count()))
        page.get_by_role("button", name="Add to itinerary").click()
        page.wait_for_timeout(100)
    for sm in page.locator("#gear-heading").locator("xpath=..").locator("summary").all():
        sm.click()
    page.wait_for_timeout(300)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url")
    ap.add_argument("--shots")
    ap.add_argument("--widths", default="360,390,402,430,768,820,900,1024,1100,1280,1440")
    args = ap.parse_args()
    proc = None
    base = args.url
    if not base:
        s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
        proc = subprocess.Popen(["npx", "next", "dev", "-p", str(port)], cwd=REPO, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, start_new_session=True)
        base = f"http://127.0.0.1:{port}"
        for _ in range(240):
            try:
                if urllib.request.urlopen(base + "/planner", timeout=60).status == 200:
                    break
            except Exception:
                time.sleep(1)
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            raise SystemExit("dev server did not start")
    bad = 0
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for w in [int(x) for x in args.widths.split(",")]:
                page = browser.new_page(viewport={"width": w, "height": 900})
                page.goto(base + "/planner", wait_until="networkidle")
                page.wait_for_selector('[data-testid="target-table"], [data-testid="target-cards"]', state="attached")
                page.wait_for_timeout(500)
                prepare(page)
                page.add_script_tag(path=AXE)
                trains = page.evaluate(TRAIN_COUNT_JS)
                for ti, tname in enumerate(trains):
                    for nofit in (False, True):
                        page.select_option("#plan-train", index=ti)
                        page.get_by_label("Show targets that do not fit").set_checked(nofit)
                        page.wait_for_timeout(250)
                        m = page.evaluate(MEASURE_JS)
                        problems = m["clipped"] + m["offscreen"] + m["scrollers"] + m["controls"] + ([{"docScroll": m["docScroll"]}] if m["docScroll"] > m["vw"] else [])
                        if w < 1024:
                            problems += [{"tap": t} for t in page.evaluate(TAP_JS)]
                        ax = page.evaluate("async () => (await axe.run()).violations.map(v => v.id + ': ' + v.nodes.length + ' e.g. ' + v.nodes[0].html.slice(0, 120))")
                        ok = not problems and not ax
                        bad += not ok
                        print(("PASS " if ok else "FAIL ") + f"{w}px | {tname} | no-fit {'on' if nofit else 'off'}: problems={len(problems)} axe={ax}", flush=True)
                        for x in problems[:12]:
                            print("   ", json.dumps(x))
                        if args.shots and ti in (0, len(trains) // 2) and nofit and w in (402, 768, 1024, 1100, 1280):
                            os.makedirs(args.shots, exist_ok=True)
                            box = page.locator('[data-testid="target-cards"]' if w < 1024 else '[data-testid="target-table"]').first
                            box.screenshot(path=f"{args.shots}/targets-{w}-train{ti}.png")
                page.close()
            browser.close()
    finally:
        if proc:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    sys.exit(1 if bad else 0)


main()
