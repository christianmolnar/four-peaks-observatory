#!/usr/bin/env python3
"""
Phone and tablet fit proof for /planner at 360, 390, 402, 430, 768, 820, 900, 1024, 1280: no text clipped by an overflow box or the
viewport edge, no overflow container that scrolls sideways, axe clean. Measured from bounding boxes of every visible text node.

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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url")
    ap.add_argument("--shots")
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
            for w in (360, 390, 402, 430, 768, 820, 900, 1024, 1280):
                page = browser.new_page(viewport={"width": w, "height": 900})
                page.goto(base + "/planner", wait_until="networkidle")
                page.wait_for_selector('[data-testid="target-table"], [data-testid="target-cards"]', state="attached")
                page.wait_for_timeout(500)
                m = page.evaluate(MEASURE_JS)
                problems = m["clipped"] + m["offscreen"] + m["scrollers"] + ([{"docScroll": m["docScroll"]}] if m["docScroll"] > m["vw"] else [])
                page.add_script_tag(path=AXE)
                ax = page.evaluate("async () => (await axe.run()).violations.map(v => v.id + ': ' + v.nodes.length)")
                ok = not problems and not ax
                bad += not ok
                print(("PASS " if ok else "FAIL ") + f"{w}px: problems={len(problems)} axe={ax}", flush=True)
                for x in problems[:12]:
                    print("   ", json.dumps(x))
                if args.shots and w in (402, 768, 1024, 1280):
                    os.makedirs(args.shots, exist_ok=True)
                    box = page.locator('[data-testid="target-cards"]' if w < 1024 else '[data-testid="target-table"]').first
                    if w == 402:
                        h = page.evaluate("""() => { const li = [...document.querySelectorAll('[data-testid=target-cards] > li')].slice(0,3);
                          const a = li[0].getBoundingClientRect(), b = li[li.length-1].getBoundingClientRect(); return {y: a.top + scrollY, h: b.bottom - a.top}; }""")
                        page.screenshot(path=f"{args.shots}/cards-402.png", full_page=True,
                                        clip={"x": 0, "y": max(h["y"] - 20, 0), "width": w, "height": h["h"] + 40})
                    elif w == 768:
                        box.screenshot(path=f"{args.shots}/cards-{w}.png")
                    else:
                        box.screenshot(path=f"{args.shots}/table-{w}.png")
                page.close()
            browser.close()
    finally:
        if proc:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    sys.exit(1 if bad else 0)


main()
