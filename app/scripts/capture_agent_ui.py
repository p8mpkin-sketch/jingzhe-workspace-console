#!/usr/bin/env python3
"""Capture the Agent UI at the framework breakpoints.

Usage:
  python3 scripts/capture_agent_ui.py --session 345e805f --out-dir .ui-shots

Credentials are read from ~/.apkweb_admin_pw (600) and are never printed.
Requires: httpx, websocket-client, local Google Chrome.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import pathlib
import subprocess
import time
import urllib.request

import httpx
import websocket


def creds() -> dict[str, str]:
    out: dict[str, str] = {}
    p = pathlib.Path.home() / ".apkweb_admin_pw"
    for line in p.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8099")
    ap.add_argument("--session", required=True)
    ap.add_argument("--out-dir", default=".ui-shots")
    ap.add_argument("--widths", default="1722,1440,1280,1024,760")
    ap.add_argument("--report", default="")
    ap.add_argument("--assert", dest="assert_", action="store_true", help="fail on overflow/missing findings/masking/locked switch")
    args = ap.parse_args()

    c = creds()
    tok = httpx.post(args.base + "/api/login",
                     json={"username": c["ADMIN_USER"], "password": c["ADMIN_PASS"]},
                     timeout=15).json()["token"]
    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    chrome = os.environ.get("CHROME_BIN", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    profile = f"/tmp/agent-ui-capture-{os.getpid()}"
    port = 9231
    proc = subprocess.Popen(
        [chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
         f"--remote-debugging-port={port}", "--remote-allow-origins=*",
         f"--user-data-dir={profile}", "--window-size=1722,1007",
         args.base + "/v2/#/agent"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws = None
    try:
        for _ in range(40):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=1)
                break
            except Exception:
                time.sleep(0.25)
        pages = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json"))
        page = next(p for p in pages if p.get("type") == "page")
        ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=20)
        seq = [0]

        def cmd(method: str, params: dict | None = None):
            seq[0] += 1
            mid = seq[0]
            ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
            end = time.time() + 20
            while time.time() < end:
                msg = json.loads(ws.recv())
                if msg.get("id") == mid:
                    return msg
            raise TimeoutError(method)

        cmd("Runtime.enable")
        time.sleep(1)
        # One-time auth bootstrap; token is held only in this process.
        cmd("Runtime.evaluate", {"expression":
            f"localStorage.setItem('token', {json.dumps(tok)}); location.reload();"})
        time.sleep(6)
        r = cmd("Runtime.evaluate", {"expression":
            f"(() => {{ const el=document.querySelector('[data-agent-session-item=\"{args.session}\"]');"
            " if (el) { el.click(); return 'clicked'; } return 'missing'; })()",
            "returnByValue": True})
        if r["result"]["result"].get("value") != "clicked":
            raise RuntimeError("session item not found")
        time.sleep(2)
        cmd("Runtime.evaluate", {"expression":
            "document.querySelector('[data-finding-list]')?.scrollIntoView({block:'start'});"})

        report = []
        for raw in args.widths.split(","):
            w = int(raw.strip())
            h = 1007 if w >= 1600 else (900 if w >= 1400 else (800 if w >= 1200 else (768 if w >= 1000 else 900)))
            cmd("Emulation.setDeviceMetricsOverride",
                {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": False})
            time.sleep(0.8)
            m = cmd("Runtime.evaluate", {"expression":
                "({docW:document.documentElement.scrollWidth,inner:innerWidth,"
                "finding:!!document.querySelector('[data-finding-list]'),"
                "rows:document.querySelectorAll('[data-finding-row]').length})",
                "returnByValue": True})["result"]["result"].get("value") or {}
            m["width"] = w
            shot = cmd("Page.captureScreenshot", {"format": "png", "fromSurface": True})
            p = out_dir / f"agent_ui_{w}.png"
            p.write_bytes(base64.b64decode(shot["result"]["data"]))
            m["path"] = str(p)
            report.append(m)
            print(w, m)
        if args.report:
            pathlib.Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=1),
                                                 encoding="utf-8")
        if args.assert_:
            state = cmd("Runtime.evaluate", {"expression":
                "({masked:document.body.innerText.includes('••'),"
                " quick:document.querySelectorAll('[data-agent-mode-quick]').length,"
                " locked:document.querySelectorAll('[data-agent-mode-locked]').length})",
                "returnByValue": True})["result"]["result"].get("value") or {}
            failures = []
            for m in report:
                if m.get("docW", 0) > m.get("inner", 0):
                    failures.append(f"overflow {m['width']}: {m['docW']} > {m['inner']}")
                if not m.get("finding") or int(m.get("rows") or 0) < 1:
                    failures.append(f"findings missing at {m['width']}")
            if state.get("masked"):
                failures.append("masking marker present")
            if state.get("quick"):
                failures.append("unlocked mode switch present on locked session")
            if state.get("locked", 0) < 1:
                failures.append("locked mode badge missing")
            if failures:
                print("SMOKE FAIL: " + "; ".join(failures))
                return 1
            print("SMOKE OK: no overflow, findings present, raw output, locked mode read-only")
        return 0
    finally:
        if ws is not None:
            try:
                ws.close()
            except Exception:
                pass
        proc.terminate()
        subprocess.run(["pkill", "-f", profile], capture_output=True)


if __name__ == "__main__":
    raise SystemExit(main())
