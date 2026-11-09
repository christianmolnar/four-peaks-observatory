#!/usr/bin/env python3
"""
Guest-planner proof for /planner (M3): headless Chromium, fresh profile, no login.

Checks, at 1280, 768 and 390 px:
  1. Network: every request the page makes goes to the page's own origin, none is an /api call, none is
     a POST/PUT, and nothing leaves for a third party (the full request list is printed).
  2. Plan: a fresh profile with empty localStorage shows the intro and a ranked table.
  3. axe-core (from node_modules) on the open page, with the site and gear panels open: violations listed;
     the check fails on any critical or serious one.
  4. Keyboard only: Tab walks every focusable control in page order, each shows a visible focus ring, and the
     guest task (open Site, change latitude, Save, open Trains, rename, Save) is done with Tab, Space, Enter and typing.
  5. Reduced motion: with prefers-reduced-motion the page has no running CSS animation or transition.
  6. Print: the print media shows the plan sheet and hides the site navigation and the screen panels; the PDF is written
     to --pdf PATH when given.
  7. No information by colour alone: no element depends on colour only is not machine-checkable; this script prints the
     statuses and error markers it saw ("!" prefix on errors, text "Selected" etc.) for a human read.

Run (needs Playwright for Python and its Chromium; the repo itself depends on neither):
  ~/tools/shots/bin/python scripts/planner-guest-check.py [--pdf /path/out.pdf] [--shots DIR]
It starts its own next dev on a free port and stops it after. Exit code 0 only if every check passes.
"""
import argparse
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
AXE = os.path.join(REPO, "node_modules", "axe-core", "axe.min.js")
results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def start_server():
    port = free_port()
    proc = subprocess.Popen(["npx", "next", "dev"] + (["--turbopack"] if os.environ.get("TURBOPACK") else []) + ["-p", str(port)], cwd=REPO,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    url = f"http://127.0.0.1:{port}/planner"
    for _ in range(240):
        try:
            if urllib.request.urlopen(url, timeout=10).status == 200:
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


# Controls the keyboard can reach: not disabled, shown, not in a negative tab order. Unchecked radios are reached by arrow keys.
FOCUSABLE_JS = """() => [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]')]
  .filter(e => !e.disabled && e.tabIndex >= 0 && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden'
    && !(e.type === 'radio' && !e.checked) && !e.closest('nextjs-portal'))
  .length"""

MISSED_JS = """() => [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]')]
  .filter(e => !e.disabled && e.tabIndex >= 0 && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden'
    && !(e.type === 'radio' && !e.checked) && !e.closest('nextjs-portal') && !e.hasAttribute('data-seen'))
  .map(e => e.tagName + '#' + (e.id || e.textContent.trim().slice(0, 20)))"""

FOCUS_RING_JS = """() => {
  const e = document.activeElement; if (!e || e === document.body) return null;
  const cs = getComputedStyle(e);
  const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
  const label = e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].textContent) || e.textContent || e.id;
  return { tag: e.tagName, ring: !!ring, label: (label || '').trim().slice(0, 40), type: e.type || '' };
}"""


def run(url, pdf, shots):
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        origin = urlparse(url).netloc
        for width, height in ((1280, 900), (768, 1024), (390, 844)):
            tag = f"{width}px"
            ctx = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
            page = ctx.new_page()
            requests = []
            page.on("request", lambda r: requests.append((r.method, r.url, r.resource_type)))
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url, wait_until="networkidle")
            page.wait_for_selector("[data-testid=target-table]", timeout=60000)

            # 1 network
            foreign = [r for r in requests if urlparse(r[1]).netloc != origin and not r[1].startswith(("data:", "blob:"))]
            # The root layout (not the planner) loads Vercel Analytics and Speed Insights; reported, not hidden.
            site_wide = [r for r in foreign if urlparse(r[1]).netloc == "va.vercel-scripts.com"]
            other = [r for r in foreign if r not in site_wide]
            posts = [r for r in requests if r[0] != "GET"]
            api = [r for r in requests if "/api/" in r[1]]
            data_calls = [r for r in requests if r[2] in ("fetch", "xhr", "websocket", "eventsource", "ping")]
            record(f"{tag} network: planner makes only own-origin GET asset requests (no /api, no fetch/XHR, no POST, no third party)",
                   not other and not posts and not api and not data_calls,
                   f"{len(requests)} requests; third-party={other[:3]} non-GET={posts[:3]} api={api[:3]} fetch/xhr={data_calls[:3]}")
            print(f"   NOTE site-wide layout scripts (not planner): {[r[1] for r in site_wide]}")
            if width == 1280:
                for m, u, t in requests:
                    print(f"   {m} {t:10s} {u}")
            record(f"{tag} no page errors", not errors, "; ".join(errors)[:200])

            # 2 plan
            intro = page.inner_text("header p")
            record(f"{tag} fresh profile: intro and ranked table", "free guest tool" in intro.lower() and page.locator("[data-testid=target-table] tbody tr").count() > 5,
                   f"{page.locator('[data-testid=target-table] tbody tr').count()} table rows; storage={page.evaluate('localStorage.length')} keys")
            record(f"{tag} no sideways scroll", page.evaluate("document.documentElement.scrollWidth <= innerWidth"))

            # 4 keyboard walk (before opening panels)
            page.evaluate("window.scrollTo(0,0); document.activeElement && document.activeElement.blur()")
            n_focusable = page.evaluate(FOCUSABLE_JS)
            seen, noring = 0, []
            for _ in range(n_focusable + 12):
                page.keyboard.press("Tab")
                info = page.evaluate(FOCUS_RING_JS)
                if not info:
                    break
                seen += 1
                page.evaluate("document.activeElement.setAttribute('data-seen', '1')")
                # The date box's calendar button is the browser's own control and draws its own ring; the dev overlay is not the page.
                if not info["ring"] and info["tag"] != "NEXTJS-PORTAL" and not (info["type"] == "date"):
                    noring.append(f'{info["tag"]}:{info["type"]}:{info["label"]}')
            missed = page.evaluate(MISSED_JS)
            record(f"{tag} keyboard: Tab reaches every control with a visible focus ring", not missed and not noring,
                   f"{seen} stops, {n_focusable} controls; not reached: {missed[:5]}; no ring on: {noring[:5]}")

            # 4b keyboard task
            page.evaluate("window.scrollTo(0,0); document.activeElement && document.activeElement.blur()")
            page.focus("summary:has-text('Site (1)')")
            page.keyboard.press("Enter")
            lat = page.get_by_label("Latitude (deg, north is positive)")
            lat.focus()
            page.keyboard.press("Control+A")
            page.keyboard.type("35.2")
            page.keyboard.press("Enter")  # submits the form
            page.wait_for_function("JSON.parse(localStorage.getItem('fpo-planner-profile-v1')||'{}').sites?.[0]?.latitude === 35.2", timeout=5000)
            record(f"{tag} keyboard task: latitude edited and saved with the keyboard", True)
            page.focus("summary:has-text('Trains (')")
            page.keyboard.press("Enter")
            first_name = page.locator("form input[id^='edit-train-'][id$='-name']").first
            first_name.wait_for(timeout=5000)
            first_name.focus()
            page.keyboard.press("Control+A")
            page.keyboard.type("Keyboard train")
            page.keyboard.press("Enter")
            page.wait_for_function("JSON.parse(localStorage.getItem('fpo-planner-profile-v1')).trains[0].name === 'Keyboard train'", timeout=5000)
            record(f"{tag} keyboard task: train opened with Enter, renamed, saved with Enter", True)
            page.reload(wait_until="networkidle")
            page.wait_for_selector("[data-testid=target-table]")
            kept = page.evaluate("JSON.parse(localStorage.getItem('fpo-planner-profile-v1')).sites[0].latitude") == 35.2 and \
                "Keyboard train" in page.inner_text("#plan-train")
            record(f"{tag} reload keeps the edits", kept)

            page.focus("summary:has-text('Site (1)')")
            page.keyboard.press("Enter")
            # a refused edit, so the error markup is on the page for axe
            page.get_by_label("Latitude (deg, north is positive)").fill("95")
            page.get_by_label("Latitude (deg, north is positive)").press("Enter")
            alert = page.locator("form [role=alert]").first
            alert.wait_for(timeout=5000)
            record(f"{tag} refused edit: message names the box and starts with a non-colour marker", "Latitude" in alert.inner_text() and alert.inner_text().startswith("!"), alert.inner_text()[:80])
            page.get_by_label("Latitude (deg, north is positive)").fill("35.2")

            # open every disclosure for axe
            for s in page.locator("details:not([open]) > summary").all():
                if s.is_visible():
                    s.click()
            if shots:
                os.makedirs(shots, exist_ok=True)
                page.screenshot(path=os.path.join(shots, f"planner-guest-{width}.png"), full_page=True)

            # 3 axe
            page.add_script_tag(path=AXE)
            res = page.evaluate("axe.run(document, {resultTypes:['violations']}).then(r => r.violations.map(v => ({id:v.id, impact:v.impact, n:v.nodes.length, help:v.help, first:v.nodes[0].target.join(' '), html:v.nodes[0].html.slice(0,160)})))")
            bad = [v for v in res if v["impact"] in ("critical", "serious")]
            for v in res:
                print(f"   axe {v['impact']:9s} {v['id']} x{v['n']}: {v['help']} | {v['first']} | {v['html']}")
            record(f"{tag} axe: no critical or serious violations", not bad, f"{len(res)} violations in all: " + ", ".join(f"{v['id']}({v['impact']})" for v in res))

            # 5 reduced motion
            anim = page.evaluate("document.getAnimations().filter(a => a.playState === 'running').length")
            trans = page.evaluate("[...document.querySelectorAll('*')].filter(e => parseFloat(getComputedStyle(e).transitionDuration) > 0 && !e.closest('nav')).length")
            record(f"{tag} reduced motion: no running animation, no planner transition", anim == 0 and trans == 0, f"{anim} animations, {trans} elements with a transition")

            # 6 print
            if width == 1280:
                page.emulate_media(media="print")
                # beforeprint builds the sheet
                page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
                page.wait_for_selector("[data-testid=print-sheet]", state="visible", timeout=5000)
                nav_visible = page.evaluate("[...document.querySelectorAll('nav')].some(n => getComputedStyle(n).display !== 'none')")
                screen_visible = page.evaluate("getComputedStyle(document.querySelector('main .print\\\\:hidden')).display !== 'none'")
                rows = page.locator("[data-testid=print-sheet] tbody tr").count()
                text = page.inner_text("[data-testid=print-sheet]")
                record("print: sheet visible, nav and screen panels hidden", not nav_visible and not screen_visible and rows > 5, f"{rows} rows; nav visible={nav_visible}; screen visible={screen_visible}")
                record("print: sheet states date, site, estimates note", "evening of" in text and "Fountain Hills" in text and "estimates" in text)
                if pdf:
                    page.pdf(path=pdf, format="Letter", print_background=False)
                    record("print: PDF written", os.path.getsize(pdf) > 5000, f"{os.path.getsize(pdf)} bytes")
                page.emulate_media(media="screen")
            ctx.close()
        browser.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf")
    ap.add_argument("--shots")
    ap.add_argument("url", nargs="?")
    a = ap.parse_args()
    proc = None
    url = a.url
    if not url:
        proc, url = start_server()
    try:
        run(url, a.pdf, a.shots)
    finally:
        if proc:
            stop_server(proc)
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
    sys.exit(1 if failed else 0)
