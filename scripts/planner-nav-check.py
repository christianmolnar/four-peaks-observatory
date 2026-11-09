#!/usr/bin/env python3
"""
Nav-fit proof: at 768, 790 and 800 px no desktop nav link is clipped on / and /planner.
Measured from each link's bounding box (a clipped row keeps scrollWidth equal to the viewport, so scrollWidth proves nothing).

Run: ~/tools/shots/bin/python scripts/planner-nav-check.py [--url http://127.0.0.1:PORT]
Without --url it starts its own next dev on a free port and stops it after. Exit 0 only if no link is clipped.
"""
import argparse
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LINKS_JS = """() => [...document.querySelectorAll('nav ul.flex a')].map(a => {
  const r = a.getBoundingClientRect();
  return {text: a.textContent.trim(), left: r.left, right: r.right, top: r.top};
})"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url")
    args = ap.parse_args()
    proc = None
    base = args.url
    if not base:
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        proc = subprocess.Popen(["npx", "next", "dev", "-p", str(port)], cwd=REPO, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, start_new_session=True)
        base = f"http://127.0.0.1:{port}"
        for _ in range(240):
            try:
                if urllib.request.urlopen(base + "/planner", timeout=10).status == 200:
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
            for path in ("/", "/planner"):
                for w in (768, 790, 800):
                    page = browser.new_page(viewport={"width": w, "height": 900})
                    page.goto(base + path, wait_until="networkidle")
                    links = page.evaluate(LINKS_JS)
                    clipped = [l["text"] for l in links if l["left"] < 0 or l["right"] > w]
                    rows = len({round(l["top"]) for l in links})
                    ok = len(links) > 0 and not clipped
                    bad += not ok
                    print(("PASS " if ok else "FAIL ") + f"{path} at {w}px: {len(links)} links, {rows} row(s), clipped={clipped}", flush=True)
                    page.close()
            browser.close()
    finally:
        if proc:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    sys.exit(1 if bad else 0)


main()
