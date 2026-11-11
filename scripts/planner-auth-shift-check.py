#!/usr/bin/env python3
"""
Layout-shift proof for the /planner sign-in control: the h1 top must not move when the session answer arrives, in three states
(signed out, signed in with a 39-character login, sign-in not configured), at 360 and 402 px. The session route is mocked in the
browser and held back until the first paint was measured, so "before" is the prerendered HTML and "after" is the answered state.
Also prints the control height per state and the layout-shift score (CLS).

Run: ~/tools/shots/bin/python scripts/planner-auth-shift-check.py --url http://127.0.0.1:PORT [--widths 360,402]
Exit 0 only if every h1 top is identical before and after, and CLS < 0.001.
"""
import argparse, json, sys
from playwright.sync_api import sync_playwright

STATES = {
    "signed-out": {"signedIn": False, "configured": True},
    "signed-in-39": {"signedIn": True, "owner": False, "login": "a" * 19 + "-" + "b" * 19},
    "disabled": {"signedIn": False, "configured": False},
}
CLS_JS = """(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({type: 'layout-shift', buffered: true}); })();"""
H1_JS = "() => document.querySelector('h1').getBoundingClientRect().top + window.scrollY"
CTL_JS = "() => document.querySelector('[data-testid=auth-control]').getBoundingClientRect().height"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--widths", default="360,402")
    args = ap.parse_args()
    bad = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for w in [int(x) for x in args.widths.split(",")]:
            for name, body in STATES.items():
                page = browser.new_context(viewport={"width": w, "height": 900}).new_page()
                release = {"go": False}

                def handle(route):
                    while not release["go"]:
                        page.wait_for_timeout(20)
                    route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

                page.route("**/api/planner/session", handle)
                page.add_init_script(CLS_JS)
                page.goto(args.url + "/planner", wait_until="domcontentloaded")
                page.wait_for_selector("h1")
                page.wait_for_timeout(1500)
                before, h_before = page.evaluate(H1_JS), page.evaluate(CTL_JS)
                release["go"] = True
                page.wait_for_timeout(1500)
                after, h_after = page.evaluate(H1_JS), page.evaluate(CTL_JS)
                cls = page.evaluate("window.__cls")
                ok = before == after and h_before == 44 and h_after == 44 and cls < 0.001
                bad += not ok
                print(f"{'PASS' if ok else 'FAIL'} w={w} {name}: h1 top {before} -> {after} (shift {after - before} px), control {h_before} -> {h_after} px, CLS {cls:.4f}")
                page.context.close()
        browser.close()
    sys.exit(1 if bad else 0)


main()
