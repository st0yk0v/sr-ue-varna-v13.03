#!/usr/bin/env python3
"""
Static preflight: every local asset referenced by index.html and precached by
sw.js must exist on disk. Catches path drift (the js/views/... class of bug)
before it 404s in production and blanks the app.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
passed = failed = 0

def check(name, ok, detail=""):
    global passed, failed
    passed, failed = (passed + 1, failed) if ok else (passed, failed + 1)
    print(f"  [{'OK' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))

def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace") as f:
        return f.read()

print("=== Asset path preflight ===\n")

html = read("index.html")
# src="js/..." / href="css|assets|styles..." — local, relative refs only.
refs = sorted(set(re.findall(r'(?:src|href)="((?:js|css|assets)/[^"?#]+|styles[^"?#]*\.css)', html)))
missing = [r for r in refs if not os.path.isfile(os.path.join(ROOT, r))]
check("index.html local assets exist", not missing,
      f"missing: {missing[:6]}" if missing else f"{len(refs)} refs ok")

sw = read("sw.js")
# '/js/foo.js?v=' + BUILD  →  js/foo.js
sw_refs = sorted(set(re.findall(r"'/((?:js|css|assets)/[^'?]+)\?v='", sw)))
sw_missing = [r for r in sw_refs if not os.path.isfile(os.path.join(ROOT, r))]
check("sw.js precache assets exist", not sw_missing,
      f"missing: {sw_missing[:6]}" if sw_missing else f"{len(sw_refs)} refs ok")

# The specific regression that blanked the app.
check("no js/views/ path drift",
      "js/views/proposal-extras.js" not in html and "js/views/proposal-extras.js" not in sw)

# Google auth prerequisites must survive in the shell.
check("GSI loader present", "accounts.google.com/gsi/client" in html)
check("encoded Google Client ID present", "__ERP_GOOGLE_CLIENT_ID_ENCODED" in html)
check("core-bundle decodes Client ID",
      "__ERP_GOOGLE_CLIENT_ID_ENCODED" in read("js/core-bundle.js"))
check("login screen has Google button mount",
      all(s in read("js/views-bundle.js") for s in ["google-signin-wrap", "или влезте с"]))

print(f"\n=== Result: {passed} passed, {failed} failed ===")
sys.exit(0 if failed == 0 else 1)
